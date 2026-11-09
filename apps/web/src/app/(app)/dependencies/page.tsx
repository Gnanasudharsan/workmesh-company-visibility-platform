"use client";

import { Background, BackgroundVariant, Controls, MarkerType, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, OctagonAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { layout, NODE_SIZE } from "@/components/map/layout";
import { NODE_TYPES, type MapNodeData } from "@/components/map/nodes";
import { Badge, StatusBadge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { useApi } from "@/lib/hooks";
import type { ProjectSummary } from "@/lib/types";
import { day } from "@/lib/utils";

interface Explorer {
  nodes: ProjectSummary[];
  edges: Array<{ id: string; upstreamId: string; downstreamId: string; description: string; state: string; isCritical: boolean; needBy: string | null; slackDays: number | null }>;
  impact: { confirmed: Array<{ id: string; reasons: string[] }>; potential: Array<{ id: string; sources: string[]; distance: number; path: string[]; viaCritical: boolean }> };
}

const COLOR: Record<string, string> = { BLOCKED: "#DC2626", AT_RISK: "#D97706", OPEN: "#0891B2", RESOLVED: "#94A3B8" };

function ExplorerInner() {
  const params = useSearchParams();
  const router = useRouter();
  const flow = useReactFlow();
  const [focus, setFocus] = useState(params.get("projectId") ?? "");
  const { data, error, isLoading, refetch } = useApi<Explorer>(`/dependencies${focus ? `?projectId=${focus}` : ""}`);
  const { data: all } = useApi<ProjectSummary[]>("/projects");
  const [graph, setGraph] = useState<{ nodes: Node<MapNodeData>[]; edges: Edge[] }>({ nodes: [], edges: [] });
  const name = useMemo(() => new Map((data?.nodes ?? []).map((n) => [n.id, n.name])), [data]);
  const confirmed = useMemo(() => new Set(data?.impact.confirmed.map((c) => c.id)), [data]);
  const potential = useMemo(() => new Set(data?.impact.potential.map((c) => c.id)), [data]);

  useEffect(() => {
    if (!data) return;
    const size = NODE_SIZE.project!;
    const nodes: Node<MapNodeData>[] = data.nodes.map((p) => ({
      id: p.id,
      type: "project",
      position: { x: 0, y: 0 },
      width: size.width,
      height: size.height,
      style: { width: size.width, height: size.height },
      data: { label: p.name, kind: "project", direction: "right", raw: { ...p, team: p.owningTeam }, selected: p.id === focus, highlighted: confirmed.has(p.id) || potential.has(p.id) },
    }));
    const edges: Edge[] = data.edges.map((e) => ({
      id: e.id,
      source: e.upstreamId,
      target: e.downstreamId,
      animated: e.state === "BLOCKED",
      label: `${e.state === "RESOLVED" ? "resolved" : e.state.toLowerCase().replace("_", " ")}${e.isCritical ? " · critical" : ""}`,
      labelStyle: { fontSize: 10.5, fill: COLOR[e.state], fontWeight: 600 },
      labelBgStyle: { fill: "#fff" },
      style: { stroke: COLOR[e.state], strokeWidth: e.isCritical ? 2.4 : 1.6, strokeDasharray: e.state === "RESOLVED" ? "5 5" : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, color: COLOR[e.state] },
    }));
    void layout(nodes, edges, "right").then((n) => {
      setGraph({ nodes: n, edges });
      requestAnimationFrame(() => flow.fitView({ padding: 0.2, duration: 300, maxZoom: 1.1 }));
    });
  }, [data, focus, confirmed, potential, flow]);

  const pick = (id: string) => {
    setFocus(id);
    router.replace(id ? `/dependencies?projectId=${id}` : "/dependencies", { scroll: false });
  };

  return (
    <>
      <PageHeader
        title="Dependency explorer"
        description="How work across teams waits on other work. Confirmed problems are separated from potential downstream impact — WorkMesh does not predict missed deadlines."
        actions={
          <Select value={focus} onChange={(e) => pick(e.target.value)} className="w-auto min-w-[240px]" aria-label="Focus on a project">
            <option value="">All dependencies</option>
            {all?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        }
      />
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading || !data ? <LoadingCards /> : data.nodes.length === 0 ? <Card><EmptyState title="No dependencies" description="This project neither depends on nor blocks other projects you can see." /></Card> : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="h-[560px] overflow-hidden rounded-[var(--radius-card)] border border-line bg-[#fbfcfe] shadow-card">
            <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={NODE_TYPES} onNodeClick={(_, n) => pick(n.id)} nodesDraggable={false} nodesConnectable={false} minZoom={0.2} proOptions={{ hideAttribution: true }} aria-label="Dependency graph">
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#D7DEEA" />
              <Controls showInteractive={false} position="bottom-left" />
            </ReactFlow>
          </div>
          <aside className="space-y-5">
            <Card>
              <CardHeader icon={<OctagonAlert className="h-4 w-4 text-danger" />} title="Confirmed problems" description="Blocked status, an open high-severity blocker, or a blocked dependency" />
              <CardBody className="space-y-2">
                {data.impact.confirmed.length === 0 && <p className="text-[13px] text-muted">None.</p>}
                {data.impact.confirmed.map((c) => (
                  <button key={c.id} onClick={() => pick(c.id)} className="block w-full rounded-lg border border-danger/15 bg-danger-soft/50 px-3 py-2 text-left">
                    <p className="text-[13px] font-medium">{name.get(c.id)}</p>
                    <p className="text-[12px] text-danger-ink">{c.reasons.join(" · ")}</p>
                  </button>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<AlertTriangle className="h-4 w-4 text-warning" />} title="Potentially impacted downstream" description="Reachable through unresolved dependencies" />
              <CardBody className="space-y-2">
                {data.impact.potential.length === 0 && <p className="text-[13px] text-muted">None.</p>}
                {data.impact.potential.map((p) => (
                  <button key={p.id} onClick={() => pick(p.id)} className="block w-full rounded-lg border border-line px-3 py-2 text-left hover:border-line-strong">
                    <p className="flex items-center gap-2 text-[13px] font-medium">{name.get(p.id)}{p.viaCritical && <Badge tone="danger">Critical path</Badge>}</p>
                    <p className="text-[12px] text-muted">{p.path.map((x) => name.get(x)).join(" → ")}</p>
                  </button>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Dependencies" />
              <CardBody className="space-y-2">
                {data.edges.map((e) => (
                  <Link key={e.id} href={`/projects/${e.downstreamId}?tab=dependencies`} className="block rounded-lg border border-line px-3 py-2 text-[13px] hover:border-line-strong">
                    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate"><strong className="font-medium">{name.get(e.downstreamId)}</strong> ← {name.get(e.upstreamId)}</span><StatusBadge status={e.state} /></div>
                    <p className="text-[12px] text-muted">{e.description}{e.needBy ? ` · needed ${day(e.needBy)}` : ""}{e.slackDays !== null ? ` · ${e.slackDays >= 0 ? `${e.slackDays}d slack` : `${-e.slackDays}d past upstream target`}` : ""}</p>
                  </Link>
                ))}
              </CardBody>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}

export default function DependenciesPage() {
  return (
    <Suspense>
      <ReactFlowProvider>
        <ExplorerInner />
      </ReactFlowProvider>
    </Suspense>
  );
}

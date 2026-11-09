"use client";

import { Background, BackgroundVariant, Controls, MarkerType, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, GitBranch, OctagonAlert, Radiation } from "lucide-react";
import { useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { layout, NODE_SIZE } from "@/components/map/layout";
import { NODE_TYPES, type MapNodeData } from "@/components/map/nodes";
import { Badge, StatusBadge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Segmented, Select } from "@/components/ui/form";
import { HeroMetric } from "@/components/midnight/hero";
import { useApi } from "@/lib/hooks";
import type { ProjectSummary } from "@/lib/types";
import { day } from "@/lib/utils";

interface Explorer {
  nodes: ProjectSummary[];
  edges: Array<{ id: string; upstreamId: string; downstreamId: string; description: string; state: string; isCritical: boolean; needBy: string | null; slackDays: number | null }>;
  impact: { confirmed: Array<{ id: string; reasons: string[] }>; potential: Array<{ id: string; sources: string[]; distance: number; path: string[]; viaCritical: boolean }> };
}

const COLOR: Record<string, string> = { BLOCKED: "#F07167", AT_RISK: "#F4AD69", OPEN: "#5FB7E8", RESOLVED: "#5B7A93" };

function ExplorerInner() {
  const params = useSearchParams();
  const router = useRouter();
  const flow = useReactFlow();
  const [focus, setFocus] = useState(params.get("projectId") ?? "");
  const [mode, setMode] = useState<"explore" | "impact">(params.get("mode") === "impact" ? "impact" : "explore");
  const reduce = useReducedMotion();
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
      data: {
        label: p.name,
        kind: "project",
        direction: "right",
        raw: { ...p, team: p.owningTeam },
        selected: p.id === focus,
        highlighted: confirmed.has(p.id) || potential.has(p.id),
        // Impact mode: only the problems and what they can reach stay lit.
        dimmed: mode === "impact" && !(confirmed.has(p.id) || potential.has(p.id) || p.id === focus),
      },
    }));
    const lit = (e: Explorer["edges"][number]) => e.state !== "RESOLVED" && (confirmed.has(e.upstreamId) || potential.has(e.upstreamId)) && (confirmed.has(e.downstreamId) || potential.has(e.downstreamId));
    const edges: Edge[] = data.edges.map((e) => ({
      id: e.id,
      source: e.upstreamId,
      target: e.downstreamId,
      animated: e.state === "BLOCKED",
      label: `${e.state === "RESOLVED" ? "resolved" : e.state.toLowerCase().replace("_", " ")}${e.isCritical ? " · critical" : ""}`,
      labelStyle: { fontSize: 10.5, fill: COLOR[e.state], fontWeight: 600 },
      labelBgStyle: { fill: "#091B2D" },
      style: { stroke: COLOR[e.state], strokeWidth: (e.isCritical ? 2.4 : 1.6) + (mode === "impact" && lit(e) ? 1 : 0), strokeDasharray: e.state === "RESOLVED" ? "5 5" : undefined, opacity: mode === "impact" && !lit(e) ? 0.18 : 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: COLOR[e.state] },
    }));
    void layout(nodes, edges, "right").then((n) => {
      setGraph({ nodes: n, edges });
      requestAnimationFrame(() => flow.fitView({ padding: 0.2, duration: reduce ? 0 : 300, maxZoom: 1.35 }));
    });
  }, [data, focus, confirmed, potential, flow, mode, reduce]);

  const pick = (id: string) => {
    setFocus(id);
    const q = new URLSearchParams({ ...(id && { projectId: id }), ...(mode === "impact" && { mode }) }).toString();
    router.replace(q ? `/dependencies?${q}` : "/dependencies", { scroll: false });
  };
  const counts = useMemo(() => {
    const c = { BLOCKED: 0, AT_RISK: 0, OPEN: 0, critical: 0 };
    (data?.edges ?? []).forEach((e) => {
      if (e.state in c) c[e.state as "BLOCKED"]++;
      if (e.isCritical && e.state !== "RESOLVED") c.critical++;
    });
    return c;
  }, [data]);

  return (
    <>
      <PageHeader
        eyebrow="Execution"
        title="Dependency explorer"
        description="How work across teams waits on other work. Confirmed problems are separated from potential downstream impact — WorkMesh does not predict missed deadlines."
        actions={
          <>
          <Segmented label="Explorer mode" value={mode} onChange={(m) => { setMode(m); const q = new URLSearchParams({ ...(focus && { projectId: focus }), ...(m === "impact" && { mode: m }) }).toString(); router.replace(q ? `/dependencies?${q}` : "/dependencies", { scroll: false }); }} options={[{ value: "explore", label: "Explore", icon: <GitBranch className="h-3.5 w-3.5" aria-hidden /> }, { value: "impact", label: "Impact", icon: <Radiation className="h-3.5 w-3.5" aria-hidden /> }]} />
          <Select value={focus} onChange={(e) => pick(e.target.value)} className="w-auto min-w-[220px] max-w-[260px]" aria-label="Focus on a project">
            <option value="">All dependencies</option>
            {all?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          </>
        }
      />
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading || !data ? <LoadingCards /> : data.nodes.length === 0 ? <Card><EmptyState title="No dependencies" description="This project neither depends on nor blocks other projects you can see." /></Card> : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="surface-midnight on-navy relative overflow-hidden rounded-[var(--radius-panel)] shadow-raised">
            <div className="grid grid-cols-2 gap-1 border-b border-white/[0.07] px-3 py-2 sm:grid-cols-5">
              <HeroMetric label="Blocked" value={counts.BLOCKED} accent="coral" />
              <HeroMetric label="At risk" value={counts.AT_RISK} accent="amber" />
              <HeroMetric label="Open" value={counts.OPEN} accent="teal" />
              <HeroMetric label="Confirmed problems" value={data.impact.confirmed.length} accent="coral" />
              <HeroMetric label="Potentially impacted" value={data.impact.potential.length} accent="violet" />
            </div>
            {mode === "impact" && <p className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-navy-950/80 px-3 py-1 text-[11.5px] text-navy-muted ring-1 ring-navy-line backdrop-blur max-sm:hidden">Impact mode — only confirmed problems and what they can reach stay lit</p>}
            <div className="h-[540px]">
            <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={NODE_TYPES} onNodeClick={(_, n) => pick(n.id)} nodesDraggable={false} nodesConnectable={false} minZoom={0.2} proOptions={{ hideAttribution: true }} aria-label="Dependency graph">
              <Background variant={BackgroundVariant.Dots} gap={24} size={1.3} color="rgba(155,178,198,0.18)" />
              <Controls showInteractive={false} position="bottom-left" />
            </ReactFlow>
            </div>
          </div>
          <aside className="space-y-5">
            <Card>
              <CardHeader icon={<OctagonAlert className="h-4 w-4 text-danger-ink" />} title="Confirmed problems" description="Blocked status, an open high-severity blocker, or a blocked dependency" />
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
              <CardHeader icon={<AlertTriangle className="h-4 w-4 text-warning-ink" />} title="Potentially impacted downstream" description="Reachable through unresolved dependencies" />
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

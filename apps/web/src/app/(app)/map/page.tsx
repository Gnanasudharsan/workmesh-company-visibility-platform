"use client";

import { label } from "@workmesh/core";
import {
  Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, ChevronsDownUp, ChevronsUpDown, GitBranch, List, Network, Search, Workflow, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { layout, NODE_SIZE, type LayoutKind } from "@/components/map/layout";
import { NODE_TYPES, type MapNodeData } from "@/components/map/nodes";
import { MapList } from "@/components/map/map-list";
import { MapPanel } from "@/components/map/map-panel";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/feedback";
import { Input, Segmented, Select } from "@/components/ui/form";
import { useApi } from "@/lib/hooks";
import type { Graph, GraphNode } from "@/lib/types";
import { cn } from "@/lib/utils";

type Mode = "people" | "work";

const EDGE_STYLE: Record<string, { stroke: string; dash?: string; width?: number; animated?: boolean; label?: string; layoutIgnore?: boolean }> = {
  contains: { stroke: "#CBD5E1" },
  belongs_to: { stroke: "#CBD5E1" },
  leads: { stroke: "#93C5FD", width: 1.6 },
  reports_to: { stroke: "#2563EB", width: 1.6 },
  dotted_line: { stroke: "#7C3AED", dash: "5 5", layoutIgnore: true, label: "dotted line" },
  contributes_to: { stroke: "#C4B5FD", width: 1.6 },
  supports: { stroke: "#CBD5E1" },
  owned_by: { stroke: "#E2E8F0", dash: "3 4", layoutIgnore: true },
  milestone_of: { stroke: "#CBD5E1" },
  depends_on: { stroke: "#D97706", width: 2, layoutIgnore: true },
};

function toFlow(graph: Graph, mode: Mode, direction: LayoutKind, hideTeamsInWork: boolean, openDepartments: Set<string>) {
  const nodes: Node<MapNodeData>[] = graph.nodes
    .filter((n) => !(mode === "work" && hideTeamsInWork && n.type === "team"))
    // Progressive disclosure: teams appear once their department is opened (or they are already expanded).
    .filter((n) => !(mode === "people" && n.type === "team" && !n.data.expanded && !openDepartments.has(String(n.data.departmentId))))
    .map((n) => {
      const size = NODE_SIZE[n.type] ?? NODE_SIZE.person!;
      return {
        id: n.id,
        type: n.type,
        position: { x: 0, y: 0 },
        width: size.width,
        height: size.height,
        style: { width: size.width, height: size.height },
        data: { label: n.label, kind: n.type, raw: { ...n.data, open: n.type === "department" ? openDepartments.has(String(n.data.entityId)) : undefined }, direction: direction === "right" ? "right" : "down" },
      };
    });
  const ids = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = graph.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => {
      const s = EDGE_STYLE[e.type] ?? EDGE_STYLE.contains!;
      const depState = (e.data?.state as string | undefined) ?? "";
      const stroke = e.type === "depends_on" ? (depState === "BLOCKED" ? "#DC2626" : depState === "AT_RISK" ? "#D97706" : "#0891B2") : s.stroke;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type === "depends_on" || e.type === "dotted_line" ? "default" : "smoothstep",
        animated: e.type === "depends_on" && depState === "BLOCKED",
        label: e.type === "depends_on" ? `${depState === "BLOCKED" ? "blocked" : depState === "AT_RISK" ? "at risk" : "depends on"}` : s.label,
        labelStyle: { fontSize: 10.5, fill: stroke, fontWeight: 600 },
        labelBgStyle: { fill: "#fff" },
        labelBgPadding: [4, 2] as [number, number],
        style: { stroke, strokeWidth: s.width ?? 1.3, strokeDasharray: s.dash },
        markerEnd: e.type === "depends_on" || e.type === "reports_to" ? { type: MarkerType.ArrowClosed, color: stroke, width: 16, height: 16 } : undefined,
        data: { kind: e.type, layoutIgnore: s.layoutIgnore },
      } satisfies Edge;
    });
  return { nodes, edges };
}

function MapCanvas() {
  const params = useSearchParams();
  const router = useRouter();
  const flow = useReactFlow();
  const [mode, setMode] = useState<Mode>((params.get("mode") as Mode) === "work" ? "work" : "people");
  const [view, setView] = useState<"graph" | "list">("graph");
  const [direction, setDirection] = useState<LayoutKind>((params.get("mode") as Mode) === "work" ? "down" : "right");
  const [openDepartments, setOpenDepartments] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | null>(params.get("focus"));
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [history, setHistory] = useState<GraphNode[]>([]);
  const [showTeams, setShowTeams] = useState(false);
  const [laidOut, setLaidOut] = useState<{ nodes: Node<MapNodeData>[]; edges: Edge[] }>({ nodes: [], edges: [] });

  const peopleUrl = `/graph/people?expand=${expanded.join(",")}${focus ? `&focus=${focus}` : ""}`;
  const workUrl = `/graph/work?expand=${expandedProjects.join(",")}`;
  const { data: graph, error, isFetching, refetch } = useApi<Graph>(mode === "people" ? peopleUrl : workUrl, { placeholderData: (prev) => prev });
  const { data: departments } = useApi<Array<{ id: string; name: string }>>("/departments");

  // Filters are applied to what the server already authorized — never used to hide secrets.
  const filtered = useMemo<Graph | undefined>(() => {
    if (!graph) return graph;
    let nodes = graph.nodes;
    if (mode === "people" && department) {
      nodes = nodes.filter((n) => n.type === "company" || (n.type === "department" && n.data.entityId === department) || (n.type === "team" && n.data.departmentId === department) || (n.type === "person" && (n.data.departmentId === department || n.data.focused)));
    }
    if (mode === "work" && status) {
      const keep = new Set(nodes.filter((n) => n.type === "project" && (n.data.health === status || n.data.status === status)).map((n) => n.id));
      const parents = new Set(graph.edges.filter((e) => keep.has(e.target) && e.type === "supports").map((e) => e.source));
      const grand = new Set(graph.edges.filter((e) => parents.has(e.target) && e.type === "contributes_to").map((e) => e.source));
      nodes = nodes.filter((n) => keep.has(n.id) || parents.has(n.id) || grand.has(n.id) || (n.type === "milestone" && keep.has(`project:${String(n.data.projectId)}`)));
    }
    const ids = new Set(nodes.map((n) => n.id));
    return { nodes, edges: graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
  }, [graph, mode, department, status]);

  useEffect(() => {
    if (!filtered) return;
    const { nodes, edges } = toFlow(filtered, mode, direction, !showTeams, new Set(department ? [...openDepartments, department] : openDepartments));
    let cancelled = false;
    void layout(nodes, edges, direction).then((positioned) => {
      if (cancelled) return;
      setLaidOut({ nodes: positioned, edges });
      requestAnimationFrame(() => flow.fitView({ padding: 0.15, duration: 400, maxZoom: 1.1 }));
    });
    return () => {
      cancelled = true;
    };
  }, [filtered, mode, direction, showTeams, flow, openDepartments, department]);

  // Highlight the selection and its neighbors; dim the rest.
  const related = useMemo(() => {
    const target = selected?.id ?? (query.trim().length > 1 ? null : null);
    if (!target) return null;
    const set = new Set([target]);
    for (const e of laidOut.edges) {
      if (e.source === target) set.add(e.target);
      if (e.target === target) set.add(e.source);
    }
    return set;
  }, [selected, laidOut.edges, query]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    return new Set(laidOut.nodes.filter((n) => n.data.label.toLowerCase().includes(q) || String(n.data.raw.title ?? "").toLowerCase().includes(q)).map((n) => n.id));
  }, [query, laidOut.nodes]);

  const nodes = useMemo(
    () =>
      laidOut.nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          selected: selected?.id === n.id,
          highlighted: (related?.has(n.id) ?? false) || (matches?.has(n.id) ?? false),
          dimmed: (related ? !related.has(n.id) : false) || (matches ? !matches.has(n.id) : false),
        },
      })),
    [laidOut.nodes, selected, related, matches],
  );
  const edges = useMemo(() => laidOut.edges.map((e) => ({ ...e, style: { ...e.style, opacity: related && !(related.has(e.source) && related.has(e.target)) ? 0.15 : 1 } })), [laidOut.edges, related]);

  const select = useCallback(
    (n: GraphNode | null, push = true) => {
      if (push && selected && n && selected.id !== n.id) setHistory((h) => [...h.slice(-19), selected]);
      setSelected(n);
    },
    [selected],
  );

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      const g = graph?.nodes.find((x) => x.id === node.id) ?? null;
      if (g?.type === "department" && mode === "people") {
        const id = String(g.data.entityId);
        setOpenDepartments((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
      }
      if (g?.type === "team" && mode === "people") {
        const id = String(g.data.entityId);
        setExpanded((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
      }
      select(g);
    },
    [graph, mode, select],
  );

  const jumpToMatch = () => {
    const first = matches && [...matches][0];
    if (!first) return;
    const n = laidOut.nodes.find((x) => x.id === first);
    if (n) flow.setCenter(n.position.x + 110, n.position.y + 40, { zoom: 1.1, duration: 500 });
    select(graph?.nodes.find((x) => x.id === first) ?? null);
  };

  const allTeamIds = (graph?.nodes ?? []).filter((n) => n.type === "team").map((n) => String(n.data.entityId));
  const allDepartmentIds = (graph?.nodes ?? []).filter((n) => n.type === "department").map((n) => String(n.data.entityId));

  return (
    <>
      <PageHeader
        title="Company Map"
        description={mode === "people" ? "How the company is organized: departments, teams, people and reporting lines." : "How work connects: company goals, initiatives, projects, milestones and dependencies."}
        actions={
          <>
            <Segmented label="Map mode" value={mode} onChange={(m) => { setMode(m); setSelected(null); setHistory([]); router.replace(`/map?mode=${m}`); }} options={[{ value: "people", label: "People", icon: <Network className="h-3.5 w-3.5" aria-hidden /> }, { value: "work", label: "Work", icon: <Workflow className="h-3.5 w-3.5" aria-hidden /> }]} />
            <Segmented label="View" value={view} onChange={setView} options={[{ value: "graph", label: "Graph", icon: <GitBranch className="h-3.5 w-3.5" aria-hidden /> }, { value: "list", label: "List", icon: <List className="h-3.5 w-3.5" aria-hidden /> }]} />
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-faint" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && jumpToMatch()} placeholder={mode === "people" ? "Find a person or team…" : "Find a goal or project…"} className="pl-8" aria-label="Search the map" />
          {matches && <span className="absolute right-2.5 top-2 text-[11.5px] text-muted">{matches.size} found</span>}
        </div>
        {mode === "people" ? (
          <Select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-auto min-w-[180px]" aria-label="Filter by department">
            <option value="">All departments</option>
            {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        ) : (
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[180px]" aria-label="Filter by work status">
            <option value="">All statuses</option>
            {["ON_TRACK", "AT_RISK", "OFF_TRACK", "BLOCKED", "NOT_STARTED", "IN_REVIEW", "COMPLETED"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
        )}
        <Select value={direction} onChange={(e) => setDirection(e.target.value as LayoutKind)} className="w-auto max-w-[210px]" aria-label="Graph layout">
          <option value="down">Top-down layout</option>
          <option value="right">Left-to-right layout</option>
          <option value="tree">Compact tree</option>
        </Select>
        {mode === "people" ? (
          <>
            <Button size="sm" onClick={() => { setOpenDepartments(allDepartmentIds); setExpanded(allTeamIds); }}><ChevronsUpDown className="h-3.5 w-3.5" /> Expand all</Button>
            <Button size="sm" onClick={() => { setExpanded([]); setOpenDepartments([]); setFocus(null); }}><ChevronsDownUp className="h-3.5 w-3.5" /> Collapse</Button>
          </>
        ) : (
          <label className="flex items-center gap-1.5 text-[12.5px] text-muted"><input type="checkbox" className="accent-[var(--color-brand)]" checked={showTeams} onChange={(e) => setShowTeams(e.target.checked)} /> Show owning teams</label>
        )}
        {focus && (
          <Button size="sm" variant="soft" onClick={() => setFocus(null)}>Reporting subtree focus <X className="h-3.5 w-3.5" /></Button>
        )}
        {history.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => { const prev = history[history.length - 1]!; setHistory((h) => h.slice(0, -1)); select(prev, false); }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        )}
      </div>

      {error ? <ErrorState error={error} onRetry={refetch} /> : view === "list" ? (
        <MapList graph={filtered} mode={mode} />
      ) : (
        <div className="relative h-[calc(100vh-250px)] min-h-[520px] overflow-hidden rounded-[var(--radius-card)] border border-line bg-[#fbfcfe] shadow-card">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodeClick={onNodeClick}
            onPaneClick={() => select(null, false)}
            nodesDraggable={false}
            nodesConnectable={false}
            minZoom={0.15}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            aria-label={mode === "people" ? "People map" : "Work map"}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#D7DEEA" />
            <Controls showInteractive={false} position="bottom-left" />
            <MiniMap pannable zoomable position="bottom-right" style={{ width: 150, height: 100 }} nodeColor={(n) => (n.type === "goal" ? "#C4B5FD" : n.type === "project" ? "#93C5FD" : n.type === "person" ? "#E2E8F0" : "#CBD5E1")} maskColor="rgba(241,245,249,0.7)" />
          </ReactFlow>
          {isFetching && <div className="absolute left-3 top-3 rounded-md bg-surface px-2 py-1 text-[11.5px] text-muted shadow-card">Updating…</div>}
          <div className="absolute left-3 top-3 hidden flex-wrap gap-2 rounded-lg bg-surface/90 px-2.5 py-1.5 text-[11px] text-muted shadow-card md:flex" aria-hidden={isFetching}>
            {mode === "people" ? (
              <>
                <Legend color="#2563EB" text="Reports to" />
                <Legend color="#7C3AED" text="Dotted line" dashed />
                <span>Click a department, then a team, to reveal people</span>
              </>
            ) : (
              <>
                <Legend color="#C4B5FD" text="Contributes to" />
                <Legend color="#0891B2" text="Depends on" />
                <Legend color="#DC2626" text="Blocked dependency" />
              </>
            )}
          </div>
          <MapPanel
            node={selected && (graph?.nodes.find((n) => n.id === selected.id) ?? selected)}
            graph={graph}
            mode={mode}
            onClose={() => select(null, false)}
            onFocusSubtree={(id) => { setFocus(id); setMode("people"); }}
            onExpandProject={(id) => setExpandedProjects((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))}
            expandedProjects={expandedProjects}
            onSelect={(n) => select(n)}
          />
        </div>
      )}
      <p className="mt-3 text-[12px] text-muted">The map only contains people, teams and work you are authorized to see. <Link href="/privacy" className="font-medium text-brand">How visibility works</Link></p>
    </>
  );
}

function Legend({ color, text, dashed }: { color: string; text: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} /></svg>
      {text}
    </span>
  );
}

export default function MapPage() {
  return (
    <Suspense>
      <ReactFlowProvider>
        <div className={cn("animate-fade-in")}>
          <MapCanvas />
        </div>
      </ReactFlowProvider>
    </Suspense>
  );
}

"use client";

import { label } from "@workmesh/core";
import Link from "next/link";
import type { Graph, GraphNode } from "@/lib/types";
import { Avatar } from "../ui/avatar";
import { HealthBadge, StatusBadge } from "../ui/badges";
import { Card } from "../ui/card";
import { EmptyState } from "../ui/feedback";

/**
 * Accessible textual alternative to the canvas: the same authorized nodes rendered as a
 * nested list (tree semantics), usable with a keyboard or screen reader.
 */
export function MapList({ graph, mode }: { graph?: Graph; mode: "people" | "work" }) {
  if (!graph) return null;
  const children = new Map<string, string[]>();
  const hierarchical = mode === "people" ? ["contains", "belongs_to", "leads"] : ["contributes_to", "supports", "milestone_of"];
  for (const e of graph.edges) {
    if (!hierarchical.includes(e.type)) continue;
    children.set(e.source, [...(children.get(e.source) ?? []), e.target]);
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const hasParent = new Set([...children.values()].flat());
  const roots = graph.nodes.filter((n) => !hasParent.has(n.id) && (mode === "people" ? n.type === "company" : n.type !== "team"));
  if (roots.length === 0) return <Card><EmptyState title="Nothing to show" /></Card>;

  const href = (n: GraphNode) => {
    const id = String(n.data.entityId);
    return { person: `/people/${id}`, team: `/teams/${id}`, department: `/departments/${id}`, project: `/projects/${id}`, goal: `/goals/${id}`, initiative: `/initiatives/${id}`, milestone: `/milestones/${id}`, company: "/directory" }[n.type];
  };

  const render = (id: string, depth: number, seen: Set<string>): React.ReactNode => {
    const n = byId.get(id);
    if (!n || seen.has(id)) return null;
    seen.add(id);
    const kids = children.get(id) ?? [];
    return (
      <li key={id} role="treeitem" aria-expanded={kids.length ? true : undefined} aria-level={depth + 1} className="list-none">
        <Link href={href(n) ?? "#"} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-subtle/70">
          {n.type === "person" ? <Avatar name={n.label} hue={Number(n.data.avatarHue)} size="xs" /> : <span className="w-12 shrink-0 text-[10.5px] font-semibold uppercase tracking-wider text-faint">{label(n.type)}</span>}
          <span className="truncate text-[13px] font-medium">{n.label}</span>
          {n.type === "person" && <span className="truncate text-[12px] text-muted">{String(n.data.title)}</span>}
          {n.type === "project" && <span className="ml-auto flex gap-1.5"><HealthBadge health={String(n.data.health)} /><StatusBadge status={String(n.data.status)} /></span>}
          {n.type === "team" && <span className="ml-auto text-[12px] text-muted">{String(n.data.memberCount)} people{n.data.expanded ? "" : " · expand in graph view"}</span>}
        </Link>
        {kids.length > 0 && (
          <ul role="group" className="ml-4 border-l border-line pl-2">
            {kids.map((k) => render(k, depth + 1, seen))}
          </ul>
        )}
      </li>
    );
  };
  const seen = new Set<string>();
  return (
    <Card className="p-3">
      <ul role="tree" aria-label={mode === "people" ? "Organization hierarchy" : "Goals and work hierarchy"}>
        {roots.map((r) => render(r.id, 0, seen))}
      </ul>
    </Card>
  );
}

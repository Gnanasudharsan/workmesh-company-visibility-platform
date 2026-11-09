import ELK from "elkjs/lib/elk.bundled.js";
import type { Edge, Node } from "@xyflow/react";

export type LayoutKind = "down" | "right" | "tree";

export const NODE_SIZE: Record<string, { width: number; height: number }> = {
  company: { width: 250, height: 76 },
  department: { width: 230, height: 70 },
  team: { width: 220, height: 78 },
  person: { width: 210, height: 62 },
  goal: { width: 260, height: 88 },
  initiative: { width: 240, height: 76 },
  project: { width: 240, height: 92 },
  milestone: { width: 200, height: 56 },
};

const elk = new ELK();

/**
 * Computes positions with ELK. "down"/"right" use the layered algorithm (good for mixed
 * DAGs such as goals → projects with dependency edges); "tree" uses mrtree for compact
 * org-chart style hierarchies.
 */
export async function layout<T extends Record<string, unknown>>(nodes: Node<T>[], edges: Edge[], kind: LayoutKind): Promise<Node<T>[]> {
  const ids = new Set(nodes.map((n) => n.id));
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": kind === "tree" ? "mrtree" : "layered",
      "elk.direction": kind === "right" ? "RIGHT" : "DOWN",
      "elk.spacing.nodeNode": kind === "tree" ? "36" : "28",
      "elk.layered.spacing.nodeNodeBetweenLayers": "72",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.separateConnectedComponents": "true",
      "elk.spacing.componentComponent": "60",
    },
    children: nodes.map((n) => ({ id: n.id, ...(NODE_SIZE[n.type ?? "person"] ?? NODE_SIZE.person) })),
    // Only hierarchical edges drive layout; cross-links (dependencies, dotted lines) are drawn but not ranked.
    edges: edges
      .filter((e) => ids.has(e.source) && ids.has(e.target) && !(e.data as { layoutIgnore?: boolean } | undefined)?.layoutIgnore)
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const result = await elk.layout(graph);
  const pos = new Map((result.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
  return nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? { x: 0, y: 0 } }));
}

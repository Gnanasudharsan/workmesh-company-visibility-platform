/**
 * Cross-project dependency analysis.
 *
 * Edge semantics: `downstream` depends on `upstream` (upstream must deliver first).
 * The dependency graph must be a DAG; edges are validated before insert.
 *
 * Impact analysis distinguishes:
 *  - CONFIRMED: the project itself is blocked (status BLOCKED, an open critical/high blocker,
 *    or a dependency whose state is BLOCKED).
 *  - POTENTIAL: reachable downstream from a confirmed problem through unresolved dependencies.
 *    We never claim a potential impact will cause a missed deadline; we expose the path and
 *    the slack between the upstream target date and the downstream need-by date as evidence.
 *
 * Complexity: BFS over V projects and E unresolved dependencies → O(V + E).
 */

export interface DependencyEdge {
  id: string;
  upstreamId: string;
  downstreamId: string;
  state: "OPEN" | "AT_RISK" | "BLOCKED" | "RESOLVED";
  isCritical: boolean;
}

export function adjacency(edges: DependencyEdge[], opts: { unresolvedOnly?: boolean } = {}) {
  const down = new Map<string, DependencyEdge[]>();
  const up = new Map<string, DependencyEdge[]>();
  for (const e of edges) {
    if (opts.unresolvedOnly && e.state === "RESOLVED") continue;
    (down.get(e.upstreamId) ?? down.set(e.upstreamId, []).get(e.upstreamId)!).push(e);
    (up.get(e.downstreamId) ?? up.set(e.downstreamId, []).get(e.downstreamId)!).push(e);
  }
  return { down, up };
}

/** Would adding upstream → downstream close a cycle? True iff upstream is reachable downstream of `downstream`. */
export function dependencyWouldCreateCycle(edges: DependencyEdge[], upstreamId: string, downstreamId: string) {
  if (upstreamId === downstreamId) return true;
  return downstreamReach(edges, downstreamId).has(upstreamId);
}

/** All projects reachable downstream from `startId`, with the hop distance and the path taken. */
export function downstreamReach(
  edges: DependencyEdge[],
  startId: string,
  opts: { unresolvedOnly?: boolean } = {},
): Map<string, { distance: number; path: string[]; viaCritical: boolean }> {
  const { down } = adjacency(edges, opts);
  const result = new Map<string, { distance: number; path: string[]; viaCritical: boolean }>();
  const queue: Array<{ id: string; path: string[]; critical: boolean }> = [
    { id: startId, path: [startId], critical: false },
  ];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of down.get(cur.id) ?? []) {
      if (e.downstreamId === startId || result.has(e.downstreamId)) continue;
      const path = [...cur.path, e.downstreamId];
      const viaCritical = cur.critical || e.isCritical;
      result.set(e.downstreamId, { distance: path.length - 1, path, viaCritical });
      queue.push({ id: e.downstreamId, path, critical: viaCritical });
    }
  }
  return result;
}

/** All projects upstream of `startId` (what it transitively depends on). */
export function upstreamReach(
  edges: DependencyEdge[],
  startId: string,
  opts: { unresolvedOnly?: boolean } = {},
): Map<string, number> {
  const { up } = adjacency(edges, opts);
  const dist = new Map<string, number>();
  const queue: Array<[string, number]> = [[startId, 0]];
  while (queue.length) {
    const [id, d] = queue.shift()!;
    for (const e of up.get(id) ?? []) {
      if (e.upstreamId === startId || dist.has(e.upstreamId)) continue;
      dist.set(e.upstreamId, d + 1);
      queue.push([e.upstreamId, d + 1]);
    }
  }
  return dist;
}

/** Topological order (Kahn). Returns null if the graph has a cycle. */
export function topologicalOrder(nodeIds: string[], edges: DependencyEdge[]): string[] | null {
  const indeg = new Map<string, number>(nodeIds.map((n) => [n, 0]));
  const { down } = adjacency(edges);
  for (const e of edges) indeg.set(e.downstreamId, (indeg.get(e.downstreamId) ?? 0) + 1);
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([n]) => n);
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const e of down.get(n) ?? []) {
      const d = (indeg.get(e.downstreamId) ?? 0) - 1;
      indeg.set(e.downstreamId, d);
      if (d === 0) queue.push(e.downstreamId);
    }
  }
  return order.length === indeg.size ? order : null;
}

export interface ImpactInput {
  projects: Array<{ id: string; status: string; hasBlockingBlocker: boolean }>;
  edges: DependencyEdge[];
}

export interface ImpactResult {
  /** Projects with a confirmed problem, and why. */
  confirmed: Map<string, string[]>;
  /** Downstream projects potentially impacted: source of impact, distance, path. */
  potential: Map<string, { sources: string[]; distance: number; path: string[]; viaCritical: boolean }>;
}

export function analyzeImpact({ projects, edges }: ImpactInput): ImpactResult {
  const confirmed = new Map<string, string[]>();
  const add = (id: string, reason: string) => {
    const list = confirmed.get(id) ?? [];
    if (!list.includes(reason)) list.push(reason);
    confirmed.set(id, list);
  };
  for (const p of projects) {
    if (p.status === "BLOCKED") add(p.id, "Project status is Blocked");
    if (p.hasBlockingBlocker) add(p.id, "Open high-severity blocker");
  }
  for (const e of edges) {
    if (e.state === "BLOCKED") add(e.downstreamId, "Waiting on a blocked dependency");
  }
  const potential: ImpactResult["potential"] = new Map();
  for (const source of confirmed.keys()) {
    for (const [id, info] of downstreamReach(edges, source, { unresolvedOnly: true })) {
      if (confirmed.has(id)) continue;
      const existing = potential.get(id);
      if (!existing) {
        potential.set(id, { sources: [source], ...info });
      } else {
        existing.sources.push(source);
        if (info.distance < existing.distance) Object.assign(existing, info);
        existing.viaCritical = existing.viaCritical || info.viaCritical;
      }
    }
  }
  return { confirmed, potential };
}

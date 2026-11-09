/**
 * Reporting-hierarchy algorithms.
 *
 * The reporting structure is modelled as a set of directed edges report → manager.
 * For the PRIMARY relationship every person has at most one active manager, so the
 * primary graph is a forest. Dotted-line (indirect/functional) managers and temporary
 * delegations add extra edges; the combined "management" graph is therefore a DAG that we
 * keep acyclic by validating every new edge.
 *
 * Complexity (n = people, e = edges):
 *  - buildIndex: O(e)
 *  - subtree / chain traversal: O(n + e) worst case, BFS with a visited set (robust to bad data)
 *  - wouldCreateCycle: O(n + e) — reachability check from the proposed manager up the chain
 */

export type ReportingEdgeType = "PRIMARY" | "DOTTED";

export interface ReportingEdge {
  reportId: string;
  managerId: string;
  type: ReportingEdgeType;
}

export interface HierarchyIndex {
  /** managerId → direct reports (all edge types) */
  reportsOf: Map<string, Set<string>>;
  /** reportId → managers (all edge types) */
  managersOf: Map<string, Set<string>>;
  /** reportId → primary manager */
  primaryManagerOf: Map<string, string>;
}

export function buildIndex(edges: Iterable<ReportingEdge>): HierarchyIndex {
  const reportsOf = new Map<string, Set<string>>();
  const managersOf = new Map<string, Set<string>>();
  const primaryManagerOf = new Map<string, string>();
  for (const e of edges) {
    if (e.reportId === e.managerId) continue; // never index self-loops
    addTo(reportsOf, e.managerId, e.reportId);
    addTo(managersOf, e.reportId, e.managerId);
    if (e.type === "PRIMARY") primaryManagerOf.set(e.reportId, e.managerId);
  }
  return { reportsOf, managersOf, primaryManagerOf };
}

function addTo(map: Map<string, Set<string>>, key: string, value: string) {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(value);
}

export function directReports(index: HierarchyIndex, managerId: string): string[] {
  return [...(index.reportsOf.get(managerId) ?? [])];
}

/**
 * Everyone below `managerId` (excluding the manager), breadth-first, with their depth.
 * `primaryOnly` restricts traversal to the formal reporting tree.
 */
export function reportingSubtree(
  index: HierarchyIndex,
  managerId: string,
  opts: { primaryOnly?: boolean; maxDepth?: number } = {},
): Map<string, number> {
  const depthOf = new Map<string, number>();
  const queue: Array<[string, number]> = [[managerId, 0]];
  const maxDepth = opts.maxDepth ?? Number.POSITIVE_INFINITY;
  while (queue.length > 0) {
    const [current, depth] = queue.shift()!;
    if (depth >= maxDepth) continue;
    for (const report of index.reportsOf.get(current) ?? []) {
      if (report === managerId || depthOf.has(report)) continue;
      if (opts.primaryOnly && index.primaryManagerOf.get(report) !== current) continue;
      depthOf.set(report, depth + 1);
      queue.push([report, depth + 1]);
    }
  }
  return depthOf;
}

/** The primary management chain from a person up to the root: [manager, manager's manager, ...]. */
export function managementChain(index: HierarchyIndex, personId: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([personId]);
  let current = index.primaryManagerOf.get(personId);
  while (current && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = index.primaryManagerOf.get(current);
  }
  return chain;
}

/** True if `ancestorId` can reach `personId` going down through any management edge. */
export function isInManagementLine(index: HierarchyIndex, ancestorId: string, personId: string): boolean {
  if (ancestorId === personId) return false;
  return reportingSubtree(index, ancestorId).has(personId);
}

/**
 * Would adding edge report → manager create a cycle? A cycle exists iff `report` is already
 * an ancestor of `manager`, i.e. manager is reachable *downwards* from report.
 */
export function wouldCreateCycle(index: HierarchyIndex, reportId: string, managerId: string): boolean {
  if (reportId === managerId) return true;
  return reportingSubtree(index, reportId).has(managerId);
}

/** Detects any cycle in a raw edge list (used to validate imported or bulk data). Returns one cycle path. */
export function findCycle(edges: Iterable<ReportingEdge>): string[] | null {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.reportId) ?? [];
    list.push(e.managerId);
    adj.set(e.reportId, list);
  }
  const WHITE = 0,
    GREY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string>();
  for (const start of adj.keys()) {
    if ((color.get(start) ?? WHITE) !== WHITE) continue;
    // iterative DFS to avoid stack overflows on deep hierarchies
    const stack: Array<[string, number]> = [[start, 0]];
    color.set(start, GREY);
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const [node, i] = top;
      const next = adj.get(node) ?? [];
      if (i < next.length) {
        top[1] = i + 1;
        const nb = next[i]!;
        const c = color.get(nb) ?? WHITE;
        if (c === WHITE) {
          color.set(nb, GREY);
          parent.set(nb, node);
          stack.push([nb, 0]);
        } else if (c === GREY) {
          const cycle = [nb];
          let cur: string | undefined = node;
          while (cur && cur !== nb) {
            cycle.push(cur);
            cur = parent.get(cur);
          }
          cycle.push(nb);
          return cycle.reverse();
        }
      } else {
        color.set(node, BLACK);
        stack.pop();
      }
    }
  }
  return null;
}

export type ReportingValidationError =
  | "SELF_MANAGEMENT"
  | "CYCLE"
  | "UNKNOWN_PERSON"
  | "CROSS_TENANT"
  | "DUPLICATE_PRIMARY"
  | "INACTIVE_PERSON";

export interface PersonRef {
  id: string;
  orgId: string;
  active: boolean;
}

/**
 * Validates a proposed reporting change before it is written.
 * `replacePrimary` = the caller intends to end the report's current primary line (a reorg),
 * so an existing primary manager is not a duplicate.
 */
export function validateReportingChange(args: {
  orgId: string;
  report: PersonRef | undefined;
  manager: PersonRef | undefined;
  type: ReportingEdgeType;
  existing: ReportingEdge[];
  replacePrimary: boolean;
}): ReportingValidationError | null {
  const { report, manager, type, existing, orgId } = args;
  if (!report || !manager) return "UNKNOWN_PERSON";
  if (report.orgId !== orgId || manager.orgId !== orgId) return "CROSS_TENANT";
  if (!report.active || !manager.active) return "INACTIVE_PERSON";
  if (report.id === manager.id) return "SELF_MANAGEMENT";
  const edges = args.replacePrimary
    ? existing.filter((e) => !(e.reportId === report.id && e.type === "PRIMARY"))
    : existing;
  if (type === "PRIMARY" && edges.some((e) => e.reportId === report.id && e.type === "PRIMARY")) {
    return "DUPLICATE_PRIMARY";
  }
  if (wouldCreateCycle(buildIndex(edges), report.id, manager.id)) return "CYCLE";
  return null;
}

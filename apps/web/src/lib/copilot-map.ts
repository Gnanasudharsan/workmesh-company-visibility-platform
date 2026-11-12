import type { CopilotCitation } from "./types";

/** Map node ids the Company Map understands. Anything else in a URL is ignored. */
const NODE_RE = /^(project|goal|initiative|milestone|team|department|person):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_HIGHLIGHTS = 20;

export interface MapLink {
  href: string;
  mode: "work" | "people";
  /** Distinct nodes in the chosen mode. */
  count: number;
  /** Distinct nodes that live on the other map mode. */
  otherCount: number;
}

/**
 * Builds the "Show on map" link for an answer: every cited record's node (records that aren't
 * nodes already point at their project or person), deduplicated, on the map mode that holds most
 * of them — work wins a tie. Only ids go in the URL; the question never does.
 */
export function mapLinkFor(citations: CopilotCitation[]): MapLink | null {
  const targets = citations.map((c) => c.map).filter((t): t is NonNullable<typeof t> => !!t && NODE_RE.test(t.node));
  if (!targets.length) return null;
  const byMode = { work: new Set<string>(), people: new Set<string>() };
  const expand = new Set<string>();
  for (const t of targets) {
    byMode[t.mode].add(t.node);
    if (t.expand && UUID_RE.test(t.expand)) expand.add(t.expand);
  }
  const mode = byMode.work.size >= byMode.people.size ? "work" : "people";
  const other = mode === "work" ? "people" : "work";
  const highlight = [...byMode.work, ...byMode.people].slice(0, MAX_HIGHLIGHTS);
  const params = new URLSearchParams({ mode, highlight: highlight.join(",") });
  if (expand.size) params.set("expand", [...expand].join(","));
  return { href: `/map?${params.toString()}`, mode, count: byMode[mode].size, otherCount: byMode[other].size };
}

/** Node ids from the map's `highlight` parameter: valid ids only, at most MAX_HIGHLIGHTS. */
export function parseHighlight(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((s) => s.trim()).filter((s) => NODE_RE.test(s)))].slice(0, MAX_HIGHLIGHTS);
}

export function parseExpand(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").filter((s) => UUID_RE.test(s)).slice(0, MAX_HIGHLIGHTS);
}

/** Which map mode a node id belongs to. */
export const modeOf = (node: string): "work" | "people" => (/^(team|department|person):/.test(node) ? "people" : "work");

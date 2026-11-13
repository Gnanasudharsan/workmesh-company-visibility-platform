import type { CitationLedger, LedgerRecord } from "./tool-runner";

/** The one answer for "nothing to cite". Identical for missing and restricted records. */
export const STANDARD_ANSWER = "I couldn't find anything about that in WorkMesh.";

/**
 * Where a cited record sits on the Company Map: a node id in the map's own format, the map mode
 * that shows it, and a project to expand for milestones. Records that aren't map nodes (updates,
 * blockers, work items, dependencies, decisions) point at their project, else their person.
 * The map still renders only the server-authorized graph; a target that isn't in it is ignored.
 */
export interface MapTarget {
  mode: "work" | "people";
  node: string;
  expand?: string;
}

export interface Citation {
  n: number;
  type: string;
  id: string;
  title: string;
  href: string;
  map: MapTarget | null;
}

export function mapTarget(r: LedgerRecord): MapTarget | null {
  switch (r.type) {
    case "project":
    case "goal":
    case "initiative":
      return { mode: "work", node: `${r.type}:${r.id}` };
    case "milestone":
      return r.projectId ? { mode: "work", node: `milestone:${r.id}`, expand: r.projectId } : null;
    case "person":
    case "team":
    case "department":
      return { mode: "people", node: `${r.type}:${r.id}` };
    default:
      if (r.projectId) return { mode: "work", node: `project:${r.projectId}` };
      if (r.personId) return { mode: "people", node: `person:${r.personId}` };
      return null;
  }
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** [[project:<uuid>]], tolerating single brackets, spaces and `#` (small models drift). */
const TOKEN = new RegExp(`\\[\\[?\\s*([a-z_]+)\\s*[:#]\\s*(${UUID})\\s*\\]?\\]`, "gi");
/** [[R3]] — the per-request handle shown next to each record — also [R3], [[ref:R3]], [[R3, R5]]. */
const REF_TOKEN = /\[\[?\s*(?:ref\s*[:#]\s*)?(R\d{1,4}(?:\s*[,;]\s*R\d{1,4})*)\s*\]?\]/gi;
const BARE_UUID = new RegExp(UUID, "gi");

/** Web routes for each citable record kind, built on the server — never taken from the model. */
const HREF: Record<string, (r: LedgerRecord) => string | null> = {
  project: (r) => `/projects/${r.id}`,
  person: (r) => `/people/${r.id}`,
  team: (r) => `/teams/${r.id}`,
  department: (r) => `/departments/${r.id}`,
  goal: (r) => `/goals/${r.id}`,
  initiative: (r) => `/initiatives/${r.id}`,
  milestone: (r) => `/milestones/${r.id}`,
  update: (r) => `/updates/${r.id}`,
  blocker: (r) => `/blockers/${r.id}`,
  decision: () => `/decisions`,
  dependency: (r) => (r.projectId ? `/dependencies?projectId=${r.projectId}` : `/dependencies`),
  work_item: (r) => (r.projectId ? `/projects/${r.projectId}` : null),
};

export function hrefFor(r: LedgerRecord): string | null {
  return HREF[r.type]?.(r) ?? null;
}

/**
 * Keeps only citations of records a tool returned during this request, renumbers them [1], [2]…
 * in order of first use, and removes everything else that could smuggle content or ids into the
 * answer: invented or unreturned ids, bare ids, the model's own [n] markers, links, images, HTML.
 * With nothing left to cite, the answer is the standard not-found answer.
 */
export function finalizeAnswer(text: string, ledger: CitationLedger): { answer: string; citations: Citation[]; stripped: number } {
  let stripped = 0;
  const citations: Citation[] = [];
  const numbers = new Map<string, number>();

  let out = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1") // links → their text
    .replace(/<[^>]*>/g, "") // raw HTML
    .replace(/\[\d+\]/g, ""); // markers the model numbered itself

  const cite = (rec: LedgerRecord | undefined): string => {
    const href = rec ? hrefFor(rec) : null;
    if (!rec || !href) {
      stripped++;
      return "";
    }
    const key = `${rec.type}:${rec.id}`;
    let n = numbers.get(key);
    if (!n) {
      n = citations.length + 1;
      numbers.set(key, n);
      citations.push({ n, type: rec.type, id: rec.id, title: rec.title, href, map: mapTarget(rec) });
    }
    return `[${n}]`;
  };
  out = out.replace(REF_TOKEN, (_m, refs: string) => refs.split(/\s*[,;]\s*/).map((r) => cite(ledger.byRef(r))).join(""));
  out = out.replace(TOKEN, (_m, _type: string, id: string) => cite(ledger.byId(id.toLowerCase())));

  out = out.replace(BARE_UUID, () => {
    stripped++;
    return "";
  });

  out = out
    .replace(/(\[\d+\])(?:\s*\1)+/g, "$1") // [1][1] → [1]
    .replace(/[ \t]+([.,;:!?)])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!citations.length) return { answer: STANDARD_ANSWER, citations: [], stripped };
  return { answer: out, citations, stripped };
}

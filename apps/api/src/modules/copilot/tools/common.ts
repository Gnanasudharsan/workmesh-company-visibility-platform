import type { ZodType } from "zod";
import type { ReadApi } from "../facade";

/** Record types a tool may return. Every record carries `type`, `id` and (when citable) `title`. */
export const RECORD_TYPES = ["project", "person", "team", "department", "goal", "initiative", "milestone", "update", "blocker", "decision", "dependency", "work_item", "change"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export interface RecordRef {
  type: RecordType;
  id: string;
  title: string;
}

/**
 * The only "nothing here" result. A missing record and one the viewer may not see both produce
 * exactly this value, so tool output can't be used to probe for confidential records.
 */
export const NOT_FOUND = Object.freeze({ found: false as const });
export type NotFound = typeof NOT_FOUND;

export interface CopilotTool<I = unknown> {
  name: string;
  /** Shown to the model. Describes what the tool answers, never how authorization works. */
  description: string;
  input: ZodType<I>;
  run(api: ReadApi, input: I): Promise<object>;
}

export const defineTool = <I>(tool: CopilotTool<I>) => tool;

/** Employee-written text is bounded so one record can't flood the model's context. Prefix only, no marker. */
export function trunc(s: string | null | undefined, max = 400): string | null {
  if (s === null || s === undefined) return null;
  return s.length > max ? s.slice(0, max) : s;
}

export function ref<T extends RecordType>(type: T, row: { id: string } & ({ name: string } | { title: string }) | null | undefined) {
  if (!row) return null;
  return { type, id: row.id, title: "name" in row ? row.name : row.title };
}

export const person = (p: { id?: string | null; name?: string } | null | undefined) =>
  p && p.id && p.name ? { type: "person" as const, id: p.id, title: p.name } : null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

/**
 * Resolves a project by id, key or name using the existing full-text search, which only ever
 * returns projects the viewer may see. Exact name/key matches win; otherwise the best hit.
 */
export async function resolveProject(api: ReadApi, value: string): Promise<string | null> {
  if (isUuid(value)) return value;
  const { results } = await api.search(value, ["projects"], 6);
  const rows = results.projects as Array<{ id: string; name: string; key: string }>;
  const v = value.trim().toLowerCase();
  return (rows.find((p) => p.name.toLowerCase() === v || p.key.toLowerCase() === v) ?? rows[0])?.id ?? null;
}

/** Resolves a person by id, "me", or name through the existing people search. */
export async function resolvePerson(api: ReadApi, value: string): Promise<string | null> {
  if (isUuid(value)) return value;
  const v = value.trim().toLowerCase();
  if (["me", "myself", "i"].includes(v)) return api.self();
  const { results } = await api.search(value, ["people"], 6);
  const rows = results.people as Array<{ id: string; name: string }>;
  return (rows.find((p) => p.name.toLowerCase() === v) ?? rows[0])?.id ?? null;
}

export const DAY = 86_400_000;
export const RISKY_HEALTH = ["AT_RISK", "OFF_TRACK", "BLOCKED"];

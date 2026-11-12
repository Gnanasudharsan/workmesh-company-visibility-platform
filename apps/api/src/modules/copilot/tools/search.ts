import { z } from "zod";
import { SEARCH_TYPES, type SearchType } from "../../search/search.service";
import type { ReadApi } from "../facade";
import { defineTool, NOT_FOUND, person, ref, trunc } from "./common";

type Lite = { id: string; name: string; title: string };
type Rows = {
  people: Lite[];
  teams: Array<{ id: string; name: string; mission: string | null }>;
  departments: Array<{ id: string; name: string; description: string | null }>;
  projects: Array<{ id: string; name: string; key: string; status: string; summary: string | null }>;
  goals: Array<{ id: string; title: string; status: string }>;
  initiatives: Array<{ id: string; title: string; status: string }>;
  milestones: Array<{ id: string; title: string; status: string; projectId: string; dueDate: Date | null }>;
  updates: Array<{ id: string; currentFocus: string; stage: string; publishedAt: Date | null; author: Lite | null }>;
  blockers: Array<{ id: string; title: string; state: string; severity: string }>;
  decisions: Array<{ id: string; title: string; status: string }>;
};

const query = z.string().trim().min(1).max(100);

/** Flattens the existing search response into typed records, dropping nothing but presentation fields. */
function flatten(results: Record<string, unknown[]>) {
  const r = results as Partial<Rows>;
  return [
    ...(r.projects ?? []).map((p) => ({ ...ref("project", p), key: p.key, status: p.status, summary: trunc(p.summary, 300) })),
    ...(r.people ?? []).map((p) => ({ ...ref("person", p), jobTitle: p.title })),
    ...(r.teams ?? []).map((t) => ({ ...ref("team", t), mission: trunc(t.mission, 300) })),
    ...(r.departments ?? []).map((d) => ({ ...ref("department", d), description: trunc(d.description, 300) })),
    ...(r.goals ?? []).map((g) => ({ ...ref("goal", g), status: g.status })),
    ...(r.initiatives ?? []).map((i) => ({ ...ref("initiative", i), status: i.status })),
    ...(r.milestones ?? []).map((m) => ({ ...ref("milestone", m), status: m.status, dueDate: m.dueDate, projectId: m.projectId })),
    ...(r.updates ?? []).map((u) => ({ type: "update" as const, id: u.id, title: trunc(u.currentFocus, 160)!, stage: u.stage, publishedAt: u.publishedAt, author: person(u.author) })),
    ...(r.blockers ?? []).map((b) => ({ ...ref("blocker", b), state: b.state, severity: b.severity })),
    ...(r.decisions ?? []).map((d) => ({ ...ref("decision", d), status: d.status })),
  ];
}

export const searchRecords = defineTool({
  name: "search_records",
  description:
    "Full-text search across WorkMesh records (projects, people, teams, departments, goals, initiatives, milestones, updates, blockers, decisions). Use it to find the id of something mentioned by name.",
  input: z.strictObject({
    query: query.describe("Words to search for, e.g. a project or person name"),
    types: z
      .array(z.enum(SEARCH_TYPES as [SearchType, ...SearchType[]]))
      .min(1)
      .max(SEARCH_TYPES.length)
      .optional()
      .describe("Limit the search to these record kinds"),
  }),
  async run(api: ReadApi, input) {
    const { results } = await api.search(input.query, input.types ?? SEARCH_TYPES, 6);
    const records = flatten(results);
    return records.length ? { found: true, results: records } : NOT_FOUND;
  },
});

export const findHelpers = defineTool({
  name: "find_helpers",
  description:
    "Find who owns or can help with a topic: matching people (with their responsibilities), teams (with mission, lead and contact) and projects (with lead and team).",
  input: z.strictObject({ topic: query.describe("The topic, e.g. 'payments' or 'pricing'") }),
  async run(api: ReadApi, input) {
    const { results } = await api.search(input.topic, ["people", "teams", "projects"], 5);
    const r = results as Partial<Rows>;
    const [people, teams, projects] = await Promise.all([
      Promise.all((r.people ?? []).slice(0, 3).map((p) => api.person(p.id))),
      Promise.all((r.teams ?? []).slice(0, 3).map((t) => api.team(t.id))),
      Promise.all((r.projects ?? []).slice(0, 3).map((p) => api.project(p.id))),
    ]);
    if (!people.length && !teams.length && !projects.length) return NOT_FOUND;
    return {
      found: true,
      people: people.map((p) => ({
        ...ref("person", p),
        jobTitle: p.title,
        responsibilities: p.responsibilities.slice(0, 8),
        teams: p.teams.map((t) => ref("team", t)),
      })),
      teams: teams.map((t) => ({
        ...ref("team", t),
        mission: trunc(t.mission, 300),
        responsibilities: t.responsibilities.slice(0, 8),
        contact: trunc(t.contact, 200),
        lead: person(t.lead),
        department: ref("department", t.department),
      })),
      projects: projects.map((p) => ({ ...ref("project", p), status: p.status, lead: person(p.lead), team: ref("team", p.owningTeam) })),
    };
  },
});

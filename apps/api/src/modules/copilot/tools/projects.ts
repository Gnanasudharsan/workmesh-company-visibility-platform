import { z } from "zod";
import type { ReadApi } from "../facade";
import { DAY, defineTool, NOT_FOUND, person, ref, resolveProject, trunc } from "./common";

const projectInput = z.strictObject({ project: z.string().trim().min(1).max(120).describe("Project name, key or id") });

type Lite = { id: string; name: string } | null;
interface MilestoneRow {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  isCritical: boolean;
  owner: Lite;
}
interface MemberRow {
  id?: string;
  name?: string;
  role: string;
}

const projectRef = (p: { id: string; name: string; owningTeam?: { id: string; name: string } | null }) => ({ ...ref("project", p), team: ref("team", p.owningTeam ?? null) });

type Api = ReadApi;

function headline(p: { id: string; name: string; key: string; status: string; health: string; healthReasons: string[]; targetDate: Date | null }) {
  return {
    ...ref("project", p),
    key: p.key,
    status: p.status,
    health: p.health,
    healthReasons: p.healthReasons,
    targetDate: p.targetDate,
  };
}

type Edge = Awaited<ReturnType<Api["dependencies"]>>["edges"][number];

function edgeRecord(e: Edge, nodes: Map<string, { id: string; name: string; owningTeam: { id: string; name: string } | null }>) {
  const up = nodes.get(e.upstreamId);
  const down = nodes.get(e.downstreamId);
  return {
    type: "dependency" as const,
    id: e.id,
    title: trunc(e.description, 200)!,
    state: e.state,
    isCritical: e.isCritical,
    needBy: e.needBy,
    // Evidence, not a prediction: days between the upstream target date and the need-by date.
    slackDays: e.slackDays,
    owner: person(e.owner),
    upstream: up ? projectRef(up) : null,
    downstream: down ? projectRef(down) : null,
    crossTeam: !!up && !!down && up.owningTeam?.id !== down.owningTeam?.id,
  };
}

export const getProject = defineTool({
  name: "get_project",
  description: "Status, health and its reasons, lead, team, initiative, target date, milestones and members of one project.",
  input: projectInput,
  async run(api: Api, input) {
    const id = await resolveProject(api, input.project);
    if (!id) return NOT_FOUND;
    const p = await api.project(id);
    const milestones = p.milestoneList as MilestoneRow[];
    const members = p.members as MemberRow[];
    return {
      found: true,
      project: {
        ...headline(p),
        summary: trunc(p.summary, 300),
        description: trunc(p.description, 600),
        priority: p.priority,
        startDate: p.startDate,
        computedProgress: p.computedProgress,
        reportedProgress: p.reportedProgress,
        team: ref("team", p.owningTeam),
        lead: person(p.lead),
        initiative: ref("initiative", p.initiative),
        milestones: milestones.slice(0, 12).map((m) => ({ ...ref("milestone", m), status: m.status, dueDate: m.dueDate, isCritical: m.isCritical, owner: person(m.owner) })),
        members: members
          .filter((m): m is MemberRow & { id: string; name: string } => !!m.id && !!m.name)
          .slice(0, 15)
          .map((m) => ({ ...person(m)!, role: m.role })),
      },
    };
  },
});

export const projectBlockers = defineTool({
  name: "project_blockers",
  description:
    "What is blocking a project: its open blockers (severity, state, owner, age) and the unresolved upstream dependencies it is waiting on.",
  input: projectInput,
  async run(api: Api, input) {
    const id = await resolveProject(api, input.project);
    if (!id) return NOT_FOUND;
    const p = await api.project(id);
    const [blockers, deps] = await Promise.all([api.blockers({ projectId: id, open: true }), api.dependencies(id)]);
    const nodes = new Map(deps.nodes.map((n) => [n.id, n]));
    return {
      found: true,
      project: headline(p),
      openBlockers: blockers.slice(0, 20).map((b) => ({
        ...ref("blocker", b),
        description: trunc(b.description),
        severity: b.severity,
        state: b.state,
        owner: person(b.owner),
        reporter: person(b.reporter),
        ageDays: b.ageDays,
        targetDate: b.targetDate,
      })),
      waitingOn: deps.edges.filter((e) => e.downstreamId === id && e.state !== "RESOLVED").map((e) => edgeRecord(e, nodes)),
    };
  },
});

export const projectDependencies = defineTool({
  name: "project_dependencies",
  description:
    "Dependencies around a project: upstream work it needs and downstream work that needs it, which are cross-team, their state and slack evidence, plus confirmed problems and potentially impacted projects.",
  input: projectInput,
  async run(api: Api, input) {
    const id = await resolveProject(api, input.project);
    if (!id) return NOT_FOUND;
    const deps = await api.dependencies(id);
    const nodes = new Map(deps.nodes.map((n) => [n.id, n]));
    const focus = nodes.get(id);
    if (!focus) return NOT_FOUND;
    const node = (pid: string) => {
      const n = nodes.get(pid);
      return n ? projectRef(n) : null;
    };
    return {
      found: true,
      project: { ...headline(focus), team: ref("team", focus.owningTeam) },
      dependencies: deps.edges.slice(0, 30).map((e) => ({ ...edgeRecord(e, nodes), direction: e.downstreamId === id ? "upstream" : e.upstreamId === id ? "downstream" : "indirect" })),
      confirmedProblems: deps.impact.confirmed.map((c) => ({ project: node(c.id), reasons: c.reasons })),
      potentiallyImpacted: deps.impact.potential.map((p) => ({ project: node(p.id), distance: p.distance, viaCritical: p.viaCritical, sources: p.sources.map(node).filter(Boolean) })),
    };
  },
});

export const projectChanges = defineTool({
  name: "project_changes",
  description: "What changed on a project recently: field changes (status, dates, milestones, work items), published progress updates and blockers opened or resolved.",
  input: z.strictObject({
    project: projectInput.shape.project,
    sinceDays: z.number().int().min(1).max(30).default(7).describe("Look-back window in days (default 7)"),
  }),
  async run(api: Api, input) {
    const id = await resolveProject(api, input.project);
    if (!id) return NOT_FOUND;
    const since = new Date(Date.now() - input.sinceDays * DAY);
    const p = await api.project(id);
    const [activity, updates, blockers] = await Promise.all([
      // Field-level history is part of project details; summary viewers get none, as in the app.
      p.access === "details" ? api.projectActivity(id) : Promise.resolve([]),
      api.updates({ projectId: id, since, limit: 20 }),
      api.blockers({ projectId: id }),
    ]);
    return {
      found: true,
      project: headline(p),
      sinceDays: input.sinceDays,
      changes: activity
        .filter((c) => c.createdAt >= since)
        .slice(0, 30)
        .map((c) => ({ type: "change" as const, id: c.id, entityType: c.entityType, entityId: c.entityId, field: c.field, from: c.fromValue, to: c.toValue, at: c.createdAt, actor: person(c.actor) })),
      updates: updates.map((u) => ({
        type: "update" as const,
        id: u.id,
        title: trunc(u.currentFocus, 160)!,
        stage: u.stage,
        completed: trunc(u.completed),
        nextSteps: trunc(u.nextSteps),
        helpNeeded: trunc(u.helpNeeded),
        publishedAt: u.publishedAt,
        author: person(u.author),
      })),
      blockers: blockers
        .filter((b) => b.createdAt >= since || (b.resolvedAt && b.resolvedAt >= since))
        .slice(0, 20)
        .map((b) => ({ ...ref("blocker", b), state: b.state, severity: b.severity, createdAt: b.createdAt, resolvedAt: b.resolvedAt, owner: person(b.owner) })),
    };
  },
});

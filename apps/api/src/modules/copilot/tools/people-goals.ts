import { z } from "zod";
import type { ReadApi } from "../facade";
import { defineTool, NOT_FOUND, person, ref, resolvePerson, RISKY_HEALTH, trunc } from "./common";

export const personWork = defineTool({
  name: "person_work",
  description:
    "What a person is working on: their role, teams and manager, the projects they're on, open work items assigned to them, and their recent published progress updates. Describes work only.",
  input: z.strictObject({ person: z.string().trim().min(1).max(120).describe("Person name or id, or 'me' for the signed-in user") }),
  async run(api: ReadApi, input) {
    const id = await resolvePerson(api, input.person);
    if (!id) return NOT_FOUND;
    const p = await api.person(id);
    return {
      found: true,
      person: {
        ...ref("person", p),
        jobTitle: p.title,
        location: p.location,
        responsibilities: p.responsibilities.slice(0, 10),
        teams: p.teams.map((t) => ref("team", t)),
        manager: person(p.manager),
        projects: p.projects.slice(0, 15).map((pr) => ({ ...ref("project", pr), status: pr.status, health: pr.health, role: pr.role })),
        assignments: p.assignments.slice(0, 20).map((a) => ({
          ...ref("work_item", a),
          status: a.status,
          dueDate: a.dueDate,
          project: ref("project", a.project),
          milestone: ref("milestone", a.milestone),
        })),
        recentUpdates: p.recentUpdates.map((u) => ({
          type: "update" as const,
          id: u.id,
          title: trunc(u.currentFocus, 160)!,
          stage: u.stage,
          completed: trunc(u.completed),
          nextSteps: trunc(u.nextSteps),
          helpNeeded: trunc(u.helpNeeded),
          publishedAt: u.publishedAt,
          project: ref("project", u.project),
        })),
      },
    };
  },
});

export const goalsAtRisk = defineTool({
  name: "goals_at_risk",
  description:
    "Company goals with their progress and how many of their projects are at risk, off track or blocked, listing each such project with the health reasons WorkMesh computed.",
  input: z.strictObject({}),
  async run(api: ReadApi) {
    const tree = await api.goalTree();
    if (!tree.goals.length) return NOT_FOUND;
    const goals = tree.goals.map((g) => ({
      ...ref("goal", g),
      status: g.status,
      period: g.period,
      progress: g.progress,
      projectCount: g.projectCount,
      atRisk: g.atRisk,
      blocked: g.blocked,
      owner: person(g.owner),
      projectsAtRisk: g.initiatives.flatMap((i) =>
        i.projects
          .filter((p) => RISKY_HEALTH.includes(p.health))
          .map((p) => ({ ...ref("project", p), health: p.health, healthReasons: p.healthReasons, targetDate: p.targetDate, initiative: ref("initiative", i) })),
      ),
    }));
    goals.sort((a, b) => b.atRisk + b.blocked - (a.atRisk + a.blocked));
    return { found: true, goals };
  },
});

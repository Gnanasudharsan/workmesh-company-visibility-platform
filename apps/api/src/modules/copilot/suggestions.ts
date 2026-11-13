import { Injectable } from "@nestjs/common";
import { authorizedWorkspaces, type AuthContext, type Workspace } from "@workmesh/core";
import { PeopleService } from "../org/people.service";
import { ProjectsService } from "../work/projects.service";

const DONE = ["COMPLETED", "CANCELLED"];
const RISKY = ["AT_RISK", "OFF_TRACK", "BLOCKED"];

/**
 * Suggested questions per workspace, filled in from what the viewer already sees: their own
 * projects, the projects they lead, visible at-risk projects, their direct reports and team.
 * Built from the same authorized presenters as every page, and only for workspaces the server
 * granted — so a suggestion never names something the viewer couldn't open.
 */
@Injectable()
export class CopilotSuggestions {
  constructor(
    private readonly projects: ProjectsService,
    private readonly people: PeopleService,
  ) {}

  async forViewer(ctx: AuthContext): Promise<Partial<Record<Workspace, string[]>>> {
    const [visible, people] = await Promise.all([this.projects.list(ctx), this.people.all()]);
    const active = visible.filter((p) => !DONE.includes(p.status));
    const mine = active.filter((p) => p.myRole);
    const led = mine.find((p) => p.myRole === "LEAD");
    const myProject = mine[0] ?? active[0];
    const risky = active.find((p) => RISKY.includes(p.health));
    const report = [...ctx.directReportIds].map((id) => people.get(id)).find((p) => p?.active);
    const team = people.get(ctx.membershipId)?.teams[0]?.name;

    const all: Record<Workspace, Array<string | false | undefined>> = {
      employee: ["What am I working on?", myProject && `What's blocking ${myProject.name}?`, myProject && `What changed on ${myProject.name} this week?`, team && `Who can help with ${team}?`],
      manager: [report && `What is ${report.name} working on?`, risky && `What's blocking ${risky.name}?`, "Which goals are at risk and why?", myProject && `What changed on ${myProject.name} this week?`],
      lead: [led && `What's blocking ${led.name}?`, led && `Which cross-team dependencies could delay ${led.name}?`, led && `What changed on ${led.name} this week?`, "Which goals are at risk and why?"],
      leadership: ["Which goals are at risk and why?", risky && `Which cross-team dependencies could delay ${risky.name}?`, risky && `What's blocking ${risky.name}?`, risky && `What changed on ${risky.name} this week?`],
      admin: ["Which goals are at risk and why?", team && `Who can help with ${team}?`, "Who can help with onboarding?", "What am I working on?"],
    };
    const out: Partial<Record<Workspace, string[]>> = {};
    for (const ws of authorizedWorkspaces(ctx)) out[ws] = all[ws].filter((q): q is string => !!q).slice(0, 4);
    return out;
  }
}

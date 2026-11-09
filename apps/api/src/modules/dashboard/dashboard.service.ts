import { Injectable } from "@nestjs/common";
import { can, updateFreshness, type AuthContext } from "@workmesh/core";
import { currentStore } from "../../common/context";
import { Db } from "../../common/db.service";
import { forbidden } from "../../common/errors";
import { MeetingsService } from "../meetings/meetings.service";
import { PeopleService } from "../org/people.service";
import { detailIds } from "../policy/authz.types";
import { BlockersService } from "../updates/blockers.service";
import { UpdatesService } from "../updates/updates.service";
import { GoalsService } from "../work/goals.service";
import { ItemsService } from "../work/items.service";
import { ProjectsService } from "../work/projects.service";

const DAY = 86_400_000;

/**
 * Workspace aggregations. Each dashboard is built from the same authorized services the rest
 * of the API uses — there is no separate "dashboard data path" with weaker checks.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly db: Db,
    private readonly people: PeopleService,
    private readonly projects: ProjectsService,
    private readonly items: ItemsService,
    private readonly updates: UpdatesService,
    private readonly blockers: BlockersService,
    private readonly goals: GoalsService,
    private readonly meetings: MeetingsService,
  ) {}

  private scope() {
    return currentStore()!.scope!;
  }

  async employee(ctx: AuthContext) {
    const now = new Date();
    const people = await this.people.all();
    const me = people.get(ctx.membershipId)!;
    const [assignments, projects, myUpdates, drafts, myBlockers, teamActivity, actionItems, tree] = await Promise.all([
      this.items.assignedTo(ctx.membershipId),
      this.projects.list(ctx, { mine: true }),
      this.updates.list(ctx, { authorId: ctx.membershipId, limit: 5 }),
      this.updates.list(ctx, { drafts: true, limit: 5 }),
      this.blockers.list(ctx, { scope: "mine", open: true }),
      this.updates.list(ctx, { since: new Date(now.getTime() - 14 * DAY), limit: 30 }),
      this.meetings.myActionItems(ctx),
      this.goals.tree(ctx),
    ]);
    const myProjectIds = new Set(projects.map((p) => p.id));
    const milestones = await this.db.tx.milestone.findMany({
      where: { projectId: { in: [...myProjectIds] }, status: { in: ["PLANNED", "IN_PROGRESS"] }, dueDate: { lte: new Date(now.getTime() + 30 * DAY) } },
      include: { project: { select: { id: true, name: true, key: true } } },
      orderBy: { dueDate: "asc" },
      take: 8,
    });
    const last = myUpdates[0] ?? null;
    const contributions = tree.goals
      .map((g) => ({ id: g.id, title: g.title, progress: g.progress, projects: g.initiatives.flatMap((i) => i.projects).filter((p) => myProjectIds.has(p.id)).map((p) => ({ id: p.id, name: p.name, initiative: p.initiative?.title })) }))
      .filter((g) => g.projects.length > 0);
    return {
      me: { id: me.id, name: me.name, title: me.title },
      manager: this.people.liteOf(people.get(me.managerId ?? "")),
      lastUpdate: last,
      freshness: updateFreshness(last?.publishedAt ?? null, now),
      suggestedNextStep: last?.nextSteps ?? assignments[0]?.title ?? null,
      currentStage: last?.stage ?? null,
      drafts,
      assignments: assignments.map((a) => ({ id: a.id, title: a.title, status: a.status, priority: a.priority, dueDate: a.dueDate, project: a.project, milestone: a.milestone, version: a.version })),
      projects,
      blockers: myBlockers,
      teamActivity: teamActivity.filter((u) => u.author?.id !== ctx.membershipId && ctx.teammateIds.has(u.author?.id ?? "")).slice(0, 8),
      upcomingMilestones: milestones,
      actionItems,
      goalContributions: contributions,
      helpers: [me.managerId, ...projects.map((p) => p.lead?.id)].filter((x, i, a): x is string => !!x && x !== ctx.membershipId && a.indexOf(x) === i).slice(0, 4).map((id) => this.people.liteOf(people.get(id))),
    };
  }

  async manager(ctx: AuthContext, f: { teamId?: string; projectId?: string; memberId?: string; status?: string; sinceDays?: number }) {
    if (ctx.managedMemberIds.size === 0) throw forbidden("Team Pulse is available to people with reports");
    const now = new Date();
    const people = await this.people.all();
    const org = await this.db.tx.organization.findUnique({ where: { id: ctx.orgId }, select: { staleAfterDays: true } });
    const staleDays = org?.staleAfterDays ?? 7;
    const managed = [...ctx.managedMemberIds].filter((id) => people.get(id)?.active);
    const since = new Date(now.getTime() - (f.sinceDays ?? 30) * DAY);
    const details = detailIds(this.scope());

    const [updates, openBlockers, workItems, projectMembers, queue] = await Promise.all([
      this.db.tx.progressUpdate.findMany({ where: { AND: [this.updates.visibilityWhere(ctx), { status: "PUBLISHED", authorId: { in: managed }, publishedAt: { gte: since } }] }, orderBy: { publishedAt: "desc" } }),
      this.db.tx.blocker.findMany({ where: { AND: [this.blockers.visibilityWhere(ctx), { reporterId: { in: managed }, state: { not: "RESOLVED" } }] } }),
      this.db.tx.workItem.findMany({ where: { assigneeId: { in: managed }, projectId: { in: details }, status: { notIn: ["DONE", "CANCELLED"] } }, include: { project: { select: { id: true, name: true, key: true } }, milestone: { select: { id: true, title: true, dueDate: true } } }, orderBy: [{ status: "asc" }, { dueDate: "asc" }] }),
      this.db.tx.projectMember.findMany({ where: { membershipId: { in: managed }, projectId: { in: details } }, select: { projectId: true, membershipId: true } }),
      this.blockers.list(ctx, { scope: "queue" }),
    ]);
    const visibleUpdates = updates.filter((u) => this.updates.canView(ctx, u));
    const visibleBlockers = openBlockers.filter((b) => this.blockers.canView(ctx, b));

    let reports = managed.map((id) => {
      const p = people.get(id)!;
      const latest = visibleUpdates.find((u) => u.authorId === id) ?? null;
      const items = workItems.filter((w) => w.assigneeId === id);
      const primary = items.find((w) => w.status === "IN_PROGRESS") ?? items[0] ?? null;
      const blockers = visibleBlockers.filter((b) => b.reporterId === id);
      const nextMilestone = items.map((w) => w.milestone).filter((m) => m?.dueDate).sort((a, b) => a!.dueDate!.getTime() - b!.dueDate!.getTime())[0] ?? null;
      const ageDays = latest?.publishedAt ? Math.floor((now.getTime() - latest.publishedAt.getTime()) / DAY) : null;
      return {
        person: { ...this.people.liteOf(p), teams: p.teams, isDirect: ctx.directReportIds.has(id), managerId: p.managerId },
        primaryAssignment: primary && { id: primary.id, title: primary.title, status: primary.status, project: primary.project },
        openAssignments: items.length,
        latestUpdate: latest && { id: latest.id, stage: latest.stage, currentFocus: latest.currentFocus, nextSteps: latest.nextSteps, helpNeeded: latest.helpNeeded, publishedAt: latest.publishedAt, projectId: latest.projectId },
        freshness: ageDays !== null && ageDays > staleDays ? "EARLIER" : updateFreshness(latest?.publishedAt ?? null, now),
        nextMilestone,
        blockers: blockers.map((b) => ({ id: b.id, title: b.title, severity: b.severity, state: b.state, ownerId: b.ownerId })),
        helpRequested: !!latest?.helpNeeded,
        projectIds: projectMembers.filter((m) => m.membershipId === id).map((m) => m.projectId),
      };
    });
    if (f.teamId) reports = reports.filter((r) => r.person.teams.some((t) => t.id === f.teamId));
    if (f.projectId) reports = reports.filter((r) => r.projectIds.includes(f.projectId!));
    if (f.memberId) reports = reports.filter((r) => r.person.id === f.memberId);
    if (f.status === "blocked") reports = reports.filter((r) => r.blockers.length > 0);
    if (f.status === "help") reports = reports.filter((r) => r.helpRequested);
    if (f.status === "stale") reports = reports.filter((r) => r.freshness === "EARLIER" || r.freshness === "NONE");
    reports.sort((a, b) => Number(b.person.isDirect) - Number(a.person.isDirect) || (a.person.name ?? "").localeCompare(b.person.name ?? ""));

    const teamProjectIds = [...new Set(projectMembers.map((m) => m.projectId))];
    const [activeProjects, deadlines, deps, decisions, meetings] = await Promise.all([
      this.projects.list(ctx).then((ps) => ps.filter((p) => teamProjectIds.includes(p.id) && !["COMPLETED", "CANCELLED"].includes(p.status))),
      this.db.tx.milestone.findMany({ where: { projectId: { in: teamProjectIds }, status: { in: ["PLANNED", "IN_PROGRESS"] }, dueDate: { lte: new Date(now.getTime() + 21 * DAY) } }, include: { project: { select: { id: true, name: true } } }, orderBy: { dueDate: "asc" }, take: 10 }),
      this.db.tx.dependency.findMany({ where: { downstreamProjectId: { in: teamProjectIds }, state: { not: "RESOLVED" } } }),
      this.meetings.decisionLog(ctx),
      this.meetings.list(ctx, { upcoming: true }),
    ]);
    const visible = this.scope().projectAccess;
    const pname = new Map(activeProjects.map((p) => [p.id, p.name]));
    const allProjects = await this.db.tx.project.findMany({ where: { id: { in: deps.map((d) => d.upstreamProjectId).filter((id) => visible.has(id)) } }, select: { id: true, name: true } });
    for (const p of allProjects) pname.set(p.id, p.name);
    return {
      summary: {
        people: reports.length,
        direct: reports.filter((r) => r.person.isDirect).length,
        openBlockers: visibleBlockers.length,
        helpRequests: reports.filter((r) => r.helpRequested).length,
        noRecentUpdate: reports.filter((r) => r.freshness === "EARLIER" || r.freshness === "NONE").length,
        staleAfterDays: staleDays,
      },
      reports,
      blockerQueue: queue.filter((b) => b.state !== "RESOLVED"),
      activeProjects,
      upcomingDeadlines: deadlines,
      dependencies: deps
        .filter((d) => visible.has(d.upstreamProjectId))
        .map((d) => ({ id: d.id, state: d.state, isCritical: d.isCritical, description: d.description, needBy: d.needBy, upstream: { id: d.upstreamProjectId, name: pname.get(d.upstreamProjectId) }, downstream: { id: d.downstreamProjectId, name: pname.get(d.downstreamProjectId) } })),
      recentDecisions: decisions.slice(0, 6),
      pendingDecisions: decisions.filter((d) => d.status === "PENDING").slice(0, 6),
      upcomingMeetings: meetings.slice(0, 5),
      waitingForReview: workItems.filter((w) => w.status === "IN_REVIEW").map((w) => ({ id: w.id, title: w.title, project: w.project, assignee: this.people.liteOf(people.get(w.assigneeId ?? "")) })),
    };
  }

  async lead(ctx: AuthContext) {
    const projects = (await this.projects.list(ctx)).filter((p) => p.myRole === "LEAD" || (p.owningTeam && ctx.ledTeamIds.has(p.owningTeam.id) && p.access === "details"));
    const ids = projects.map((p) => p.id);
    const [updates, blockers, milestones, members] = await Promise.all([
      this.db.tx.progressUpdate.findMany({ where: { AND: [this.updates.visibilityWhere(ctx), { status: "PUBLISHED", projectId: { in: ids } }] }, orderBy: { publishedAt: "desc" }, take: 40 }),
      this.blockers.list(ctx, { open: true }).then((bs) => bs.filter((b) => b.project && ids.includes(b.project.id))),
      this.db.tx.milestone.findMany({ where: { projectId: { in: ids }, status: { in: ["PLANNED", "IN_PROGRESS"] } }, include: { project: { select: { id: true, name: true } } }, orderBy: { dueDate: "asc" }, take: 12 }),
      this.db.tx.projectMember.findMany({ where: { projectId: { in: ids } } }),
    ]);
    const people = await this.people.all();
    const latestByContributor = new Map<string, (typeof updates)[number]>();
    for (const u of updates.filter((x) => this.updates.canView(ctx, x))) if (!latestByContributor.has(u.authorId)) latestByContributor.set(u.authorId, u);
    return {
      projects,
      contributors: [...new Set(members.map((m) => m.membershipId))].filter((id) => id !== ctx.membershipId).map((id) => {
        const u = latestByContributor.get(id);
        return {
          person: this.people.liteOf(people.get(id)),
          reportsToMe: ctx.directReportIds.has(id),
          projects: members.filter((m) => m.membershipId === id).map((m) => projects.find((p) => p.id === m.projectId)?.name).filter(Boolean),
          latestUpdate: u && { id: u.id, stage: u.stage, currentFocus: u.currentFocus, publishedAt: u.publishedAt, helpNeeded: u.helpNeeded },
          freshness: updateFreshness(u?.publishedAt ?? null, new Date()),
        };
      }),
      blockers,
      milestones,
    };
  }

  async leadership(ctx: AuthContext, sinceDays = 14) {
    const now = new Date();
    const since = new Date(now.getTime() - sinceDays * DAY);
    const [tree, projects, depts, teams, decisions] = await Promise.all([
      this.goals.tree(ctx),
      this.projects.list(ctx),
      this.db.tx.department.findMany({ include: { teams: { select: { id: true } } }, orderBy: { name: "asc" } }),
      this.db.tx.team.findMany({ include: { members: { where: { endedAt: null, role: "LEAD" } } } }),
      this.meetings.decisionLog(ctx, "PENDING"),
    ]);
    const ids = projects.map((p) => p.id);
    const [statusChanges, criticalMilestones, unownedBlockers, deps] = await Promise.all([
      this.db.tx.changeEvent.findMany({ where: { entityType: "PROJECT", field: "status", projectId: { in: ids }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 30 }),
      this.db.tx.milestone.findMany({ where: { projectId: { in: detailIds(this.scope()) }, isCritical: true, status: { in: ["PLANNED", "IN_PROGRESS"] } }, include: { project: { select: { id: true, name: true } } }, orderBy: { dueDate: "asc" }, take: 10 }),
      this.blockers.list(ctx, { open: true }).then((bs) => bs.filter((b) => !b.owner && (b.severity === "HIGH" || b.severity === "CRITICAL"))),
      this.db.tx.dependency.findMany({ where: { state: { not: "RESOLVED" } } }),
    ]);
    const byId = new Map(projects.map((p) => [p.id, p]));
    const teamDept = new Map(depts.flatMap((d) => d.teams.map((t) => [t.id, d.id] as const)));
    const health = (ps: typeof projects) => ({
      total: ps.length,
      onTrack: ps.filter((p) => p.health === "ON_TRACK").length,
      atRisk: ps.filter((p) => p.health === "AT_RISK").length,
      offTrack: ps.filter((p) => p.health === "OFF_TRACK").length,
      blocked: ps.filter((p) => p.health === "BLOCKED").length,
      notStarted: ps.filter((p) => p.health === "NOT_STARTED").length,
      done: ps.filter((p) => p.health === "DONE").length,
    });
    const visibleDeps = deps.filter((d) => byId.has(d.upstreamProjectId) && byId.has(d.downstreamProjectId));
    return {
      goals: tree.goals.map((g) => ({ id: g.id, title: g.title, status: g.status, period: g.period, progress: g.progress, projectCount: g.projectCount, atRisk: g.atRisk, blocked: g.blocked, owner: g.owner, initiatives: g.initiatives.map((i) => ({ id: i.id, title: i.title, progress: i.progress, projectCount: i.projectCount, atRisk: i.atRisk })) })),
      portfolioHealth: health(projects.filter((p) => !["COMPLETED", "CANCELLED"].includes(p.status))),
      departments: depts.map((d) => ({ id: d.id, name: d.name, color: d.color, ...health(projects.filter((p) => p.owningTeam && teamDept.get(p.owningTeam.id) === d.id && !["COMPLETED", "CANCELLED"].includes(p.status))) })),
      risks: projects
        .filter((p) => ["AT_RISK", "OFF_TRACK", "BLOCKED"].includes(p.health))
        .map((p) => ({ id: p.id, name: p.name, health: p.health, reasons: p.healthReasons, team: p.owningTeam, lead: p.lead, targetDate: p.targetDate, access: p.access })),
      criticalMilestones,
      pendingDecisions: decisions.slice(0, 8),
      ownershipGaps: {
        projectsWithoutLead: projects.filter((p) => !p.lead && !["COMPLETED", "CANCELLED"].includes(p.status)).map((p) => ({ id: p.id, name: p.name })),
        teamsWithoutLead: teams.filter((t) => t.members.length === 0).map((t) => ({ id: t.id, name: t.name })),
        unownedSeriousBlockers: unownedBlockers.map((b) => ({ id: b.id, title: b.title, severity: b.severity, project: b.project, ageDays: b.ageDays })),
        initiativesWithoutProjects: tree.goals.flatMap((g) => g.initiatives).filter((i) => i.projectCount === 0).map((i) => ({ id: i.id, title: i.title })),
      },
      crossInitiativeDependencies: visibleDeps
        .filter((d) => byId.get(d.upstreamProjectId)?.initiative?.id !== byId.get(d.downstreamProjectId)?.initiative?.id)
        .map((d) => ({ id: d.id, state: d.state, isCritical: d.isCritical, upstream: { id: d.upstreamProjectId, name: byId.get(d.upstreamProjectId)!.name, initiative: byId.get(d.upstreamProjectId)!.initiative?.title ?? null }, downstream: { id: d.downstreamProjectId, name: byId.get(d.downstreamProjectId)!.name, initiative: byId.get(d.downstreamProjectId)!.initiative?.title ?? null } })),
      changesSinceReview: { since, statusChanges: statusChanges.map((c) => ({ projectId: c.projectId, name: byId.get(c.projectId)?.name, from: c.fromValue, to: c.toValue, at: c.createdAt })) },
    };
  }

  async admin(ctx: AuthContext) {
    if (!can(ctx, "org.manageMembers").allow) throw forbidden("Administrators only");
    const people = await this.people.all();
    const [pending, deactivated, teams, audit] = await Promise.all([
      this.db.tx.invitation.count({ where: { status: "PENDING", expiresAt: { gt: new Date() } } }),
      this.db.tx.membership.count({ where: { status: "DEACTIVATED" } }),
      this.db.tx.team.findMany({ include: { members: { where: { endedAt: null } } } }),
      this.db.tx.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    const active = [...people.values()].filter((p) => p.active);
    return {
      members: active.length,
      deactivated,
      pendingInvitations: pending,
      teams: teams.length,
      teamsWithoutLead: teams.filter((t) => !t.members.some((m) => m.role === "LEAD")).map((t) => ({ id: t.id, name: t.name })),
      peopleWithoutManager: active.filter((p) => !p.managerId && p.role !== "OWNER").map((p) => this.people.liteOf(p)),
      peopleWithoutTeam: active.filter((p) => p.teams.length === 0).map((p) => this.people.liteOf(p)),
      roles: { OWNER: active.filter((p) => p.role === "OWNER").length, ADMIN: active.filter((p) => p.role === "ADMIN").length, EXECUTIVE: active.filter((p) => p.role === "EXECUTIVE").length, MEMBER: active.filter((p) => p.role === "MEMBER").length },
      recentAudit: audit.map((a) => ({ ...a, actor: this.people.liteOf(people.get(a.actorId ?? "")) })),
    };
  }
}

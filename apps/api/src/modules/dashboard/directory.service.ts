import { Injectable } from "@nestjs/common";
import { buildIndex, canViewMemberWork, managementChain, updateFreshness, type AuthContext } from "@workmesh/core";
import { Db } from "../../common/db.service";
import { notFound } from "../../common/errors";
import { OrgService } from "../org/org.service";
import { PeopleService } from "../org/people.service";
import { UpdatesService } from "../updates/updates.service";
import { ItemsService } from "../work/items.service";
import { ProjectsService } from "../work/projects.service";

/**
 * Directory views. Structural information (who's who, teams, responsibilities, contacts) is
 * organization-visible so anyone can discover the company. Work information on these pages
 * is filtered by the same policies as everywhere else.
 */
@Injectable()
export class DirectoryService {
  constructor(
    private readonly db: Db,
    private readonly people: PeopleService,
    private readonly org: OrgService,
    private readonly projects: ProjectsService,
    private readonly items: ItemsService,
    private readonly updates: UpdatesService,
  ) {}

  async person(ctx: AuthContext, id: string) {
    const people = await this.people.all();
    const p = people.get(id);
    if (!p) throw notFound("Person");
    const [profile, lines] = await Promise.all([
      this.db.tx.employeeProfile.findUnique({ where: { membershipId: id } }),
      this.db.tx.reportingLine.findMany({ where: { endedAt: null }, select: { reportId: true, managerId: true, type: true } }),
    ]);
    const idx = buildIndex(lines);
    const visibleProjects = (await this.projects.list(ctx)).filter((proj) => proj.lead?.id === id);
    const memberProjectIds = await this.db.tx.projectMember.findMany({ where: { membershipId: id }, select: { projectId: true, role: true } });
    const allVisible = await this.projects.list(ctx);
    const projects = allVisible
      .filter((proj) => memberProjectIds.some((m) => m.projectId === proj.id))
      .map((proj) => ({ id: proj.id, name: proj.name, key: proj.key, status: proj.status, health: proj.health, access: proj.access, role: memberProjectIds.find((m) => m.projectId === proj.id)?.role }));
    const canSeeWork = canViewMemberWork(ctx, id).allow;
    const [recentUpdates, assignments] = await Promise.all([
      this.updates.list(ctx, { authorId: id, limit: 5 }),
      canSeeWork ? this.items.assignedTo(id) : Promise.resolve([]),
    ]);
    return {
      ...p,
      bio: profile?.bio ?? null,
      timezone: profile?.timezone ?? null,
      responsibilities: profile?.responsibilities ?? [],
      contact: profile?.contact ?? null,
      manager: this.people.liteOf(people.get(p.managerId ?? "")),
      chain: managementChain(idx, id).map((m) => this.people.liteOf(people.get(m))).filter(Boolean),
      directReports: [...(idx.reportsOf.get(id) ?? [])].map((r) => {
        const line = lines.find((l) => l.reportId === r && l.managerId === id);
        return { ...this.people.liteOf(people.get(r)), dotted: line?.type === "DOTTED" };
      }).filter((r) => r.id),
      projects,
      leads: visibleProjects.map((proj) => ({ id: proj.id, name: proj.name })),
      recentUpdates,
      assignments: assignments.map((a) => ({ id: a.id, title: a.title, status: a.status, dueDate: a.dueDate, project: a.project, milestone: a.milestone })),
      canSeeWork,
      isMe: id === ctx.membershipId,
    };
  }

  async team(ctx: AuthContext, id: string) {
    const team = await this.db.tx.team.findUnique({ where: { id }, include: { department: true } });
    if (!team) throw notFound("Team");
    const people = await this.people.all();
    const members = [...people.values()]
      .filter((p) => p.active && p.teams.some((t) => t.id === id))
      .map((p) => ({ ...this.people.liteOf(p), role: p.teams.find((t) => t.id === id)!.role, managerId: p.managerId }));
    const projects = await this.projects.list(ctx, { teamId: id });
    const goalIds = new Set(projects.map((p) => p.initiative?.goalId).filter(Boolean) as string[]);
    const goals = await this.db.tx.companyGoal.findMany({ where: { id: { in: [...goalIds] } }, select: { id: true, title: true, status: true } });
    return {
      id: team.id,
      name: team.name,
      mission: team.mission,
      responsibilities: team.responsibilities,
      contact: team.contact,
      docsUrl: team.docsUrl,
      department: team.department && { id: team.department.id, name: team.department.name, color: team.department.color },
      lead: members.find((m) => m.role === "LEAD") ?? null,
      members,
      projects,
      goals,
      canManage: ctx.ledTeamIds.has(id) || ctx.role === "ADMIN" || ctx.role === "OWNER" || (!!team.departmentId && ctx.headedDepartmentIds.has(team.departmentId)),
      isMember: ctx.teamIds.has(id),
    };
  }

  async department(ctx: AuthContext, id: string) {
    const depts = await this.org.departments();
    const d = depts.find((x) => x.id === id);
    if (!d) throw notFound("Department");
    const teams = (await this.org.teams()).filter((t) => t.department?.id === id);
    const teamIds = new Set(teams.map((t) => t.id));
    const projects = (await this.projects.list(ctx)).filter((p) => p.owningTeam && teamIds.has(p.owningTeam.id));
    return { ...d, teams, projects };
  }

  /** Everything a new employee needs to orient themselves. */
  async onboarding(ctx: AuthContext) {
    const me = await this.person(ctx, ctx.membershipId);
    const people = await this.people.all();
    const primaryTeam = me.primaryTeamId ? await this.team(ctx, me.primaryTeamId) : null;
    const dept = me.departmentId ? await this.department(ctx, me.departmentId) : null;
    const goals = await this.db.tx.companyGoal.findMany({ where: { status: "ACTIVE", visibility: "ORG" }, select: { id: true, title: true, period: true }, take: 8 });
    const org = await this.db.tx.organization.findUnique({ where: { id: ctx.orgId }, select: { name: true } });
    return {
      organization: org,
      me: { id: me.id, name: me.name, title: me.title, role: me.role, responsibilities: me.responsibilities },
      manager: me.manager,
      team: primaryTeam && { id: primaryTeam.id, name: primaryTeam.name, mission: primaryTeam.mission, members: primaryTeam.members.slice(0, 12), lead: primaryTeam.lead },
      directReports: me.directReports,
      projects: me.projects,
      assignments: me.assignments,
      departmentWork: dept?.projects.filter((p) => p.access === "details" || p.access === "summary").slice(0, 8) ?? [],
      goals,
      peopleCount: [...people.values()].filter((p) => p.active).length,
    };
  }

  async completeOnboarding(ctx: AuthContext) {
    await this.db.tx.membership.update({ where: { id: ctx.membershipId }, data: { onboardedAt: new Date() } });
    return { ok: true };
  }

  freshness(at: Date | null) {
    return updateFreshness(at, new Date());
  }
}

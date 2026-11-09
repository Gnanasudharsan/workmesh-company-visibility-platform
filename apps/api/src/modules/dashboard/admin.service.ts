import { Injectable } from "@nestjs/common";
import {
  authorizedWorkspaces,
  can,
  canEditProject,
  canManageBlocker,
  canManageProject,
  canManageTeamMembership,
  canViewBlocker,
  canViewMeeting,
  canViewMemberWork,
  canViewUpdate,
  projectAccess,
  type AuthContext,
  type Decision,
} from "@workmesh/core";
import { currentStore } from "../../common/context";
import { Db } from "../../common/db.service";
import { forbidden, notFound } from "../../common/errors";
import { PeopleService } from "../org/people.service";
import { AuthzService } from "../policy/authz.service";

@Injectable()
export class AdminService {
  constructor(
    private readonly db: Db,
    private readonly people: PeopleService,
    private readonly authz: AuthzService,
  ) {}

  async audit(ctx: AuthContext, f: { cursor?: string; action?: string; resourceType?: string; limit?: number }) {
    if (!can(ctx, "org.viewAudit").allow) throw forbidden("Administrators only");
    const rows = await this.db.tx.auditEvent.findMany({
      where: {
        ...(f.action ? { action: { startsWith: f.action } } : {}),
        ...(f.resourceType ? { resourceType: f.resourceType } : {}),
        ...(f.cursor ? { createdAt: { lt: new Date(f.cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(f.limit ?? 50, 200),
    });
    const people = await this.people.all();
    return {
      items: rows.map((r) => ({ ...r, actor: this.people.liteOf(people.get(r.actorId ?? "")) })),
      nextCursor: rows.length === (f.limit ?? 50) ? rows[rows.length - 1]!.createdAt.toISOString() : null,
    };
  }

  /**
   * Explains what a member can do with a resource, using the real policy engine with the
   * member's real AuthContext. The administrator can only inspect resources they can see
   * themselves, so the inspector cannot be used to discover confidential records.
   */
  async inspect(ctx: AuthContext, memberId: string, resourceType: "project" | "update" | "blocker" | "meeting" | "member" | "team", resourceId: string) {
    if (!can(ctx, "org.inspectPermissions").allow) throw forbidden("Administrators only");
    const myScope = currentStore()!.scope!;
    const membership = await this.db.tx.membership.findUnique({ where: { id: memberId } });
    if (!membership) throw notFound("Member");
    const target = await this.authz.load(ctx.orgId, memberId, membership.userId);
    if (!target) throw notFound("Member");
    const { ctx: t, scope: ts } = target;
    const checks: Array<{ capability: string } & Decision> = [];
    const push = (capability: string, d: Decision) => checks.push({ capability, ...d });
    const level = (pid: string | null) => (pid ? (ts.projectAccess.get(pid) ?? "none") : null);

    switch (resourceType) {
      case "project": {
        if (!myScope.projectAccess.has(resourceId)) throw notFound("Project");
        const p = await this.db.tx.project.findUnique({ where: { id: resourceId }, include: { owningTeam: { select: { departmentId: true } } } });
        if (!p) throw notFound("Project");
        const res = { id: p.id, orgId: p.organizationId, visibility: p.visibility, discoverable: p.discoverable, owningTeamId: p.owningTeamId, owningDepartmentId: p.owningTeam?.departmentId ?? null, leadId: p.leadId };
        const a = projectAccess(t, res);
        push("project.viewSummary", { allow: a.level !== "none", reason: a.reason });
        push("project.viewDetails", { allow: a.level === "details", reason: a.reason });
        push("project.edit", canEditProject(t, res));
        push("project.manage", canManageProject(t, res));
        break;
      }
      case "update": {
        const u = await this.db.tx.progressUpdate.findUnique({ where: { id: resourceId } });
        if (!u || u.status === "DRAFT" || u.visibility === "PRIVATE") throw notFound("Update");
        if (u.projectId && myScope.projectAccess.get(u.projectId) !== "details") throw notFound("Update");
        const res = { id: u.id, orgId: u.organizationId, authorId: u.authorId, status: u.status, visibility: u.visibility, projectId: u.projectId };
        push("update.view", canViewUpdate(t, res, level(u.projectId)));
        push("update.edit", u.authorId === t.membershipId ? { allow: true, reason: "Author" } : { allow: false, reason: "Only the author can edit an update" });
        break;
      }
      case "blocker": {
        const b = await this.db.tx.blocker.findUnique({ where: { id: resourceId } });
        if (!b || (b.projectId && myScope.projectAccess.get(b.projectId) !== "details")) throw notFound("Blocker");
        const res = { id: b.id, orgId: b.organizationId, reporterId: b.reporterId, ownerId: b.ownerId, projectId: b.projectId, visibility: b.visibility };
        push("blocker.view", canViewBlocker(t, res, level(b.projectId)));
        push("blocker.manage", canManageBlocker(t, res, b.projectId ? (ts.projects.get(b.projectId) ?? null) : null));
        break;
      }
      case "meeting": {
        const m = await this.db.tx.meeting.findUnique({ where: { id: resourceId }, include: { participants: true } });
        if (!m) throw notFound("Meeting");
        const res = { id: m.id, orgId: m.organizationId, organizerId: m.organizerId, participantIds: m.participants.map((p) => p.membershipId), visibility: m.visibility, teamId: m.teamId };
        if (!canViewMeeting(ctx, res).allow) throw notFound("Meeting");
        push("meeting.view", canViewMeeting(t, res));
        break;
      }
      case "member":
        push("member.viewWork", canViewMemberWork(t, resourceId));
        break;
      case "team": {
        const team = await this.db.tx.team.findUnique({ where: { id: resourceId } });
        if (!team) throw notFound("Team");
        push("team.manageMembers", canManageTeamMembership(t, { id: team.id, departmentId: team.departmentId, orgId: team.organizationId }));
        break;
      }
    }
    for (const cap of ["org.manageMembers", "org.manageReporting", "org.viewAudit"] as const) push(cap, can(t, cap));
    const people = await this.people.all();
    return {
      member: this.people.liteOf(people.get(memberId)),
      role: t.role,
      active: t.active,
      workspaces: authorizedWorkspaces(t),
      relationships: { teams: t.teamIds.size, ledTeams: t.ledTeamIds.size, directReports: t.directReportIds.size, managed: t.managedMemberIds.size, projects: t.projectRoles.size, grants: t.grants.size },
      checks,
    };
  }
}

import { ConflictException, Injectable } from "@nestjs/common";
import {
  buildIndex,
  can,
  canChangeRole,
  canManageTeamMembership,
  managementChain,
  reportingSubtree,
  validateReportingChange,
  type AuthContext,
  type OrgRole,
  type ReportingEdgeType as ReportingType,
} from "@workmesh/core";
import { AuditService } from "../../common/audit.service";
import { Db } from "../../common/db.service";
import { forbidden, invalid, notFound } from "../../common/errors";
import { AuthzService } from "../policy/authz.service";
import { PeopleService } from "./people.service";

const REPORTING_ERRORS: Record<string, string> = {
  SELF_MANAGEMENT: "A person cannot manage themselves.",
  CYCLE: "This change would create a circular reporting chain.",
  UNKNOWN_PERSON: "Both people must exist in this organization.",
  CROSS_TENANT: "People must belong to this organization.",
  DUPLICATE_PRIMARY: "This person already has a primary manager.",
  INACTIVE_PERSON: "Both people must be active members.",
};

@Injectable()
export class OrgService {
  constructor(
    private readonly db: Db,
    private readonly people: PeopleService,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------- directory ------------------------------- */

  async departments() {
    const [depts, people] = await Promise.all([
      this.db.tx.department.findMany({ include: { teams: { select: { id: true, name: true, slug: true } } }, orderBy: { name: "asc" } }),
      this.people.all(),
    ]);
    return depts.map((d) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
      description: d.description,
      color: d.color,
      head: this.people.liteOf(people.get(d.headId ?? "")),
      teams: d.teams,
      memberCount: [...people.values()].filter((p) => p.active && p.departmentId === d.id).length,
    }));
  }

  async teams() {
    const [teams, people] = await Promise.all([
      this.db.tx.team.findMany({ include: { department: { select: { id: true, name: true, color: true } } }, orderBy: { name: "asc" } }),
      this.people.all(),
    ]);
    return teams.map((t) => {
      const members = [...people.values()].filter((p) => p.active && p.teams.some((x) => x.id === t.id));
      const lead = members.find((p) => p.teams.some((x) => x.id === t.id && x.role === "LEAD"));
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        mission: t.mission,
        responsibilities: t.responsibilities,
        department: t.department,
        lead: this.people.liteOf(lead),
        memberCount: members.length,
      };
    });
  }

  async chart() {
    const [people, depts, teams] = await Promise.all([this.people.all(), this.departments(), this.teams()]);
    return {
      people: [...people.values()]
        .filter((p) => p.active)
        .map((p) => ({ id: p.id, name: p.name, title: p.title, avatarHue: p.avatarHue, managerId: p.managerId, primaryTeamId: p.primaryTeamId, departmentId: p.departmentId, role: p.role })),
      departments: depts,
      teams,
    };
  }

  /* -------------------------------- reporting ------------------------------- */

  private async activeLines() {
    return this.db.tx.reportingLine.findMany({ where: { endedAt: null } });
  }

  async subtree(memberId: string) {
    const lines = await this.activeLines();
    const idx = buildIndex(lines.map((l) => ({ reportId: l.reportId, managerId: l.managerId, type: l.type })));
    const people = await this.people.all();
    if (!people.has(memberId)) throw notFound("Person");
    const depth = reportingSubtree(idx, memberId);
    return {
      root: this.people.liteOf(people.get(memberId)),
      chain: managementChain(idx, memberId).map((id) => this.people.liteOf(people.get(id))).filter(Boolean),
      members: [...depth.entries()]
        .map(([id, d]) => {
          const p = people.get(id);
          const line = lines.find((l) => l.reportId === id && idx.reportsOf.get(l.managerId)?.has(id));
          return p && { ...this.people.liteOf(p), depth: d, managerId: p.managerId, viaDottedLine: line?.type === "DOTTED" };
        })
        .filter(Boolean),
    };
  }

  async reportingHistory(memberId: string) {
    const lines = await this.db.tx.reportingLine.findMany({
      where: { OR: [{ reportId: memberId }, { managerId: memberId }] },
      orderBy: { startedAt: "desc" },
    });
    const people = await this.people.all();
    return lines.map((l) => ({
      id: l.id,
      type: l.type,
      report: this.people.liteOf(people.get(l.reportId)),
      manager: this.people.liteOf(people.get(l.managerId)),
      startedAt: l.startedAt,
      endedAt: l.endedAt,
      reason: l.reason,
    }));
  }

  async setManager(ctx: AuthContext, input: { reportId: string; managerId: string; type: ReportingType; reason?: string | null }) {
    if (!can(ctx, "org.manageReporting").allow) throw forbidden("Only administrators can change reporting lines");
    const [lines, report, manager] = await Promise.all([
      this.activeLines(),
      this.db.tx.membership.findUnique({ where: { id: input.reportId } }),
      this.db.tx.membership.findUnique({ where: { id: input.managerId } }),
    ]);
    const asRef = (m: typeof report) => (m ? { id: m.id, orgId: m.organizationId, active: m.status === "ACTIVE" } : undefined);
    const error = validateReportingChange({
      orgId: this.db.orgId,
      report: asRef(report),
      manager: asRef(manager),
      type: input.type,
      existing: lines.map((l) => ({ reportId: l.reportId, managerId: l.managerId, type: l.type })),
      replacePrimary: input.type === "PRIMARY",
    });
    if (error) throw invalid(error, REPORTING_ERRORS[error] ?? error);
    if (lines.some((l) => l.reportId === input.reportId && l.managerId === input.managerId && l.type === input.type))
      throw new ConflictException({ code: "DUPLICATE", message: "This reporting line already exists." });

    const previous = lines.find((l) => l.reportId === input.reportId && l.type === "PRIMARY");
    if (input.type === "PRIMARY" && previous) {
      await this.db.tx.reportingLine.update({ where: { id: previous.id }, data: { endedAt: new Date() } });
    }
    const line = await this.db.tx.reportingLine.create({
      data: {
        organizationId: this.db.orgId,
        reportId: input.reportId,
        managerId: input.managerId,
        type: input.type,
        reason: input.reason ?? null,
        createdById: ctx.membershipId,
      },
    });
    await this.authz.bump();
    await this.audit.record("reporting.changed", "membership", input.reportId, {
      type: input.type,
      before: previous && input.type === "PRIMARY" ? { managerId: previous.managerId } : null,
      after: { managerId: input.managerId },
      reason: input.reason ?? null,
    });
    return line;
  }

  async endReportingLine(ctx: AuthContext, lineId: string) {
    if (!can(ctx, "org.manageReporting").allow) throw forbidden("Only administrators can change reporting lines");
    const line = await this.db.tx.reportingLine.findUnique({ where: { id: lineId } });
    if (!line || line.endedAt) throw notFound("Active reporting line");
    await this.db.tx.reportingLine.update({ where: { id: lineId }, data: { endedAt: new Date() } });
    await this.authz.bump();
    await this.audit.record("reporting.ended", "membership", line.reportId, { managerId: line.managerId, type: line.type });
  }

  /* ------------------------------- delegations ------------------------------ */

  async delegations(ctx: AuthContext) {
    const where = can(ctx, "org.manageReporting").allow
      ? {}
      : { OR: [{ delegatorId: ctx.membershipId }, { delegateId: ctx.membershipId }] };
    const [rows, people] = await Promise.all([
      this.db.tx.delegation.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
      this.people.all(),
    ]);
    const now = new Date();
    return rows.map((d) => ({
      id: d.id,
      delegator: this.people.liteOf(people.get(d.delegatorId)),
      delegate: this.people.liteOf(people.get(d.delegateId)),
      reason: d.reason,
      startsAt: d.startsAt,
      expiresAt: d.expiresAt,
      revokedAt: d.revokedAt,
      active: !d.revokedAt && d.startsAt <= now && d.expiresAt > now,
    }));
  }

  async createDelegation(ctx: AuthContext, input: { delegatorId: string; delegateId: string; startsAt?: Date | null; expiresAt: Date; reason?: string | null }) {
    const isSelf = input.delegatorId === ctx.membershipId;
    if (!isSelf && !can(ctx, "org.manageReporting").allow) throw forbidden("You can only delegate your own reporting line");
    if (input.delegatorId === input.delegateId) throw invalid("SELF_DELEGATION", "Choose someone else as the delegate.");
    const startsAt = input.startsAt ?? new Date();
    if (input.expiresAt <= startsAt) throw invalid("BAD_WINDOW", "The delegation must end after it starts.");
    if (input.expiresAt.getTime() - startsAt.getTime() > 120 * 86_400_000) throw invalid("TOO_LONG", "Delegations can last at most 120 days.");
    const [a, b] = await Promise.all([
      this.db.tx.membership.findFirst({ where: { id: input.delegatorId, status: "ACTIVE" } }),
      this.db.tx.membership.findFirst({ where: { id: input.delegateId, status: "ACTIVE" } }),
    ]);
    if (!a || !b) throw invalid("UNKNOWN_PERSON", "Both people must be active members.");
    const d = await this.db.tx.delegation.create({
      data: { organizationId: this.db.orgId, delegatorId: input.delegatorId, delegateId: input.delegateId, startsAt, expiresAt: input.expiresAt, reason: input.reason ?? null, createdById: ctx.membershipId },
    });
    await this.authz.bump();
    await this.audit.record("delegation.created", "delegation", d.id, { delegatorId: d.delegatorId, delegateId: d.delegateId, expiresAt: d.expiresAt });
    return d;
  }

  async revokeDelegation(ctx: AuthContext, id: string) {
    const d = await this.db.tx.delegation.findUnique({ where: { id } });
    if (!d || d.revokedAt) throw notFound("Delegation");
    if (d.delegatorId !== ctx.membershipId && !can(ctx, "org.manageReporting").allow) throw forbidden("Not allowed");
    await this.db.tx.delegation.update({ where: { id }, data: { revokedAt: new Date() } });
    await this.authz.bump();
    await this.audit.record("delegation.revoked", "delegation", id);
  }

  /* ------------------------------ teams & depts ------------------------------ */

  async upsertDepartment(ctx: AuthContext, id: string | null, input: { name: string; description?: string | null; headId?: string | null; color?: string }) {
    if (!can(ctx, "org.manageStructure").allow) throw forbidden("Only administrators can change departments");
    if (input.headId && !(await this.db.tx.membership.findFirst({ where: { id: input.headId, status: "ACTIVE" } })))
      throw invalid("INVALID_HEAD", "Department head must be an active member");
    const slug = slugify(input.name);
    const before = id ? await this.db.tx.department.findUnique({ where: { id } }) : null;
    if (id && !before) throw notFound("Department");
    const dept = id
      ? await this.db.tx.department.update({ where: { id }, data: { ...input, slug } })
      : await this.db.tx.department.create({ data: { ...input, slug, organizationId: this.db.orgId } });
    if (!before || before.headId !== dept.headId) await this.authz.bump();
    await this.audit.record(id ? "department.updated" : "department.created", "department", dept.id, {
      name: dept.name,
      before: before && { headId: before.headId, name: before.name },
      after: { headId: dept.headId },
    });
    return dept;
  }

  async deleteDepartment(ctx: AuthContext, id: string) {
    if (!can(ctx, "org.manageStructure").allow) throw forbidden("Only administrators can change departments");
    const teams = await this.db.tx.team.count({ where: { departmentId: id } });
    if (teams > 0) throw invalid("HAS_TEAMS", "Move or delete this department's teams first.");
    await this.db.tx.department.delete({ where: { id } });
    await this.authz.bump();
    await this.audit.record("department.deleted", "department", id);
  }

  async upsertTeam(ctx: AuthContext, id: string | null, input: { name: string; departmentId?: string | null; mission?: string | null; responsibilities?: string[]; contact?: string | null; docsUrl?: string | null }) {
    const existing = id ? await this.db.tx.team.findUnique({ where: { id } }) : null;
    if (id && !existing) throw notFound("Team");
    const isAdmin = can(ctx, "org.manageStructure").allow;
    const isLead = !!existing && ctx.ledTeamIds.has(existing.id);
    const deptId = input.departmentId ?? existing?.departmentId ?? null;
    const isHead = !!deptId && ctx.headedDepartmentIds.has(deptId);
    if (!isAdmin && !isHead && !isLead) throw forbidden("Only administrators, the department head or the team lead can edit this team");
    if (isLead && !isAdmin && !isHead && input.departmentId !== undefined && input.departmentId !== existing?.departmentId)
      throw forbidden("Team leads cannot move teams between departments");
    if (input.departmentId && !(await this.db.tx.department.findUnique({ where: { id: input.departmentId } })))
      throw invalid("INVALID_DEPARTMENT", "Department not found");
    const slug = slugify(input.name);
    const team = id
      ? await this.db.tx.team.update({ where: { id }, data: { ...input, slug } })
      : await this.db.tx.team.create({ data: { ...input, slug, organizationId: this.db.orgId } });
    await this.authz.bump();
    await this.audit.record(id ? "team.updated" : "team.created", "team", team.id, { name: team.name, departmentId: team.departmentId });
    return team;
  }

  async deleteTeam(ctx: AuthContext, id: string) {
    if (!can(ctx, "org.manageStructure").allow) throw forbidden("Only administrators can delete teams");
    const projects = await this.db.tx.project.count({ where: { owningTeamId: id, status: { notIn: ["COMPLETED", "CANCELLED"] } } });
    if (projects > 0) throw invalid("HAS_PROJECTS", "Reassign this team's active projects first.");
    await this.db.tx.team.delete({ where: { id } });
    await this.authz.bump();
    await this.audit.record("team.deleted", "team", id);
  }

  async addTeamMember(ctx: AuthContext, teamId: string, input: { membershipId: string; role: "MEMBER" | "LEAD"; isPrimary?: boolean }) {
    const team = await this.db.tx.team.findUnique({ where: { id: teamId } });
    if (!team) throw notFound("Team");
    if (!canManageTeamMembership(ctx, { id: team.id, departmentId: team.departmentId, orgId: team.organizationId }).allow)
      throw forbidden("You cannot change this team's membership");
    const member = await this.db.tx.membership.findFirst({ where: { id: input.membershipId, status: "ACTIVE" } });
    if (!member) throw invalid("UNKNOWN_PERSON", "Person not found");
    const active = await this.db.tx.teamMembership.findFirst({ where: { teamId, membershipId: input.membershipId, endedAt: null } });
    if (active) {
      await this.db.tx.teamMembership.update({ where: { id: active.id }, data: { role: input.role } });
    } else {
      const hasPrimary = await this.db.tx.teamMembership.count({ where: { membershipId: input.membershipId, endedAt: null, isPrimary: true } });
      await this.db.tx.teamMembership.create({
        data: { organizationId: this.db.orgId, teamId, membershipId: input.membershipId, role: input.role, isPrimary: input.isPrimary ?? hasPrimary === 0 },
      });
    }
    await this.authz.bump();
    await this.audit.record("team.member_added", "team", teamId, { membershipId: input.membershipId, role: input.role });
  }

  async removeTeamMember(ctx: AuthContext, teamId: string, membershipId: string) {
    const team = await this.db.tx.team.findUnique({ where: { id: teamId } });
    if (!team) throw notFound("Team");
    if (!canManageTeamMembership(ctx, { id: team.id, departmentId: team.departmentId, orgId: team.organizationId }).allow)
      throw forbidden("You cannot change this team's membership");
    const res = await this.db.tx.teamMembership.updateMany({ where: { teamId, membershipId, endedAt: null }, data: { endedAt: new Date() } });
    if (res.count === 0) throw notFound("Team membership");
    await this.authz.bump();
    await this.audit.record("team.member_removed", "team", teamId, { membershipId });
  }

  /* --------------------------------- members -------------------------------- */

  async adminMembers() {
    const people = await this.people.all();
    const memberships = await this.db.tx.membership.findMany({ select: { id: true, joinedAt: true, onboardedAt: true, deactivatedAt: true } });
    const meta = new Map(memberships.map((m) => [m.id, m]));
    return [...people.values()].map((p) => ({
      ...p,
      joinedAt: meta.get(p.id)?.joinedAt,
      onboardedAt: meta.get(p.id)?.onboardedAt,
      deactivatedAt: meta.get(p.id)?.deactivatedAt,
    }));
  }

  async changeRole(ctx: AuthContext, membershipId: string, role: OrgRole) {
    const target = await this.db.tx.membership.findUnique({ where: { id: membershipId } });
    if (!target) throw notFound("Member");
    const decision = canChangeRole(ctx, target.role, role);
    if (!decision.allow) throw forbidden(decision.reason);
    if (target.role === "OWNER" && role !== "OWNER") await this.assertNotLastOwner(membershipId);
    await this.db.tx.membership.update({ where: { id: membershipId }, data: { role } });
    await this.authz.bump();
    await this.audit.record("membership.role_changed", "membership", membershipId, { before: target.role, after: role });
  }

  async setStatus(ctx: AuthContext, membershipId: string, status: "ACTIVE" | "DEACTIVATED") {
    if (!can(ctx, "org.manageMembers").allow) throw forbidden("Administrators only");
    if (membershipId === ctx.membershipId) throw invalid("SELF", "You cannot deactivate yourself.");
    const target = await this.db.tx.membership.findUnique({ where: { id: membershipId } });
    if (!target) throw notFound("Member");
    if (target.role === "OWNER" && ctx.role !== "OWNER") throw forbidden("Only an owner can deactivate an owner");
    if (status === "DEACTIVATED") {
      if (target.role === "OWNER") await this.assertNotLastOwner(membershipId);
      const now = new Date();
      // Access is removed immediately: project memberships are deleted; structural history is ended, not erased.
      await this.db.tx.projectMember.deleteMany({ where: { membershipId } });
      await this.db.tx.teamMembership.updateMany({ where: { membershipId, endedAt: null }, data: { endedAt: now } });
      await this.db.tx.reportingLine.updateMany({ where: { OR: [{ reportId: membershipId }, { managerId: membershipId }], endedAt: null }, data: { endedAt: now } });
      await this.db.tx.delegation.updateMany({ where: { OR: [{ delegateId: membershipId }, { delegatorId: membershipId }], revokedAt: null }, data: { revokedAt: now } });
      await this.db.tx.accessGrant.updateMany({ where: { granteeId: membershipId, revokedAt: null }, data: { revokedAt: now } });
      await this.db.tx.membership.update({ where: { id: membershipId }, data: { status, deactivatedAt: now } });
    } else {
      await this.db.tx.membership.update({ where: { id: membershipId }, data: { status, deactivatedAt: null } });
    }
    await this.authz.bump();
    await this.audit.record(status === "DEACTIVATED" ? "membership.deactivated" : "membership.reactivated", "membership", membershipId);
  }

  private async assertNotLastOwner(membershipId: string) {
    const owners = await this.db.tx.membership.count({ where: { role: "OWNER", status: "ACTIVE", id: { not: membershipId } } });
    if (owners === 0) throw invalid("LAST_OWNER", "An organization needs at least one active owner.");
  }

  async updateProfile(ctx: AuthContext, membershipId: string, input: { displayName?: string; title?: string; bio?: string | null; location?: string | null; timezone?: string | null; responsibilities?: string[]; contact?: string | null }) {
    const isSelf = membershipId === ctx.membershipId;
    const isAdmin = can(ctx, "org.manageMembers").allow;
    if (!isSelf && !isAdmin) throw forbidden("You can only edit your own profile");
    const profile = await this.db.tx.employeeProfile.findUnique({ where: { membershipId } });
    if (!profile) throw notFound("Profile");
    const updated = await this.db.tx.employeeProfile.update({ where: { membershipId }, data: input });
    if (input.title && input.title !== profile.title)
      await this.audit.record("profile.title_changed", "membership", membershipId, { before: profile.title, after: input.title });
    return updated;
  }

  async settings() {
    return this.db.tx.organization.findUnique({
      where: { id: this.db.orgId },
      select: { id: true, name: true, slug: true, staleAfterDays: true, escalateBlockersAfterHours: true, createdAt: true, isDemo: true },
    });
  }

  async updateSettings(ctx: AuthContext, input: { name?: string; staleAfterDays?: number; escalateBlockersAfterHours?: number | null }) {
    if (!can(ctx, "org.manageSettings").allow) throw forbidden("Administrators only");
    const before = await this.settings();
    const org = await this.db.tx.organization.update({ where: { id: this.db.orgId }, data: input });
    await this.audit.record("organization.settings_changed", "organization", org.id, { before, after: input });
    return org;
  }
}

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "item";
}

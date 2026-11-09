import { Injectable } from "@nestjs/common";
import {
  assertTransition,
  canCreateProject,
  canEditProject,
  canManageProject,
  type AuthContext,
  type Priority,
  type ProjectRole,
  type ProjectStatus,
  type ResourceVisibility,
} from "@workmesh/core";
import { AuditService } from "../../common/audit.service";
import { currentStore } from "../../common/context";
import { Db } from "../../common/db.service";
import { EventsService } from "../../common/events.service";
import { conflict, forbidden, invalid, notFound } from "../../common/errors";
import { PeopleService } from "../org/people.service";
import { AuthzService } from "../policy/authz.service";
import { visibleIds } from "../policy/authz.types";
import { ChangesService } from "./changes.service";
import { ProjectMetricsService } from "./metrics.service";

export interface ProjectInput {
  name: string;
  key?: string;
  summary?: string | null;
  description?: string | null;
  initiativeId?: string | null;
  owningTeamId?: string | null;
  leadId?: string | null;
  priority?: Priority;
  startDate?: Date | null;
  targetDate?: Date | null;
  visibility?: ResourceVisibility;
  discoverable?: boolean;
}

const STRUCTURAL = ["name", "initiativeId", "owningTeamId", "leadId", "priority", "startDate", "targetDate", "visibility", "discoverable"];

@Injectable()
export class ProjectsService {
  constructor(
    private readonly db: Db,
    private readonly people: PeopleService,
    private readonly metrics: ProjectMetricsService,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
    private readonly changes: ChangesService,
    private readonly events: EventsService,
  ) {}

  private scope() {
    const s = currentStore()?.scope;
    if (!s) throw new Error("No viewer scope");
    return s;
  }

  /** Visible projects (summary or details), optionally filtered. */
  async list(ctx: AuthContext, filter: { status?: ProjectStatus; teamId?: string; mine?: boolean; initiativeId?: string } = {}) {
    const scope = this.scope();
    let ids = visibleIds(scope);
    if (filter.mine) ids = ids.filter((id) => ctx.projectRoles.has(id));
    const rows = await this.db.tx.project.findMany({
      where: {
        id: { in: ids },
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.teamId ? { owningTeamId: filter.teamId } : {}),
        ...(filter.initiativeId ? { initiativeId: filter.initiativeId } : {}),
      },
      include: { owningTeam: { select: { id: true, name: true } }, initiative: { select: { id: true, title: true, goalId: true } } },
      orderBy: [{ priority: "desc" }, { targetDate: "asc" }],
    });
    return this.present(ctx, rows);
  }

  async present(ctx: AuthContext, rows: Array<Awaited<ReturnType<typeof this.db.tx.project.findFirst>> & { owningTeam?: { id: string; name: string } | null; initiative?: { id: string; title: string; goalId: string | null } | null }>) {
    const scope = this.scope();
    const metrics = await this.metrics.compute(rows.map((r) => r!.id));
    const people = await this.people.all();
    return rows
      .filter((r) => r && scope.projectAccess.has(r.id))
      .map((r) => {
        const p = r!;
        const access = scope.projectAccess.get(p.id)!;
        const res = scope.projects.get(p.id)!;
        const m = metrics.get(p.id);
        const initiativeVisible = p.initiative && scope.initiatives.has(p.initiative.id);
        return {
          id: p.id,
          key: p.key,
          name: p.name,
          summary: p.summary,
          status: p.status,
          priority: p.priority,
          visibility: p.visibility,
          discoverable: p.discoverable,
          startDate: p.startDate,
          targetDate: p.targetDate,
          access,
          owningTeam: p.owningTeam ?? null,
          lead: this.people.liteOf(people.get(p.leadId ?? "")),
          initiative: initiativeVisible ? { id: p.initiative!.id, title: p.initiative!.title, goalId: p.initiative!.goalId && scope.goals.has(p.initiative!.goalId) ? p.initiative!.goalId : null } : null,
          health: m?.health ?? "NOT_STARTED",
          healthReasons: m?.reasons ?? [],
          computedProgress: m?.computedProgress ?? null,
          progressBasis: m?.progressBasis ?? "none",
          reportedProgress: p.reportedProgress,
          reportedAt: p.reportedAt,
          milestones: m?.milestones,
          workItems: access === "details" ? m?.workItems : undefined,
          openBlockers: m?.openBlockers ?? 0,
          myRole: ctx.projectRoles.get(p.id) ?? null,
          canEdit: canEditProject(ctx, res).allow,
          canManage: canManageProject(ctx, res).allow,
          version: p.version,
          updatedAt: p.updatedAt,
        };
      });
  }

  /** 404 for both missing and invisible projects. */
  async get(ctx: AuthContext, id: string) {
    const scope = this.scope();
    if (!scope.projectAccess.has(id)) throw notFound("Project");
    const row = await this.db.tx.project.findUnique({
      where: { id },
      include: { owningTeam: { select: { id: true, name: true } }, initiative: { select: { id: true, title: true, goalId: true } } },
    });
    if (!row) throw notFound("Project");
    const [summary] = await this.present(ctx, [row]);
    if (summary!.access !== "details") return { ...summary, description: null, members: [], milestoneList: [] };
    const [members, milestones] = await Promise.all([
      this.db.tx.projectMember.findMany({ where: { projectId: id }, orderBy: { addedAt: "asc" } }),
      this.db.tx.milestone.findMany({ where: { projectId: id }, orderBy: [{ sortOrder: "asc" }, { dueDate: "asc" }] }),
    ]);
    const people = await this.people.all();
    return {
      ...summary,
      description: row.description,
      members: members.map((m) => ({ ...this.people.liteOf(people.get(m.membershipId)), role: m.role, addedAt: m.addedAt })).filter((m) => m.id),
      milestoneList: milestones.map((m) => ({ ...m, owner: this.people.liteOf(people.get(m.ownerId ?? "")) })),
    };
  }

  /** Throws 404 when invisible, 403 when visible but not editable. */
  requireEditable(ctx: AuthContext, projectId: string, manage = false) {
    const scope = this.scope();
    const res = scope.projects.get(projectId);
    if (!res || scope.projectAccess.get(projectId) !== "details") throw notFound("Project");
    const d = manage ? canManageProject(ctx, res) : canEditProject(ctx, res);
    if (!d.allow) throw forbidden(d.reason);
    return res;
  }

  private async validateRefs(input: Partial<ProjectInput>) {
    const tx = this.db.tx;
    if (input.owningTeamId && !(await tx.team.findUnique({ where: { id: input.owningTeamId } }))) throw invalid("INVALID_TEAM", "Team not found");
    if (input.leadId && !(await tx.membership.findFirst({ where: { id: input.leadId, status: "ACTIVE" } }))) throw invalid("INVALID_LEAD", "Lead not found");
    if (input.initiativeId && !this.scope().initiatives.has(input.initiativeId)) throw invalid("INVALID_INITIATIVE", "Initiative not found");
    if (input.startDate && input.targetDate && input.targetDate < input.startDate) throw invalid("BAD_DATES", "Target date must be after the start date");
  }

  async create(ctx: AuthContext, input: ProjectInput) {
    const d = canCreateProject(ctx, input.owningTeamId ?? null);
    if (!d.allow) throw forbidden(d.reason);
    await this.validateRefs(input);
    const key = (input.key ?? input.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 6)).toUpperCase() || "PRJ";
    let finalKey = key;
    for (let i = 2; await this.db.tx.project.findFirst({ where: { key: finalKey } }); i++) finalKey = `${key}${i}`;
    const leadId = input.leadId ?? ctx.membershipId;
    const project = await this.db.tx.project.create({
      data: {
        organizationId: this.db.orgId,
        name: input.name,
        key: finalKey,
        summary: input.summary ?? null,
        description: input.description ?? null,
        initiativeId: input.initiativeId ?? null,
        owningTeamId: input.owningTeamId ?? null,
        leadId,
        priority: input.priority ?? "MEDIUM",
        startDate: input.startDate ?? null,
        targetDate: input.targetDate ?? null,
        visibility: input.visibility ?? "ORG",
        discoverable: input.discoverable ?? true,
        status: "PROPOSED",
      },
    });
    await this.db.tx.projectMember.create({ data: { organizationId: this.db.orgId, projectId: project.id, membershipId: leadId, role: "LEAD" } });
    await this.authz.bump();
    await this.audit.record("project.created", "project", project.id, { name: project.name, visibility: project.visibility });
    return project;
  }

  async update(ctx: AuthContext, id: string, input: Partial<ProjectInput> & { version: number }) {
    const res = this.requireEditable(ctx, id);
    const touchesAccess = input.visibility !== undefined || input.discoverable !== undefined || input.leadId !== undefined || input.owningTeamId !== undefined;
    if (touchesAccess && !canManageProject(ctx, res).allow) throw forbidden("Only the project lead can change ownership or visibility");
    await this.validateRefs(input);
    const before = await this.db.tx.project.findUnique({ where: { id } });
    if (!before) throw notFound("Project");
    const { version, ...data } = input;
    const result = await this.db.tx.project.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
    if (result.count === 0) throw conflict();
    const after = await this.db.tx.project.findUnique({ where: { id } });
    if (input.leadId && input.leadId !== before.leadId) {
      await this.db.tx.projectMember.upsert({
        where: { projectId_membershipId: { projectId: id, membershipId: input.leadId } },
        update: { role: "LEAD" },
        create: { organizationId: this.db.orgId, projectId: id, membershipId: input.leadId, role: "LEAD" },
      });
    }
    await this.changes.record("PROJECT", id, id, before, after!, ["leadId", "targetDate", "visibility", "priority"]);
    if (touchesAccess) await this.authz.bump();
    await this.audit.record("project.updated", "project", id, {
      before: pick(before, STRUCTURAL),
      after: pick(after!, STRUCTURAL),
    });
    await this.events.emit("project.changed", { projectId: id });
    return after;
  }

  async transition(ctx: AuthContext, id: string, to: ProjectStatus, version: number) {
    this.requireEditable(ctx, id);
    const before = await this.db.tx.project.findUnique({ where: { id } });
    if (!before) throw notFound("Project");
    assertTransition("project", before.status, to);
    if (to === "COMPLETED") {
      const open = await this.db.tx.milestone.count({ where: { projectId: id, isCritical: true, status: { notIn: ["DONE", "CANCELLED"] } } });
      if (open > 0) throw invalid("CRITICAL_MILESTONES_OPEN", "Complete or cancel the critical milestones before completing the project.");
    }
    const result = await this.db.tx.project.updateMany({ where: { id, version }, data: { status: to, version: { increment: 1 } } });
    if (result.count === 0) throw conflict();
    await this.changes.record("PROJECT", id, id, before, { status: to }, ["status"]);
    await this.audit.record("project.status_changed", "project", id, { before: before.status, after: to });
    await this.events.emit("project.changed", { projectId: id, status: to, from: before.status });
    return { ok: true, status: to };
  }

  async reportProgress(ctx: AuthContext, id: string, progress: number) {
    this.requireEditable(ctx, id);
    await this.db.tx.project.update({ where: { id }, data: { reportedProgress: progress, reportedAt: new Date(), reportedById: ctx.membershipId } });
    await this.audit.record("project.progress_reported", "project", id, { reportedProgress: progress });
    return { ok: true };
  }

  async addMember(ctx: AuthContext, id: string, membershipId: string, role: ProjectRole) {
    this.requireEditable(ctx, id, true);
    if (!(await this.db.tx.membership.findFirst({ where: { id: membershipId, status: "ACTIVE" } }))) throw invalid("UNKNOWN_PERSON", "Person not found");
    await this.db.tx.projectMember.upsert({
      where: { projectId_membershipId: { projectId: id, membershipId } },
      update: { role },
      create: { organizationId: this.db.orgId, projectId: id, membershipId, role },
    });
    await this.authz.bump();
    await this.audit.record("project.member_added", "project", id, { membershipId, role });
    await this.events.emit("project.member_added", { projectId: id, membershipId });
  }

  /** Removal is a delete, so access ends with this transaction's commit (Example E). */
  async removeMember(ctx: AuthContext, id: string, membershipId: string) {
    const res = this.requireEditable(ctx, id, true);
    if (res.leadId === membershipId) throw invalid("IS_LEAD", "Assign a different lead before removing this person.");
    const r = await this.db.tx.projectMember.deleteMany({ where: { projectId: id, membershipId } });
    if (r.count === 0) throw notFound("Project member");
    await this.authz.bump();
    await this.audit.record("project.member_removed", "project", id, { membershipId });
  }

  async grants(ctx: AuthContext, id: string) {
    this.requireEditable(ctx, id, true);
    const [rows, people] = await Promise.all([
      this.db.tx.accessGrant.findMany({ where: { resourceType: "PROJECT", resourceId: id, revokedAt: null }, orderBy: { createdAt: "desc" } }),
      this.people.all(),
    ]);
    return rows.map((g) => ({ id: g.id, level: g.level, reason: g.reason, expiresAt: g.expiresAt, grantee: this.people.liteOf(people.get(g.granteeId)) }));
  }

  async grant(ctx: AuthContext, id: string, input: { granteeId: string; level: "SUMMARY" | "DETAILS"; reason?: string | null; expiresAt?: Date | null }) {
    this.requireEditable(ctx, id, true);
    if (!(await this.db.tx.membership.findFirst({ where: { id: input.granteeId, status: "ACTIVE" } }))) throw invalid("UNKNOWN_PERSON", "Person not found");
    const g = await this.db.tx.accessGrant.create({
      data: { organizationId: this.db.orgId, resourceType: "PROJECT", resourceId: id, granteeId: input.granteeId, level: input.level, reason: input.reason ?? null, expiresAt: input.expiresAt ?? null, grantedById: ctx.membershipId },
    });
    await this.authz.bump();
    await this.audit.record("project.access_granted", "project", id, { granteeId: input.granteeId, level: input.level, expiresAt: input.expiresAt ?? null });
    return g;
  }

  async revokeGrant(ctx: AuthContext, id: string, grantId: string) {
    this.requireEditable(ctx, id, true);
    const r = await this.db.tx.accessGrant.updateMany({ where: { id: grantId, resourceId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (r.count === 0) throw notFound("Grant");
    await this.authz.bump();
    await this.audit.record("project.access_revoked", "project", id, { grantId });
  }

  /** Timeline of changes, updates and blockers — each already filtered by its own policy upstream. */
  async activity(id: string) {
    const scope = this.scope();
    if (scope.projectAccess.get(id) !== "details") throw notFound("Project");
    const [changes, people] = await Promise.all([
      this.db.tx.changeEvent.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
      this.people.all(),
    ]);
    return changes.map((c) => ({ ...c, actor: this.people.liteOf(people.get(c.actorId ?? "")) }));
  }
}

function pick(obj: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

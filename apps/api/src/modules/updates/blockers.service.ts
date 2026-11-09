import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  allowedTransitions,
  assertTransition,
  blockerStateAfterAssignment,
  canManageBlocker,
  canViewBlocker,
  type AuthContext,
  type BlockerState,
  type Severity,
  type UpdateVisibility,
} from "@workmesh/core";
import { AuditService } from "../../common/audit.service";
import { currentStore } from "../../common/context";
import { Db } from "../../common/db.service";
import { EventsService } from "../../common/events.service";
import { conflict, forbidden, invalid, notFound } from "../../common/errors";
import { PeopleService } from "../org/people.service";
import { detailIds, levelOf } from "../policy/authz.types";
import { UpdatesService } from "./updates.service";

type BlockerRow = Prisma.BlockerGetPayload<object>;

export interface BlockerInput {
  title: string;
  description?: string | null;
  projectId?: string | null;
  milestoneId?: string | null;
  workItemId?: string | null;
  updateId?: string | null;
  severity?: Severity;
  visibility?: UpdateVisibility;
  targetDate?: Date | null;
  ownerId?: string | null;
}

/**
 * Blocker lifecycle: OPEN → ASSIGNED → INVESTIGATING/WAITING → RESOLVED (→ REOPENED).
 * Every state or owner change appends a BlockerEvent (full history) in the same transaction.
 */
@Injectable()
export class BlockersService {
  constructor(
    private readonly db: Db,
    private readonly people: PeopleService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly updates: UpdatesService,
  ) {}

  private scope() {
    return currentStore()!.scope!;
  }

  private resource(b: BlockerRow) {
    return { id: b.id, orgId: b.organizationId, reporterId: b.reporterId, ownerId: b.ownerId, projectId: b.projectId, visibility: b.visibility };
  }

  canView(ctx: AuthContext, b: BlockerRow) {
    return canViewBlocker(ctx, this.resource(b), levelOf(this.scope(), b.projectId)).allow;
  }

  canManage(ctx: AuthContext, b: BlockerRow) {
    const project = b.projectId ? (this.scope().projects.get(b.projectId) ?? null) : null;
    return canManageBlocker(ctx, this.resource(b), project).allow;
  }

  visibilityWhere(ctx: AuthContext): Prisma.BlockerWhereInput {
    const details = detailIds(this.scope());
    return {
      OR: [
        { reporterId: ctx.membershipId },
        { ownerId: ctx.membershipId },
        {
          visibility: { not: "PRIVATE" },
          AND: [
            { OR: [{ projectId: null }, { projectId: { in: details } }] },
            {
              OR: [
                { reporterId: { in: [...ctx.managedMemberIds] } },
                { visibility: "ORG" },
                { visibility: "TEAM", reporterId: { in: [...ctx.teammateIds] } },
                { visibility: "PROJECT", projectId: { in: details } },
              ],
            },
          ],
        },
      ],
    };
  }

  /**
   * scope:
   *  - mine:  reported by me or assigned to me
   *  - queue: unresolved blockers I can act on (my reporting line, projects I lead, assigned to me)
   *  - all:   everything I can see
   */
  async list(ctx: AuthContext, f: { scope?: "mine" | "queue" | "all"; projectId?: string; state?: BlockerState; open?: boolean }) {
    const ledProjects = [...ctx.projectRoles].filter(([, r]) => r === "LEAD").map(([id]) => id);
    const scopeWhere: Prisma.BlockerWhereInput =
      f.scope === "mine"
        ? { OR: [{ reporterId: ctx.membershipId }, { ownerId: ctx.membershipId }] }
        : f.scope === "queue"
          ? { state: { not: "RESOLVED" }, OR: [{ reporterId: { in: [...ctx.managedMemberIds] } }, { projectId: { in: ledProjects } }, { ownerId: ctx.membershipId }] }
          : {};
    const rows = await this.db.tx.blocker.findMany({
      where: {
        AND: [
          this.visibilityWhere(ctx),
          scopeWhere,
          f.projectId ? { projectId: f.projectId } : {},
          f.state ? { state: f.state } : {},
          f.open ? { state: { not: "RESOLVED" } } : {},
        ],
      },
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    });
    return this.present(ctx, rows.filter((b) => this.canView(ctx, b)));
  }

  private async present(ctx: AuthContext, rows: BlockerRow[]) {
    const people = await this.people.all();
    const projectIds = [...new Set(rows.map((r) => r.projectId).filter(Boolean))] as string[];
    const projects = await this.db.tx.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true, key: true } });
    const pMap = new Map(projects.map((p) => [p.id, p]));
    const sevRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return rows
      .map((b) => ({
        id: b.id,
        title: b.title,
        description: b.description,
        severity: b.severity,
        state: b.state,
        visibility: b.visibility,
        targetDate: b.targetDate,
        resolutionNotes: b.resolutionNotes,
        resolvedAt: b.resolvedAt,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        version: b.version,
        reporter: this.people.liteOf(people.get(b.reporterId)),
        owner: this.people.liteOf(people.get(b.ownerId ?? "")),
        project: b.projectId ? (pMap.get(b.projectId) ?? null) : null,
        milestoneId: b.milestoneId,
        workItemId: b.workItemId,
        ageDays: Math.floor((Date.now() - b.createdAt.getTime()) / 86_400_000),
        canManage: this.canManage(ctx, b),
        allowedTransitions: allowedTransitions("blocker", b.state),
      }))
      .sort((a, b) => (a.state === "RESOLVED" ? 1 : 0) - (b.state === "RESOLVED" ? 1 : 0) || (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9));
  }

  async get(ctx: AuthContext, id: string) {
    const b = await this.db.tx.blocker.findUnique({ where: { id } });
    if (!b || !this.canView(ctx, b)) throw notFound("Blocker");
    const [presented] = await this.present(ctx, [b]);
    const [events, comments, people] = await Promise.all([
      this.db.tx.blockerEvent.findMany({ where: { blockerId: id }, orderBy: { createdAt: "asc" } }),
      this.updates.comments("BLOCKER", id),
      this.people.all(),
    ]);
    return {
      ...presented,
      events: events.map((e) => ({
        id: e.id,
        fromState: e.fromState,
        toState: e.toState,
        note: e.note,
        createdAt: e.createdAt,
        actor: this.people.liteOf(people.get(e.actorId)),
        fromOwner: this.people.liteOf(people.get(e.fromOwnerId ?? "")),
        toOwner: this.people.liteOf(people.get(e.toOwnerId ?? "")),
      })),
      comments,
    };
  }

  async create(ctx: AuthContext, input: BlockerInput) {
    if (input.projectId && levelOf(this.scope(), input.projectId) !== "details") throw invalid("INVALID_PROJECT", "Project not found");
    if (input.milestoneId) {
      const m = await this.db.tx.milestone.findUnique({ where: { id: input.milestoneId } });
      if (!m || m.projectId !== input.projectId) throw invalid("INVALID_MILESTONE", "Milestone must belong to the project");
    }
    if (input.workItemId) {
      const w = await this.db.tx.workItem.findUnique({ where: { id: input.workItemId } });
      if (!w || w.projectId !== input.projectId) throw invalid("INVALID_WORK_ITEM", "Work item must belong to the project");
    }
    if (input.updateId) {
      const u = await this.db.tx.progressUpdate.findUnique({ where: { id: input.updateId } });
      if (!u || u.authorId !== ctx.membershipId) throw invalid("INVALID_UPDATE", "Update not found");
    }
    if (input.ownerId && !(await this.db.tx.membership.findFirst({ where: { id: input.ownerId, status: "ACTIVE" } }))) throw invalid("UNKNOWN_PERSON", "Owner not found");
    const state: BlockerState = input.ownerId ? "ASSIGNED" : "OPEN";
    const b = await this.db.tx.blocker.create({
      data: {
        organizationId: this.db.orgId,
        title: input.title,
        description: input.description ?? null,
        projectId: input.projectId ?? null,
        milestoneId: input.milestoneId ?? null,
        workItemId: input.workItemId ?? null,
        updateId: input.updateId ?? null,
        reporterId: ctx.membershipId,
        ownerId: input.ownerId ?? null,
        severity: input.severity ?? "MEDIUM",
        visibility: input.visibility ?? (input.projectId ? "PROJECT" : "MANAGER"),
        targetDate: input.targetDate ?? null,
        state,
      },
    });
    await this.db.tx.blockerEvent.create({
      data: { organizationId: this.db.orgId, blockerId: b.id, actorId: ctx.membershipId, toState: state, toOwnerId: b.ownerId, note: "Reported" },
    });
    if (b.workItemId) {
      const w = await this.db.tx.workItem.findUnique({ where: { id: b.workItemId } });
      if (w && ["TODO", "IN_PROGRESS", "IN_REVIEW"].includes(w.status)) {
        await this.db.tx.workItem.update({ where: { id: w.id }, data: { status: "BLOCKED", version: { increment: 1 } } });
        await this.db.tx.changeEvent.create({ data: { organizationId: this.db.orgId, entityType: "WORK_ITEM", entityId: w.id, projectId: w.projectId, field: "status", fromValue: w.status, toValue: "BLOCKED", actorId: ctx.membershipId } });
      }
    }
    await this.audit.record("blocker.created", "blocker", b.id, { severity: b.severity, projectId: b.projectId, ownerId: b.ownerId });
    await this.events.emit("blocker.created", { blockerId: b.id, projectId: b.projectId, reporterId: b.reporterId, ownerId: b.ownerId, severity: b.severity });
    if (b.ownerId) await this.events.emit("blocker.assigned", { blockerId: b.id, ownerId: b.ownerId, projectId: b.projectId });
    return b;
  }

  private async load(ctx: AuthContext, id: string, version: number) {
    const b = await this.db.tx.blocker.findUnique({ where: { id } });
    if (!b || !this.canView(ctx, b)) throw notFound("Blocker");
    if (!this.canManage(ctx, b)) throw forbidden("Only the reporter, owner, their managers or the project lead can change this blocker");
    if (b.version !== version) throw conflict();
    return b;
  }

  async assign(ctx: AuthContext, id: string, ownerId: string | null, version: number, note?: string | null) {
    const b = await this.load(ctx, id, version);
    if (ownerId && !(await this.db.tx.membership.findFirst({ where: { id: ownerId, status: "ACTIVE" } }))) throw invalid("UNKNOWN_PERSON", "Owner not found");
    if (b.state === "RESOLVED") throw invalid("RESOLVED", "Reopen the blocker before reassigning it");
    const state = ownerId ? blockerStateAfterAssignment(b.state) : b.state;
    const r = await this.db.tx.blocker.updateMany({ where: { id, version }, data: { ownerId, state, version: { increment: 1 } } });
    if (r.count === 0) throw conflict();
    await this.db.tx.blockerEvent.create({
      data: { organizationId: this.db.orgId, blockerId: id, actorId: ctx.membershipId, fromState: b.state, toState: state, fromOwnerId: b.ownerId, toOwnerId: ownerId, note: note ?? null },
    });
    await this.audit.record("blocker.assigned", "blocker", id, { before: { ownerId: b.ownerId, state: b.state }, after: { ownerId, state } });
    if (ownerId) await this.events.emit("blocker.assigned", { blockerId: id, ownerId, projectId: b.projectId });
    await this.events.emit("blocker.changed", { blockerId: id, projectId: b.projectId, reporterId: b.reporterId, ownerId, state });
    return { ok: true, state };
  }

  async transition(ctx: AuthContext, id: string, to: BlockerState, version: number, note?: string | null, resolutionNotes?: string | null) {
    const b = await this.load(ctx, id, version);
    assertTransition("blocker", b.state, to);
    if (to === b.state) return { ok: true, state: to };
    if (to === "RESOLVED" && !resolutionNotes?.trim()) throw invalid("RESOLUTION_REQUIRED", "Describe how the blocker was resolved");
    const data: Prisma.BlockerUpdateManyMutationInput = { state: to, version: { increment: 1 } };
    if (to === "RESOLVED") Object.assign(data, { resolvedAt: new Date(), resolutionNotes });
    if (to === "REOPENED") Object.assign(data, { resolvedAt: null });
    const r = await this.db.tx.blocker.updateMany({ where: { id, version }, data });
    if (r.count === 0) throw conflict();
    await this.db.tx.blockerEvent.create({
      data: { organizationId: this.db.orgId, blockerId: id, actorId: ctx.membershipId, fromState: b.state, toState: to, note: note ?? (to === "RESOLVED" ? resolutionNotes : null) ?? null },
    });
    // When the last open blocker on a work item is resolved, the work can resume.
    if (to === "RESOLVED" && b.workItemId) {
      const stillOpen = await this.db.tx.blocker.count({ where: { workItemId: b.workItemId, state: { not: "RESOLVED" }, id: { not: id } } });
      const w = await this.db.tx.workItem.findUnique({ where: { id: b.workItemId } });
      if (!stillOpen && w?.status === "BLOCKED") {
        await this.db.tx.workItem.update({ where: { id: w.id }, data: { status: "IN_PROGRESS", version: { increment: 1 } } });
        await this.db.tx.changeEvent.create({ data: { organizationId: this.db.orgId, entityType: "WORK_ITEM", entityId: w.id, projectId: w.projectId, field: "status", fromValue: "BLOCKED", toValue: "IN_PROGRESS", actorId: ctx.membershipId } });
      }
    }
    await this.audit.record(to === "RESOLVED" ? "blocker.resolved" : "blocker.state_changed", "blocker", id, { before: b.state, after: to });
    await this.events.emit("blocker.changed", { blockerId: id, projectId: b.projectId, reporterId: b.reporterId, ownerId: b.ownerId, state: to });
    return { ok: true, state: to };
  }

  async comment(ctx: AuthContext, id: string, body: string) {
    const b = await this.db.tx.blocker.findUnique({ where: { id } });
    if (!b || !this.canView(ctx, b)) throw notFound("Blocker");
    const recipients = [b.reporterId, b.ownerId].filter((x): x is string => !!x);
    return this.updates.addComment(ctx, "BLOCKER", id, body, { recipients, projectId: b.projectId });
  }
}

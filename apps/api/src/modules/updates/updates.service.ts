import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  canEditUpdate,
  canViewMemberWork,
  canViewUpdate,
  type AuthContext,
  type UpdateStage,
  type UpdateVisibility,
} from "@workmesh/core";
import { AuditService } from "../../common/audit.service";
import { currentStore } from "../../common/context";
import { Db } from "../../common/db.service";
import { EventsService } from "../../common/events.service";
import { conflict, forbidden, invalid, notFound } from "../../common/errors";
import { PeopleService } from "../org/people.service";
import { detailIds, levelOf } from "../policy/authz.types";

export interface UpdateInput {
  projectId?: string | null;
  milestoneId?: string | null;
  workItemId?: string | null;
  stage?: UpdateStage;
  currentFocus: string;
  completed?: string | null;
  nextSteps?: string | null;
  helpNeeded?: string | null;
  helpFromId?: string | null;
  confidence?: number | null;
  visibility?: UpdateVisibility;
}

type UpdateRow = Prisma.ProgressUpdateGetPayload<object>;

@Injectable()
export class UpdatesService {
  constructor(
    private readonly db: Db,
    private readonly people: PeopleService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope() {
    return currentStore()!.scope!;
  }

  /**
   * SQL pre-filter equivalent to `canViewUpdate`. Results are re-checked row by row with the
   * policy function, so a divergence can only ever hide rows, never reveal them.
   */
  visibilityWhere(ctx: AuthContext): Prisma.ProgressUpdateWhereInput {
    const details = detailIds(this.scope());
    return {
      OR: [
        { authorId: ctx.membershipId },
        {
          status: "PUBLISHED",
          visibility: { not: "PRIVATE" },
          AND: [
            { OR: [{ projectId: null }, { projectId: { in: details } }] },
            {
              OR: [
                { visibility: "ORG" },
                { authorId: { in: [...ctx.managedMemberIds] } },
                { visibility: "TEAM", authorId: { in: [...ctx.teammateIds] } },
                { visibility: "PROJECT", projectId: { in: [...ctx.projectRoles.keys()] } },
              ],
            },
          ],
        },
      ],
    };
  }

  canView(ctx: AuthContext, u: UpdateRow) {
    return canViewUpdate(ctx, { id: u.id, orgId: u.organizationId, authorId: u.authorId, status: u.status, visibility: u.visibility, projectId: u.projectId }, levelOf(this.scope(), u.projectId)).allow;
  }

  async list(ctx: AuthContext, f: { authorId?: string; projectId?: string; drafts?: boolean; since?: Date; limit?: number; cursor?: string }) {
    const rows = await this.db.tx.progressUpdate.findMany({
      where: {
        AND: [
          this.visibilityWhere(ctx),
          f.authorId ? { authorId: f.authorId } : {},
          f.projectId ? { projectId: f.projectId } : {},
          f.drafts ? { status: "DRAFT", authorId: ctx.membershipId } : { status: "PUBLISHED" },
          f.since ? { publishedAt: { gte: f.since } } : {},
          f.cursor ? { createdAt: { lt: new Date(f.cursor) } } : {},
        ],
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: Math.min(f.limit ?? 30, 100),
      include: { _count: { select: { acks: true } }, acks: { where: { membershipId: ctx.membershipId }, select: { id: true } } },
    });
    return this.present(ctx, rows.filter((u) => this.canView(ctx, u)));
  }

  private async present(ctx: AuthContext, rows: Array<UpdateRow & { _count?: { acks: number }; acks?: Array<{ id: string }> }>) {
    const people = await this.people.all();
    const projectIds = [...new Set(rows.map((r) => r.projectId).filter(Boolean))] as string[];
    const milestoneIds = [...new Set(rows.map((r) => r.milestoneId).filter(Boolean))] as string[];
    const [projects, milestones, commentCounts] = await Promise.all([
      this.db.tx.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true, key: true } }),
      this.db.tx.milestone.findMany({ where: { id: { in: milestoneIds } }, select: { id: true, title: true } }),
      this.db.tx.comment.groupBy({ by: ["entityId"], where: { entityType: "UPDATE", entityId: { in: rows.map((r) => r.id) } }, _count: { _all: true } }),
    ]);
    const pMap = new Map(projects.map((p) => [p.id, p]));
    const mMap = new Map(milestones.map((m) => [m.id, m]));
    return rows.map((u) => ({
      id: u.id,
      status: u.status,
      visibility: u.visibility,
      stage: u.stage,
      currentFocus: u.currentFocus,
      completed: u.completed,
      nextSteps: u.nextSteps,
      helpNeeded: u.helpNeeded,
      helpFrom: this.people.liteOf(people.get(u.helpFromId ?? "")),
      confidence: u.confidence,
      publishedAt: u.publishedAt,
      editedAt: u.editedAt,
      createdAt: u.createdAt,
      version: u.version,
      author: this.people.liteOf(people.get(u.authorId)),
      project: u.projectId ? (pMap.get(u.projectId) ?? null) : null,
      milestone: u.milestoneId ? (mMap.get(u.milestoneId) ?? null) : null,
      workItemId: u.workItemId,
      ackCount: u._count?.acks ?? 0,
      acknowledgedByMe: (u.acks?.length ?? 0) > 0,
      commentCount: commentCounts.find((c) => c.entityId === u.id)?._count._all ?? 0,
      isMine: u.authorId === ctx.membershipId,
    }));
  }

  async get(ctx: AuthContext, id: string) {
    const u = await this.db.tx.progressUpdate.findUnique({ where: { id }, include: { _count: { select: { acks: true } }, acks: true } });
    if (!u || !this.canView(ctx, u)) throw notFound("Update");
    const [presented] = await this.present(ctx, [{ ...u, acks: u.acks.filter((a) => a.membershipId === ctx.membershipId) }]);
    const [revisions, comments] = await Promise.all([
      this.db.tx.updateRevision.findMany({ where: { updateId: id }, orderBy: { createdAt: "desc" } }),
      this.comments("UPDATE", id),
    ]);
    return {
      ...presented,
      acknowledgedBy: await this.people.many(u.acks.map((a) => a.membershipId)),
      revisions: revisions.map((r) => ({ id: r.id, createdAt: r.createdAt, snapshot: r.snapshot })),
      comments,
    };
  }

  private async validateLinks(ctx: AuthContext, input: Partial<UpdateInput>) {
    if (input.projectId && levelOf(this.scope(), input.projectId) !== "details") throw invalid("INVALID_PROJECT", "Project not found");
    if (input.milestoneId) {
      const m = await this.db.tx.milestone.findUnique({ where: { id: input.milestoneId } });
      if (!m || m.projectId !== input.projectId) throw invalid("INVALID_MILESTONE", "Milestone must belong to the selected project");
    }
    if (input.workItemId) {
      const w = await this.db.tx.workItem.findUnique({ where: { id: input.workItemId } });
      if (!w || w.projectId !== input.projectId) throw invalid("INVALID_WORK_ITEM", "Work item must belong to the selected project");
    }
    if (input.helpFromId) {
      if (input.helpFromId === ctx.membershipId) throw invalid("HELP_SELF", "Ask someone else for help");
      if (!(await this.db.tx.membership.findFirst({ where: { id: input.helpFromId, status: "ACTIVE" } }))) throw invalid("UNKNOWN_PERSON", "Person not found");
    }
  }

  async create(ctx: AuthContext, input: UpdateInput, publish: boolean) {
    await this.validateLinks(ctx, input);
    const now = new Date();
    const u = await this.db.tx.progressUpdate.create({
      data: {
        organizationId: this.db.orgId,
        authorId: ctx.membershipId,
        projectId: input.projectId ?? null,
        milestoneId: input.milestoneId ?? null,
        workItemId: input.workItemId ?? null,
        stage: input.stage ?? "DEVELOPMENT",
        currentFocus: input.currentFocus,
        completed: input.completed ?? null,
        nextSteps: input.nextSteps ?? null,
        helpNeeded: input.helpNeeded ?? null,
        helpFromId: input.helpFromId ?? null,
        confidence: input.confidence ?? null,
        visibility: input.visibility ?? "MANAGER",
        status: publish ? "PUBLISHED" : "DRAFT",
        publishedAt: publish ? now : null,
      },
    });
    if (publish) await this.afterPublish(u);
    return u;
  }

  private async afterPublish(u: UpdateRow) {
    await this.events.emit("update.published", { updateId: u.id, authorId: u.authorId, projectId: u.projectId, helpFromId: u.helpFromId, hasHelp: !!u.helpNeeded });
  }

  async update(ctx: AuthContext, id: string, input: Partial<UpdateInput> & { version: number }) {
    const u = await this.db.tx.progressUpdate.findUnique({ where: { id } });
    if (!u || !this.canView(ctx, u)) throw notFound("Update");
    const d = canEditUpdate(ctx, { id: u.id, orgId: u.organizationId, authorId: u.authorId, status: u.status, visibility: u.visibility, projectId: u.projectId });
    if (!d.allow) throw forbidden(d.reason);
    const merged = { projectId: u.projectId, milestoneId: u.milestoneId, workItemId: u.workItemId, ...input };
    await this.validateLinks(ctx, merged);
    if (u.status === "PUBLISHED") {
      // Edit history: snapshot the previously published content before changing it.
      await this.db.tx.updateRevision.create({
        data: {
          organizationId: this.db.orgId,
          updateId: id,
          editorId: ctx.membershipId,
          snapshot: { stage: u.stage, currentFocus: u.currentFocus, completed: u.completed, nextSteps: u.nextSteps, helpNeeded: u.helpNeeded, visibility: u.visibility, confidence: u.confidence, editedAt: (u.editedAt ?? u.publishedAt)?.toISOString() },
        },
      });
    }
    const { version, ...data } = input;
    const r = await this.db.tx.progressUpdate.updateMany({
      where: { id, version },
      data: { ...data, ...(u.status === "PUBLISHED" ? { editedAt: new Date() } : {}), version: { increment: 1 } },
    });
    if (r.count === 0) throw conflict();
    if (u.status === "PUBLISHED") await this.audit.record("update.edited", "progress_update", id, { visibility: { before: u.visibility, after: input.visibility ?? u.visibility } });
    return this.db.tx.progressUpdate.findUnique({ where: { id } });
  }

  async publish(ctx: AuthContext, id: string) {
    const u = await this.db.tx.progressUpdate.findUnique({ where: { id } });
    if (!u || u.authorId !== ctx.membershipId) throw notFound("Update");
    if (u.status === "PUBLISHED") return u;
    const updated = await this.db.tx.progressUpdate.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date(), version: { increment: 1 } } });
    await this.afterPublish(updated);
    return updated;
  }

  async deleteDraft(ctx: AuthContext, id: string) {
    const r = await this.db.tx.progressUpdate.deleteMany({ where: { id, authorId: ctx.membershipId, status: "DRAFT" } });
    if (r.count === 0) throw notFound("Draft");
  }

  async acknowledge(ctx: AuthContext, id: string) {
    const u = await this.db.tx.progressUpdate.findUnique({ where: { id } });
    if (!u || !this.canView(ctx, u)) throw notFound("Update");
    if (u.authorId === ctx.membershipId) throw invalid("OWN_UPDATE", "You can't acknowledge your own update");
    const existing = await this.db.tx.updateAcknowledgement.findUnique({ where: { updateId_membershipId: { updateId: id, membershipId: ctx.membershipId } } });
    if (existing) return { ok: true };
    await this.db.tx.updateAcknowledgement.create({ data: { organizationId: this.db.orgId, updateId: id, membershipId: ctx.membershipId } });
    await this.events.emit("update.acknowledged", { updateId: id, authorId: u.authorId });
    return { ok: true };
  }

  /** Manager asks a report for a fresh update ("Update requested" — neutral wording). */
  async requestUpdate(ctx: AuthContext, memberId: string, note: string | null, projectId: string | null) {
    const d = canViewMemberWork(ctx, memberId);
    if (!d.allow || memberId === ctx.membershipId) throw forbidden("You can request updates from people in your reporting line");
    if (projectId && levelOf(this.scope(), projectId) !== "details") throw invalid("INVALID_PROJECT", "Project not found");
    await this.events.emit("update.requested", { memberId, note: note?.slice(0, 300) ?? null, projectId });
    return { ok: true };
  }

  /* -------------------------------- comments -------------------------------- */

  async comments(entityType: "UPDATE" | "BLOCKER" | "PROJECT", entityId: string) {
    const [rows, people] = await Promise.all([
      this.db.tx.comment.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "asc" }, take: 200 }),
      this.people.all(),
    ]);
    return rows.map((c) => ({ id: c.id, body: c.body, createdAt: c.createdAt, author: this.people.liteOf(people.get(c.authorId)) }));
  }

  /** The caller must already have verified that the viewer can see the parent entity. */
  async addComment(ctx: AuthContext, entityType: "UPDATE" | "BLOCKER" | "PROJECT", entityId: string, body: string, notify: { recipients: string[]; projectId: string | null }) {
    const c = await this.db.tx.comment.create({ data: { organizationId: this.db.orgId, entityType, entityId, authorId: ctx.membershipId, body } });
    await this.events.emit("comment.added", { commentId: c.id, entityType, entityId, recipients: notify.recipients, projectId: notify.projectId });
    return c;
  }

  async commentOnUpdate(ctx: AuthContext, id: string, body: string) {
    const u = await this.db.tx.progressUpdate.findUnique({ where: { id } });
    if (!u || !this.canView(ctx, u) || u.status !== "PUBLISHED") throw notFound("Update");
    return this.addComment(ctx, "UPDATE", id, body, { recipients: [u.authorId], projectId: u.projectId });
  }
}

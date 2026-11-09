import { Injectable } from "@nestjs/common";
import { assertTransition, type AuthContext, type MilestoneStatus, type Priority, type WorkItemStatus } from "@workmesh/core";
import { AuditService } from "../../common/audit.service";
import { currentStore } from "../../common/context";
import { Db } from "../../common/db.service";
import { EventsService } from "../../common/events.service";
import { conflict, invalid, notFound } from "../../common/errors";
import { PeopleService } from "../org/people.service";
import { ChangesService } from "./changes.service";
import { ProjectsService } from "./projects.service";

@Injectable()
export class ItemsService {
  constructor(
    private readonly db: Db,
    private readonly projects: ProjectsService,
    private readonly people: PeopleService,
    private readonly changes: ChangesService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private requireDetails(projectId: string) {
    if (currentStore()?.scope?.projectAccess.get(projectId) !== "details") throw notFound();
  }

  private async assertMember(id: string | null | undefined) {
    if (id && !(await this.db.tx.membership.findFirst({ where: { id, status: "ACTIVE" } }))) throw invalid("UNKNOWN_PERSON", "Person not found");
  }

  /* -------------------------------- milestones ------------------------------- */

  async getMilestone(id: string) {
    const m = await this.db.tx.milestone.findUnique({ where: { id }, include: { project: { select: { id: true, name: true, key: true } } } });
    if (!m) throw notFound("Milestone");
    this.requireDetails(m.projectId);
    const [items, people, history] = await Promise.all([
      this.db.tx.workItem.findMany({ where: { milestoneId: id }, orderBy: { sortOrder: "asc" } }),
      this.people.all(),
      this.db.tx.changeEvent.findMany({ where: { entityType: "MILESTONE", entityId: id }, orderBy: { createdAt: "desc" } }),
    ]);
    return {
      ...m,
      owner: this.people.liteOf(people.get(m.ownerId ?? "")),
      workItems: items.map((w) => ({ ...w, assignee: this.people.liteOf(people.get(w.assigneeId ?? "")) })),
      history,
    };
  }

  async createMilestone(ctx: AuthContext, projectId: string, input: { title: string; description?: string | null; ownerId?: string | null; dueDate?: Date | null; isCritical?: boolean }) {
    this.projects.requireEditable(ctx, projectId);
    await this.assertMember(input.ownerId);
    const count = await this.db.tx.milestone.count({ where: { projectId } });
    const m = await this.db.tx.milestone.create({ data: { ...input, organizationId: this.db.orgId, projectId, sortOrder: count } });
    await this.changes.record("MILESTONE", m.id, projectId, {}, { status: "PLANNED" }, ["status"]);
    return m;
  }

  async updateMilestone(ctx: AuthContext, id: string, input: { title?: string; description?: string | null; ownerId?: string | null; dueDate?: Date | null; isCritical?: boolean; status?: MilestoneStatus; version: number }) {
    const before = await this.db.tx.milestone.findUnique({ where: { id } });
    if (!before) throw notFound("Milestone");
    this.projects.requireEditable(ctx, before.projectId);
    await this.assertMember(input.ownerId);
    if (input.status) assertTransition("milestone", before.status, input.status);
    const { version, ...data } = input;
    const completedAt = input.status === "DONE" && before.status !== "DONE" ? new Date() : input.status && input.status !== "DONE" ? null : undefined;
    const r = await this.db.tx.milestone.updateMany({ where: { id, version }, data: { ...data, ...(completedAt !== undefined ? { completedAt } : {}), version: { increment: 1 } } });
    if (r.count === 0) throw conflict();
    const after = await this.db.tx.milestone.findUnique({ where: { id } });
    const n = await this.changes.record("MILESTONE", id, before.projectId, before, after!, ["status", "dueDate", "ownerId", "isCritical"]);
    if (n > 0) {
      await this.audit.record("milestone.updated", "milestone", id, { before: { status: before.status, dueDate: before.dueDate }, after: { status: after!.status, dueDate: after!.dueDate } });
      await this.events.emit("milestone.changed", { projectId: before.projectId, milestoneId: id, status: after!.status, from: before.status });
    }
    return after;
  }

  async deleteMilestone(ctx: AuthContext, id: string) {
    const m = await this.db.tx.milestone.findUnique({ where: { id } });
    if (!m) throw notFound("Milestone");
    this.projects.requireEditable(ctx, m.projectId);
    await this.db.tx.milestone.delete({ where: { id } });
    await this.audit.record("milestone.deleted", "milestone", id, { projectId: m.projectId, title: m.title });
  }

  /* -------------------------------- work items ------------------------------- */

  async listWorkItems(projectId: string) {
    this.requireDetails(projectId);
    const [items, people] = await Promise.all([
      this.db.tx.workItem.findMany({ where: { projectId }, orderBy: [{ status: "asc" }, { sortOrder: "asc" }] }),
      this.people.all(),
    ]);
    return items.map((w) => ({ ...w, assignee: this.people.liteOf(people.get(w.assigneeId ?? "")), reviewer: this.people.liteOf(people.get(w.reviewerId ?? "")) }));
  }

  /** Work assigned to a member, limited to projects the viewer can see in detail. */
  async assignedTo(memberId: string) {
    const scope = currentStore()!.scope!;
    const detailIds = [...scope.projectAccess].filter(([, l]) => l === "details").map(([id]) => id);
    return this.db.tx.workItem.findMany({
      where: { assigneeId: memberId, projectId: { in: detailIds }, status: { notIn: ["DONE", "CANCELLED"] } },
      include: { project: { select: { id: true, name: true, key: true } }, milestone: { select: { id: true, title: true, dueDate: true } } },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    });
  }

  async getWorkItem(id: string) {
    const w = await this.db.tx.workItem.findUnique({ where: { id }, include: { project: { select: { id: true, name: true, key: true } }, milestone: { select: { id: true, title: true } } } });
    if (!w) throw notFound("Work item");
    this.requireDetails(w.projectId);
    const [people, history] = await Promise.all([
      this.people.all(),
      this.db.tx.changeEvent.findMany({ where: { entityType: "WORK_ITEM", entityId: id }, orderBy: { createdAt: "desc" } }),
    ]);
    return { ...w, assignee: this.people.liteOf(people.get(w.assigneeId ?? "")), reviewer: this.people.liteOf(people.get(w.reviewerId ?? "")), history };
  }

  async createWorkItem(ctx: AuthContext, projectId: string, input: { title: string; description?: string | null; milestoneId?: string | null; assigneeId?: string | null; reviewerId?: string | null; priority?: Priority; dueDate?: Date | null }) {
    this.projects.requireEditable(ctx, projectId);
    await this.assertMember(input.assigneeId);
    await this.assertMember(input.reviewerId);
    if (input.milestoneId && !(await this.db.tx.milestone.findFirst({ where: { id: input.milestoneId, projectId } }))) throw invalid("INVALID_MILESTONE", "Milestone must belong to this project");
    const count = await this.db.tx.workItem.count({ where: { projectId } });
    const w = await this.db.tx.workItem.create({ data: { ...input, organizationId: this.db.orgId, projectId, sortOrder: count } });
    await this.changes.record("WORK_ITEM", w.id, projectId, {}, { status: "TODO", assigneeId: w.assigneeId }, ["status", "assigneeId"]);
    return w;
  }

  async updateWorkItem(ctx: AuthContext, id: string, input: { title?: string; description?: string | null; milestoneId?: string | null; assigneeId?: string | null; reviewerId?: string | null; priority?: Priority; dueDate?: Date | null; status?: WorkItemStatus; version: number }) {
    const before = await this.db.tx.workItem.findUnique({ where: { id } });
    if (!before) throw notFound("Work item");
    // Assignees may move their own items even without broader edit rights.
    if (before.assigneeId !== ctx.membershipId) this.projects.requireEditable(ctx, before.projectId);
    else this.requireDetails(before.projectId);
    await this.assertMember(input.assigneeId);
    if (input.milestoneId && !(await this.db.tx.milestone.findFirst({ where: { id: input.milestoneId, projectId: before.projectId } }))) throw invalid("INVALID_MILESTONE", "Milestone must belong to this project");
    if (input.status) assertTransition("workItem", before.status, input.status);
    const { version, ...data } = input;
    const completedAt = input.status === "DONE" && before.status !== "DONE" ? new Date() : input.status && input.status !== "DONE" ? null : undefined;
    const r = await this.db.tx.workItem.updateMany({ where: { id, version }, data: { ...data, ...(completedAt !== undefined ? { completedAt } : {}), version: { increment: 1 } } });
    if (r.count === 0) throw conflict();
    const after = await this.db.tx.workItem.findUnique({ where: { id } });
    const n = await this.changes.record("WORK_ITEM", id, before.projectId, before, after!, ["status", "assigneeId", "dueDate", "milestoneId"]);
    if (n > 0) await this.events.emit("workitem.changed", { projectId: before.projectId, workItemId: id, assigneeId: after!.assigneeId, previousAssigneeId: before.assigneeId });
    return after;
  }

  async deleteWorkItem(ctx: AuthContext, id: string) {
    const w = await this.db.tx.workItem.findUnique({ where: { id } });
    if (!w) throw notFound("Work item");
    this.projects.requireEditable(ctx, w.projectId);
    await this.db.tx.workItem.delete({ where: { id } });
    await this.audit.record("workitem.deleted", "work_item", id, { projectId: w.projectId });
  }
}

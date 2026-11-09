import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { buildBrief, canEditMeeting, canViewMeeting, label, type AuthContext, type MeetingVisibility } from "@workmesh/core";
import { AuditService } from "../../common/audit.service";
import { currentStore } from "../../common/context";
import { Db } from "../../common/db.service";
import { EventsService } from "../../common/events.service";
import { forbidden, invalid, notFound } from "../../common/errors";
import { PeopleService } from "../org/people.service";
import { detailIds } from "../policy/authz.types";
import { BlockersService } from "../updates/blockers.service";
import { UpdatesService } from "../updates/updates.service";

type MeetingFull = Prisma.MeetingGetPayload<{ include: { participants: true; projects: true; agenda: true; decisions: true; actionItems: true } }>;

export interface MeetingInput {
  title: string;
  description?: string | null;
  teamId?: string | null;
  scheduledAt: Date;
  durationMinutes?: number;
  recurrence?: "NONE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  visibility?: MeetingVisibility;
  participantIds?: string[];
  projectIds?: string[];
  agenda?: string[];
}

const INCLUDE = { participants: true, projects: true, agenda: { orderBy: { sortOrder: "asc" as const } }, decisions: { orderBy: { createdAt: "asc" as const } }, actionItems: { orderBy: { createdAt: "asc" as const } } };

@Injectable()
export class MeetingsService {
  constructor(
    private readonly db: Db,
    private readonly people: PeopleService,
    private readonly updates: UpdatesService,
    private readonly blockers: BlockersService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope() {
    return currentStore()!.scope!;
  }

  private resource(m: MeetingFull) {
    return { id: m.id, orgId: m.organizationId, organizerId: m.organizerId, participantIds: m.participants.map((p) => p.membershipId), visibility: m.visibility, teamId: m.teamId };
  }

  private async load(ctx: AuthContext, id: string, edit = false) {
    const m = await this.db.tx.meeting.findUnique({ where: { id }, include: INCLUDE });
    if (!m || !canViewMeeting(ctx, this.resource(m)).allow) throw notFound("Meeting");
    if (edit && !canEditMeeting(ctx, this.resource(m)).allow) throw forbidden("Only the organizer and participants can change this meeting");
    return m;
  }

  async list(ctx: AuthContext, f: { upcoming?: boolean; past?: boolean }) {
    const now = new Date();
    const rows = await this.db.tx.meeting.findMany({
      where: {
        OR: [
          { organizerId: ctx.membershipId },
          { participants: { some: { membershipId: ctx.membershipId } } },
          { visibility: "ORG" },
          { visibility: "TEAM", teamId: { in: [...ctx.teamIds] } },
        ],
        ...(f.upcoming ? { scheduledAt: { gte: new Date(now.getTime() - 2 * 3_600_000) }, status: { not: "COMPLETED" } } : {}),
        ...(f.past ? { OR: [{ status: "COMPLETED" }, { scheduledAt: { lt: now } }] } : {}),
      },
      include: INCLUDE,
      orderBy: { scheduledAt: f.past ? "desc" : "asc" },
      take: 100,
    });
    const people = await this.people.all();
    return rows
      .filter((m) => canViewMeeting(ctx, this.resource(m)).allow)
      .map((m) => ({
        id: m.id,
        title: m.title,
        scheduledAt: m.scheduledAt,
        durationMinutes: m.durationMinutes,
        recurrence: m.recurrence,
        status: m.status,
        visibility: m.visibility,
        organizer: this.people.liteOf(people.get(m.organizerId)),
        participantCount: m.participants.length,
        participants: m.participants.slice(0, 6).map((p) => this.people.liteOf(people.get(p.membershipId))).filter(Boolean),
        openActionItems: m.actionItems.filter((a) => a.status === "OPEN").length,
        decisions: m.decisions.length,
      }));
  }

  async get(ctx: AuthContext, id: string) {
    const m = await this.load(ctx, id);
    const scope = this.scope();
    const people = await this.people.all();
    const details = new Set(detailIds(scope));
    const projects = await this.db.tx.project.findMany({ where: { id: { in: m.projects.map((p) => p.projectId).filter((pid) => scope.projectAccess.has(pid)) } }, select: { id: true, name: true, key: true, status: true } });
    const visibleRef = (projectId: string | null, ownerIds: Array<string | null>) => !projectId || details.has(projectId) || ownerIds.includes(ctx.membershipId);
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      scheduledAt: m.scheduledAt,
      durationMinutes: m.durationMinutes,
      recurrence: m.recurrence,
      seriesId: m.seriesId ?? m.id,
      visibility: m.visibility,
      status: m.status,
      compareFrom: m.compareFrom,
      notes: m.notes,
      briefGeneratedAt: m.briefGeneratedAt,
      completedAt: m.completedAt,
      teamId: m.teamId,
      organizer: this.people.liteOf(people.get(m.organizerId)),
      participants: m.participants.map((p) => this.people.liteOf(people.get(p.membershipId))).filter(Boolean),
      projects,
      agenda: m.agenda,
      decisions: m.decisions
        .filter((d) => visibleRef(d.projectId, [d.createdById, d.ownerId]))
        .map((d) => ({ ...d, owner: this.people.liteOf(people.get(d.ownerId ?? "")), projectName: d.projectId ? (projectName.get(d.projectId) ?? null) : null })),
      actionItems: m.actionItems
        .filter((a) => visibleRef(a.projectId, [a.ownerId, a.createdById]))
        .map((a) => ({ ...a, owner: this.people.liteOf(people.get(a.ownerId)) })),
      canEdit: canEditMeeting(ctx, this.resource(m)).allow,
    };
  }

  private async validate(input: Partial<MeetingInput>) {
    const ids = input.participantIds ?? [];
    if (ids.length) {
      const n = await this.db.tx.membership.count({ where: { id: { in: ids }, status: "ACTIVE" } });
      if (n !== new Set(ids).size) throw invalid("UNKNOWN_PERSON", "All participants must be active members");
    }
    for (const pid of input.projectIds ?? []) if (!this.scope().projectAccess.has(pid)) throw invalid("INVALID_PROJECT", "Project not found");
    if (input.teamId && !(await this.db.tx.team.findUnique({ where: { id: input.teamId } }))) throw invalid("INVALID_TEAM", "Team not found");
  }

  async create(ctx: AuthContext, input: MeetingInput, extra: { seriesId?: string; compareFrom?: Date } = {}) {
    await this.validate(input);
    const orgId = this.db.orgId;
    const participants = [...new Set([ctx.membershipId, ...(input.participantIds ?? [])])];
    const m = await this.db.tx.meeting.create({
      data: {
        organizationId: orgId,
        title: input.title,
        description: input.description ?? null,
        organizerId: ctx.membershipId,
        teamId: input.teamId ?? null,
        scheduledAt: input.scheduledAt,
        durationMinutes: input.durationMinutes ?? 30,
        recurrence: input.recurrence ?? "NONE",
        visibility: input.visibility ?? "PARTICIPANTS",
        seriesId: extra.seriesId ?? null,
        compareFrom: extra.compareFrom ?? null,
        participants: { create: participants.map((membershipId) => ({ organizationId: orgId, membershipId })) },
        projects: { create: [...new Set(input.projectIds ?? [])].map((projectId) => ({ organizationId: orgId, projectId })) },
        agenda: { create: (input.agenda ?? []).map((title, i) => ({ organizationId: orgId, title, sortOrder: i, createdById: ctx.membershipId })) },
      },
    });
    await this.audit.record("meeting.created", "meeting", m.id, { participants: participants.length, recurrence: m.recurrence });
    return m;
  }

  async update(ctx: AuthContext, id: string, input: Partial<MeetingInput> & { notes?: string | null; compareFrom?: Date | null; status?: "SCHEDULED" | "IN_PROGRESS" | "CANCELLED" }) {
    const m = await this.load(ctx, id, true);
    await this.validate(input);
    const orgId = this.db.orgId;
    const { participantIds, projectIds, agenda: _agenda, ...data } = input;
    await this.db.tx.meeting.update({ where: { id }, data });
    if (participantIds) {
      const keep = [...new Set([m.organizerId, ...participantIds])];
      await this.db.tx.meetingParticipant.deleteMany({ where: { meetingId: id, membershipId: { notIn: keep } } });
      await this.db.tx.meetingParticipant.createMany({ data: keep.map((membershipId) => ({ organizationId: orgId, meetingId: id, membershipId })), skipDuplicates: true });
    }
    if (projectIds) {
      await this.db.tx.meetingProject.deleteMany({ where: { meetingId: id } });
      await this.db.tx.meetingProject.createMany({ data: [...new Set(projectIds)].map((projectId) => ({ organizationId: orgId, meetingId: id, projectId })) });
    }
    await this.events.emit("meeting.changed", { meetingId: id });
    return this.get(ctx, id);
  }

  /* ---------------------------------- brief --------------------------------- */

  async baseline(m: MeetingFull): Promise<Date> {
    if (m.compareFrom) return m.compareFrom;
    const seriesId = m.seriesId ?? m.id;
    const prev = await this.db.tx.meeting.findFirst({
      where: { OR: [{ seriesId }, { id: seriesId }], scheduledAt: { lt: m.scheduledAt }, id: { not: m.id } },
      orderBy: { scheduledAt: "desc" },
    });
    return prev?.scheduledAt ?? new Date(m.scheduledAt.getTime() - 7 * 86_400_000);
  }

  /** Brief computed for *this viewer*: two participants with different access see different briefs. */
  async brief(ctx: AuthContext, id: string, sinceOverride?: Date) {
    const m = await this.load(ctx, id);
    const scope = this.scope();
    const details = new Set(detailIds(scope));
    let projectIds = m.projects.map((p) => p.projectId).filter((pid) => details.has(pid));
    if (projectIds.length === 0 && m.teamId) {
      const teamProjects = await this.db.tx.project.findMany({ where: { owningTeamId: m.teamId, status: { notIn: ["COMPLETED", "CANCELLED"] } }, select: { id: true } });
      projectIds = teamProjects.map((p) => p.id).filter((pid) => details.has(pid));
    }
    const since = sinceOverride ?? (await this.baseline(m));
    const now = new Date();
    const participantIds = m.participants.map((p) => p.membershipId);
    const seriesId = m.seriesId ?? m.id;
    const people = await this.people.all();
    const name = (id: string | null) => (id ? (people.get(id)?.name ?? "Unknown") : null);

    const [projects, changes, milestones, blockerRows, updateRows, decisions, actionItems, assigned, lastPublished] = await Promise.all([
      this.db.tx.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }),
      this.db.tx.changeEvent.findMany({ where: { projectId: { in: projectIds }, createdAt: { gte: since } }, orderBy: { createdAt: "asc" } }),
      this.db.tx.milestone.findMany({ where: { projectId: { in: projectIds } } }),
      this.db.tx.blocker.findMany({ where: { AND: [this.blockers.visibilityWhere(ctx), { OR: [{ projectId: { in: projectIds } }, { reporterId: { in: participantIds }, projectId: null }] }] } }),
      this.db.tx.progressUpdate.findMany({ where: { AND: [this.updates.visibilityWhere(ctx), { status: "PUBLISHED", publishedAt: { gte: since } }, { OR: [{ projectId: { in: projectIds } }, { authorId: { in: participantIds } }] }] } }),
      this.db.tx.decision.findMany({ where: { OR: [{ projectId: { in: projectIds } }, { meeting: { OR: [{ seriesId }, { id: seriesId }] } }] } }),
      this.db.tx.actionItem.findMany({ where: { status: "OPEN", OR: [{ projectId: { in: projectIds } }, { meeting: { OR: [{ seriesId }, { id: seriesId }] } }] } }),
      this.db.tx.workItem.groupBy({ by: ["assigneeId"], where: { projectId: { in: projectIds }, assigneeId: { in: participantIds }, status: { notIn: ["DONE", "CANCELLED"] } }, _count: { _all: true } }),
      this.db.tx.progressUpdate.groupBy({ by: ["authorId"], where: { authorId: { in: participantIds }, status: "PUBLISHED" }, _max: { publishedAt: true } }),
    ]);

    const titles = new Map<string, string>();
    const wiIds = changes.filter((c) => c.entityType === "WORK_ITEM").map((c) => c.entityId);
    const wis = await this.db.tx.workItem.findMany({ where: { id: { in: wiIds } }, select: { id: true, title: true } });
    for (const w of wis) titles.set(w.id, w.title);
    for (const p of projects) titles.set(p.id, p.name);
    for (const ms of milestones) titles.set(ms.id, ms.title);

    const blockers = blockerRows.filter((b) => this.blockers.canView(ctx, b));
    const updates = updateRows.filter((u) => this.updates.canView(ctx, u));
    const allowRef = (projectId: string | null) => !projectId || details.has(projectId);

    const sections = buildBrief({
      since,
      now,
      horizonDays: 14,
      projects,
      changes: changes.map((c) => ({
        entityType: c.entityType,
        entityId: c.entityId,
        projectId: c.projectId,
        field: c.field,
        from: c.field === "leadId" ? name(c.fromValue) : c.fromValue,
        to: c.field === "leadId" ? name(c.toValue) : c.toValue,
        at: c.createdAt,
        title: titles.get(c.entityId) ?? "Item",
      })),
      milestones: milestones.map((x) => ({ id: x.id, projectId: x.projectId, title: x.title, status: x.status, dueDate: x.dueDate, completedAt: x.completedAt, isCritical: x.isCritical })),
      blockers: blockers.map((b) => ({ id: b.id, projectId: b.projectId, title: b.title, state: b.state, severity: b.severity, createdAt: b.createdAt, resolvedAt: b.resolvedAt, ownerName: name(b.ownerId) })),
      updates: updates.map((u) => ({ id: u.id, projectId: u.projectId, authorName: name(u.authorId) ?? "", publishedAt: u.publishedAt!, completed: u.completed, helpNeeded: u.helpNeeded })),
      decisions: decisions.filter((d) => allowRef(d.projectId)).map((d) => ({ id: d.id, projectId: d.projectId, title: d.title, status: d.status, createdAt: d.createdAt })),
      actionItems: actionItems.filter((a) => allowRef(a.projectId) || a.ownerId === ctx.membershipId).map((a) => ({ id: a.id, projectId: a.projectId, title: a.title, status: a.status, ownerName: name(a.ownerId) ?? "", dueDate: a.dueDate })),
      expectedReporters: assigned
        .filter((a) => a.assigneeId)
        .map((a) => ({ id: a.assigneeId!, name: name(a.assigneeId) ?? "", lastPublishedAt: lastPublished.find((l) => l.authorId === a.assigneeId)?._max.publishedAt ?? null })),
    });
    return { meetingId: id, since, generatedAt: now, projects, sections };
  }

  async shareBrief(ctx: AuthContext, id: string) {
    const m = await this.load(ctx, id, true);
    await this.db.tx.meeting.update({ where: { id }, data: { briefGeneratedAt: new Date() } });
    await this.events.emit("meeting.brief_ready", { meetingId: id, participantIds: m.participants.map((p) => p.membershipId) });
    return { ok: true };
  }

  /* ------------------------- agenda / decisions / actions ------------------------- */

  async addAgenda(ctx: AuthContext, id: string, input: { title: string; notes?: string | null; sourceType?: string | null; sourceId?: string | null }) {
    await this.load(ctx, id, true);
    const count = await this.db.tx.agendaItem.count({ where: { meetingId: id } });
    return this.db.tx.agendaItem.create({ data: { ...input, organizationId: this.db.orgId, meetingId: id, sortOrder: count, createdById: ctx.membershipId } });
  }

  async updateAgenda(ctx: AuthContext, itemId: string, input: { title?: string; notes?: string | null; discussed?: boolean; sortOrder?: number }) {
    const item = await this.db.tx.agendaItem.findUnique({ where: { id: itemId } });
    if (!item) throw notFound("Agenda item");
    await this.load(ctx, item.meetingId, true);
    return this.db.tx.agendaItem.update({ where: { id: itemId }, data: input });
  }

  async deleteAgenda(ctx: AuthContext, itemId: string) {
    const item = await this.db.tx.agendaItem.findUnique({ where: { id: itemId } });
    if (!item) throw notFound("Agenda item");
    await this.load(ctx, item.meetingId, true);
    await this.db.tx.agendaItem.delete({ where: { id: itemId } });
  }

  private assertProjectRef(projectId: string | null | undefined) {
    if (projectId && this.scope().projectAccess.get(projectId) !== "details") throw invalid("INVALID_PROJECT", "Project not found");
  }

  async addDecision(ctx: AuthContext, meetingId: string | null, input: { title: string; rationale?: string | null; projectId?: string | null; ownerId?: string | null; status?: "PENDING" | "DECIDED" }) {
    if (meetingId) await this.load(ctx, meetingId, true);
    this.assertProjectRef(input.projectId);
    if (input.ownerId && !(await this.db.tx.membership.findFirst({ where: { id: input.ownerId, status: "ACTIVE" } }))) throw invalid("UNKNOWN_PERSON", "Owner not found");
    const decided = input.status === "DECIDED";
    const d = await this.db.tx.decision.create({
      data: { ...input, organizationId: this.db.orgId, meetingId, createdById: ctx.membershipId, status: input.status ?? "PENDING", decidedById: decided ? ctx.membershipId : null, decidedAt: decided ? new Date() : null },
    });
    await this.audit.record("decision.recorded", "decision", d.id, { status: d.status, projectId: d.projectId, meetingId });
    await this.events.emit("decision.recorded", { decisionId: d.id, meetingId, ownerId: d.ownerId, projectId: d.projectId, status: d.status });
    return d;
  }

  async updateDecision(ctx: AuthContext, id: string, input: { title?: string; rationale?: string | null; status?: "PENDING" | "DECIDED" | "SUPERSEDED"; ownerId?: string | null }) {
    const d = await this.db.tx.decision.findUnique({ where: { id } });
    if (!d) throw notFound("Decision");
    if (d.meetingId) await this.load(ctx, d.meetingId, true);
    else if (d.createdById !== ctx.membershipId) throw forbidden("Only the author can change this decision");
    this.assertProjectRef(d.projectId);
    const decided = input.status === "DECIDED" && d.status !== "DECIDED";
    const updated = await this.db.tx.decision.update({ where: { id }, data: { ...input, ...(decided ? { decidedById: ctx.membershipId, decidedAt: new Date() } : {}) } });
    await this.audit.record("decision.updated", "decision", id, { before: d.status, after: updated.status });
    if (decided) await this.events.emit("decision.recorded", { decisionId: id, meetingId: d.meetingId, ownerId: updated.ownerId, projectId: d.projectId, status: updated.status });
    return updated;
  }

  async addActionItem(ctx: AuthContext, meetingId: string | null, input: { title: string; ownerId: string; dueDate?: Date | null; projectId?: string | null; decisionId?: string | null; blockerId?: string | null }) {
    if (meetingId) await this.load(ctx, meetingId, true);
    this.assertProjectRef(input.projectId);
    if (!(await this.db.tx.membership.findFirst({ where: { id: input.ownerId, status: "ACTIVE" } }))) throw invalid("UNKNOWN_PERSON", "Owner not found");
    if (input.blockerId) {
      const b = await this.db.tx.blocker.findUnique({ where: { id: input.blockerId } });
      if (!b || !this.blockers.canView(ctx, b)) throw invalid("INVALID_BLOCKER", "Blocker not found");
    }
    const a = await this.db.tx.actionItem.create({ data: { ...input, organizationId: this.db.orgId, meetingId, createdById: ctx.membershipId } });
    await this.audit.record("action_item.created", "action_item", a.id, { ownerId: a.ownerId, meetingId });
    await this.events.emit("action_item.assigned", { actionItemId: a.id, ownerId: a.ownerId, meetingId, projectId: a.projectId });
    return a;
  }

  async updateActionItem(ctx: AuthContext, id: string, input: { title?: string; ownerId?: string; dueDate?: Date | null; status?: "OPEN" | "DONE" | "CANCELLED" }) {
    const a = await this.db.tx.actionItem.findUnique({ where: { id } });
    if (!a) throw notFound("Action item");
    const isOwner = a.ownerId === ctx.membershipId;
    if (a.meetingId && !isOwner) await this.load(ctx, a.meetingId, true);
    else if (!a.meetingId && !isOwner && a.createdById !== ctx.membershipId) throw notFound("Action item");
    if (input.ownerId && !(await this.db.tx.membership.findFirst({ where: { id: input.ownerId, status: "ACTIVE" } }))) throw invalid("UNKNOWN_PERSON", "Owner not found");
    const completedAt = input.status === "DONE" ? new Date() : input.status ? null : undefined;
    const updated = await this.db.tx.actionItem.update({ where: { id }, data: { ...input, ...(completedAt !== undefined ? { completedAt } : {}) } });
    if (input.ownerId && input.ownerId !== a.ownerId) await this.events.emit("action_item.assigned", { actionItemId: id, ownerId: input.ownerId, meetingId: a.meetingId, projectId: a.projectId });
    return updated;
  }

  /** Completes a meeting; recurring meetings roll forward with carried-over agenda items. */
  async complete(ctx: AuthContext, id: string) {
    const m = await this.load(ctx, id, true);
    if (m.status === "COMPLETED") throw invalid("ALREADY_COMPLETED", "This meeting is already completed");
    await this.db.tx.meeting.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
    let next = null;
    if (m.recurrence !== "NONE") {
      const step = m.recurrence === "WEEKLY" ? 7 : m.recurrence === "BIWEEKLY" ? 14 : 0;
      const at = new Date(m.scheduledAt);
      if (step) at.setUTCDate(at.getUTCDate() + step);
      else at.setUTCMonth(at.getUTCMonth() + 1);
      next = await this.create(
        ctx,
        {
          title: m.title,
          description: m.description,
          teamId: m.teamId,
          scheduledAt: at,
          durationMinutes: m.durationMinutes,
          recurrence: m.recurrence,
          visibility: m.visibility,
          participantIds: m.participants.map((p) => p.membershipId),
          projectIds: m.projects.map((p) => p.projectId).filter((pid) => this.scope().projectAccess.has(pid)),
          agenda: m.agenda.filter((a) => !a.discussed).map((a) => a.title),
        },
        { seriesId: m.seriesId ?? m.id, compareFrom: m.scheduledAt },
      );
    }
    await this.audit.record("meeting.completed", "meeting", id, { nextMeetingId: next?.id ?? null });
    await this.events.emit("meeting.changed", { meetingId: id });
    return { ok: true, nextMeetingId: next?.id ?? null };
  }

  async summaryMarkdown(ctx: AuthContext, id: string) {
    const m = await this.get(ctx, id);
    const lines = [`# ${m.title}`, "", `**Date:** ${m.scheduledAt.toISOString().slice(0, 16).replace("T", " ")} UTC · **Organizer:** ${m.organizer?.name ?? ""}`, `**Participants:** ${m.participants.map((p) => p!.name).join(", ")}`];
    if (m.projects.length) lines.push(`**Projects:** ${m.projects.map((p) => `${p.name} (${p.key})`).join(", ")}`);
    lines.push("", "## Decisions");
    if (!m.decisions.length) lines.push("_No decisions recorded._");
    for (const d of m.decisions) lines.push(`- **${d.title}** — ${label(d.status)}${d.owner ? ` · owner: ${d.owner.name}` : ""}${d.projectName ? ` · ${d.projectName}` : ""}${d.rationale ? `\n  - ${d.rationale}` : ""}`);
    lines.push("", "## Action items");
    if (!m.actionItems.length) lines.push("_No action items._");
    for (const a of m.actionItems) lines.push(`- [${a.status === "DONE" ? "x" : " "}] ${a.title} — **${a.owner?.name ?? ""}**${a.dueDate ? ` · due ${a.dueDate.toISOString().slice(0, 10)}` : ""}`);
    const followUps = m.agenda.filter((a) => !a.discussed);
    lines.push("", "## Follow-ups");
    if (!followUps.length) lines.push("_All agenda items were discussed._");
    for (const a of followUps) lines.push(`- ${a.title}`);
    if (m.notes) lines.push("", "## Notes", m.notes);
    lines.push("", `_Generated by WorkMesh from records you are authorized to see._`);
    return lines.join("\n");
  }

  async decisionLog(ctx: AuthContext, status?: "PENDING" | "DECIDED") {
    const details = detailIds(this.scope());
    const rows = await this.db.tx.decision.findMany({
      where: { ...(status ? { status } : {}), OR: [{ projectId: { in: details } }, { projectId: null, createdById: ctx.membershipId }, { projectId: null, meeting: { participants: { some: { membershipId: ctx.membershipId } } } }] },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const people = await this.people.all();
    return rows.map((d) => ({ ...d, owner: this.people.liteOf(people.get(d.ownerId ?? "")) }));
  }

  async myActionItems(ctx: AuthContext, ownerId?: string) {
    const target = ownerId ?? ctx.membershipId;
    if (target !== ctx.membershipId && !ctx.managedMemberIds.has(target)) throw forbidden("Not in your reporting line");
    const details = new Set(detailIds(this.scope()));
    const rows = await this.db.tx.actionItem.findMany({ where: { ownerId: target, status: "OPEN" }, include: { meeting: { select: { id: true, title: true } } }, orderBy: { dueDate: "asc" } });
    return rows.filter((a) => target === ctx.membershipId || !a.projectId || details.has(a.projectId));
  }
}

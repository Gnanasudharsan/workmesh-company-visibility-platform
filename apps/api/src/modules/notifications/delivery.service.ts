import { Injectable, Logger } from "@nestjs/common";
import {
  buildIndex,
  canViewBlocker,
  canViewMeeting,
  canViewUpdate,
  dedupeKey,
  type AuthContext,
  type NotificationType,
} from "@workmesh/core";
import { Db } from "../../common/db.service";
import { MetricsService } from "../../common/metrics.service";
import { PeopleService } from "../org/people.service";
import { AuthzService } from "../policy/authz.service";
import type { ViewerScope } from "../policy/authz.types";
import { RealtimePublisher } from "./realtime.publisher";

interface Spec {
  recipientId: string;
  type: NotificationType;
  entityType: string;
  entityId: string;
  link: string;
  /** Builds the title/body for a recipient who passed authorization. `canSeeProject` gates project names. */
  render: (canSeeProject: boolean) => { title: string; body?: string };
  projectId?: string | null;
}

type Payload = Record<string, string | null | undefined | boolean | string[]>;

/**
 * Delivers one outbox event: computes candidate recipients, re-checks each recipient against
 * the policy engine with *their own* AuthContext, writes notifications idempotently
 * (unique recipient+dedupeKey), marks the event processed, then publishes realtime pings.
 *
 * Idempotency: processedAt guard + dedupe keys mean a retried or duplicated job cannot
 * produce duplicate notifications.
 */
@Injectable()
export class DeliveryService {
  private readonly logger = new Logger(DeliveryService.name);

  constructor(
    private readonly db: Db,
    private readonly authz: AuthzService,
    private readonly people: PeopleService,
    private readonly realtime: RealtimePublisher,
    private readonly metrics: MetricsService,
  ) {}

  async deliver(outboxId: string): Promise<"delivered" | "skipped"> {
    const event = await this.db.system.outboxEvent.findUnique({ where: { id: outboxId } });
    if (!event || event.processedAt) return "skipped";
    const end = this.metrics.jobDuration.startTimer({ type: event.type });
    const payload = event.payload as Payload;
    const actorId = (payload.actorId as string | null) ?? null;
    try {
      const realtimeTargets = new Set<string>();
      let created = 0;
      await this.db.runAsTenant(
        event.organizationId,
        async () => {
          const specs = await this.specsFor(event.type, payload);
          const people = await this.people.all();
          const contexts = new Map<string, { ctx: AuthContext; scope: ViewerScope } | null>();
          const load = async (id: string) => {
            if (!contexts.has(id)) {
              const p = people.get(id);
              const m = p?.active ? await this.db.tx.membership.findUnique({ where: { id }, select: { userId: true } }) : null;
              contexts.set(id, m ? await this.authz.load(event.organizationId, id, m.userId) : null);
            }
            return contexts.get(id)!;
          };
          const prefs = await this.db.tx.notificationPreference.findMany({ where: { inApp: false, membershipId: { in: specs.map((s) => s.recipientId) } } });
          const muted = new Set(prefs.map((p) => `${p.membershipId}:${p.type}`));

          const rows = [];
          for (const spec of specs) {
            if (spec.recipientId === actorId) continue;
            const loaded = await load(spec.recipientId);
            if (!loaded || !(await this.authorized(loaded, spec))) continue;
            realtimeTargets.add(spec.recipientId);
            if (muted.has(`${spec.recipientId}:${spec.type}`)) continue;
            const canSeeProject = !spec.projectId || loaded.scope.projectAccess.get(spec.projectId) === "details";
            const { title, body } = spec.render(canSeeProject);
            rows.push({
              organizationId: event.organizationId,
              recipientId: spec.recipientId,
              type: spec.type,
              title: title.slice(0, 200),
              body: body?.slice(0, 500) ?? null,
              link: spec.link,
              entityType: spec.entityType,
              entityId: spec.entityId,
              actorId,
              dedupeKey: dedupeKey({ type: spec.type, entityId: spec.entityId, eventId: event.id, at: event.createdAt }),
            });
          }
          if (rows.length) {
            const res = await this.db.tx.notification.createMany({ data: rows, skipDuplicates: true });
            created = res.count;
            for (const r of rows) this.metrics.notificationsDelivered.inc({ type: r.type });
          }
          // Realtime fan-out also targets people who can see the entity but got no notification
          // (e.g. they muted it) and the actor's own other tabs.
          for (const id of await this.watchers(event.type, payload)) {
            const loaded = await load(id);
            if (loaded && (await this.authorized(loaded, { ...specBase(event.type, payload), recipientId: id } as Spec))) realtimeTargets.add(id);
          }
          if (actorId) realtimeTargets.add(actorId);
        },
        { requestId: event.correlationId ?? undefined },
      );
      await this.db.system.outboxEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), attempts: { increment: 1 }, lastError: null } });
      await this.realtime.publish(event.organizationId, [...realtimeTargets], {
        type: event.type,
        entityIds: Object.fromEntries(Object.entries(payload).filter(([k, v]) => k.endsWith("Id") && typeof v === "string" && k !== "actorId")) as Record<string, string>,
        notifications: created > 0,
        correlationId: event.correlationId,
      });
      end({ outcome: "ok" });
      return "delivered";
    } catch (err) {
      end({ outcome: "error" });
      this.metrics.jobFailures.inc({ type: event.type });
      await this.db.system.outboxEvent.update({ where: { id: event.id }, data: { attempts: { increment: 1 }, lastError: (err as Error).message.slice(0, 500) } });
      this.logger.warn({ outboxId, correlationId: event.correlationId, err: (err as Error).message }, "delivery failed");
      throw err;
    }
  }

  /** Re-runs the relevant view policy for the recipient. */
  private async authorized(loaded: { ctx: AuthContext; scope: ViewerScope }, spec: Pick<Spec, "entityType" | "entityId" | "projectId">): Promise<boolean> {
    const { ctx, scope } = loaded;
    const level = (pid: string | null | undefined) => (pid ? (scope.projectAccess.get(pid) ?? "none") : null);
    switch (spec.entityType) {
      case "update": {
        const u = await this.db.tx.progressUpdate.findUnique({ where: { id: spec.entityId } });
        return !!u && canViewUpdate(ctx, { id: u.id, orgId: u.organizationId, authorId: u.authorId, status: u.status, visibility: u.visibility, projectId: u.projectId }, level(u.projectId)).allow;
      }
      case "blocker": {
        const b = await this.db.tx.blocker.findUnique({ where: { id: spec.entityId } });
        return !!b && canViewBlocker(ctx, { id: b.id, orgId: b.organizationId, reporterId: b.reporterId, ownerId: b.ownerId, projectId: b.projectId, visibility: b.visibility }, level(b.projectId)).allow;
      }
      case "meeting": {
        const m = await this.db.tx.meeting.findUnique({ where: { id: spec.entityId }, include: { participants: true } });
        return !!m && canViewMeeting(ctx, { id: m.id, orgId: m.organizationId, organizerId: m.organizerId, participantIds: m.participants.map((p) => p.membershipId), visibility: m.visibility, teamId: m.teamId }).allow;
      }
      case "project":
      case "milestone":
      case "workItem":
      case "dependency":
        return level(spec.projectId) === "details";
      case "actionItem":
      case "decision":
      case "member":
        return !spec.projectId || level(spec.projectId) === "details";
      default:
        return false;
    }
  }

  private async managersOf(memberId: string): Promise<string[]> {
    const [lines, delegations] = await Promise.all([
      this.db.tx.reportingLine.findMany({ where: { endedAt: null }, select: { reportId: true, managerId: true, type: true } }),
      this.db.tx.delegation.findMany({ where: { revokedAt: null, startsAt: { lte: new Date() }, expiresAt: { gt: new Date() } } }),
    ]);
    const idx = buildIndex(lines);
    const out = new Set<string>();
    const queue = [memberId];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const m of idx.managersOf.get(cur) ?? []) {
        if (out.has(m) || m === memberId) continue;
        out.add(m);
        queue.push(m);
      }
    }
    for (const d of delegations) if (out.has(d.delegatorId)) out.add(d.delegateId);
    return [...out];
  }

  private async projectMembers(projectId: string | null | undefined) {
    if (!projectId) return [];
    const rows = await this.db.tx.projectMember.findMany({ where: { projectId }, select: { membershipId: true } });
    return rows.map((r) => r.membershipId);
  }

  private async name(id: string | null | undefined) {
    return id ? ((await this.people.all()).get(id)?.name ?? "Someone") : "Someone";
  }

  private async projectName(id: string | null | undefined) {
    if (!id) return null;
    return (await this.db.tx.project.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
  }

  /** People who should receive a realtime refresh even without a notification. */
  private async watchers(type: string, p: Payload): Promise<string[]> {
    if (type.startsWith("project.") || type.startsWith("milestone.") || type.startsWith("workitem.")) return this.projectMembers(p.projectId as string);
    if (type === "dependency.changed") return [...(await this.projectMembers(p.upstreamProjectId as string)), ...(await this.projectMembers(p.downstreamProjectId as string))];
    if (type === "meeting.changed") {
      const rows = await this.db.tx.meetingParticipant.findMany({ where: { meetingId: p.meetingId as string } });
      return rows.map((r) => r.membershipId);
    }
    if (type.startsWith("blocker.")) {
      const b = await this.db.tx.blocker.findUnique({ where: { id: p.blockerId as string } });
      return b ? [b.reporterId, ...(b.ownerId ? [b.ownerId] : []), ...(await this.managersOf(b.reporterId)), ...(await this.projectMembers(b.projectId))] : [];
    }
    if (type === "update.published") return this.managersOf(p.authorId as string);
    return [];
  }

  private async specsFor(type: string, p: Payload): Promise<Spec[]> {
    const actor = await this.name(p.actorId as string);
    const projectId = (p.projectId as string | null) ?? null;
    const pname = await this.projectName(projectId);
    const on = (see: boolean) => (pname && see ? ` on ${pname}` : "");
    const base = specBase(type, p);
    const to = (ids: Array<string | null | undefined>, t: NotificationType, render: Spec["render"]): Spec[] =>
      [...new Set(ids.filter((x): x is string => !!x))].map((recipientId) => ({ ...base, recipientId, type: t, render, projectId: base.projectId ?? projectId }));

    switch (type) {
      case "update.published": {
        const managers = await this.managersOf(p.authorId as string);
        const lead = projectId ? (await this.db.tx.project.findUnique({ where: { id: projectId }, select: { leadId: true } }))?.leadId : null;
        return [
          ...to([...managers, lead], "UPDATE_PUBLISHED", (see) => ({ title: `${actor} shared a progress update${on(see)}` })),
          ...to([p.helpFromId as string], "HELP_REQUESTED", (see) => ({ title: `${actor} asked for your help${on(see)}` })),
        ];
      }
      case "update.acknowledged":
        return to([p.authorId as string], "UPDATE_ACKNOWLEDGED", () => ({ title: `${actor} acknowledged your update` }));
      case "update.requested":
        return to([p.memberId as string], "UPDATE_REQUESTED", (see) => ({ title: `${actor} asked for a progress update${on(see)}`, body: (p.note as string) ?? undefined }));
      case "comment.added":
        return to(p.recipients as string[], "COMMENT_ADDED", (see) => ({ title: `${actor} commented${on(see)}` }));
      case "blocker.created": {
        const managers = await this.managersOf(p.reporterId as string);
        const lead = projectId ? (await this.db.tx.project.findUnique({ where: { id: projectId }, select: { leadId: true } }))?.leadId : null;
        return to([...managers, lead], "BLOCKER_CHANGED", (see) => ({ title: `${actor} reported a ${String(p.severity).toLowerCase()}-severity blocker${on(see)}` }));
      }
      case "blocker.assigned":
        return to([p.ownerId as string], "BLOCKER_ASSIGNED", (see) => ({ title: `${actor} assigned you a blocker${on(see)}` }));
      case "blocker.changed":
        return to([p.reporterId as string, p.ownerId as string], "BLOCKER_CHANGED", () => ({ title: `${actor} moved a blocker to ${String(p.state).toLowerCase()}` }));
      case "project.changed":
        if (!p.status) return [];
        return to(await this.projectMembers(projectId), "PROJECT_STATUS_CHANGED", (see) => ({ title: see && pname ? `${pname} is now ${String(p.status).toLowerCase().replace("_", " ")}` : "A project status changed" }));
      case "project.member_added":
        return to([p.membershipId as string], "PROJECT_INVITED", (see) => ({ title: `${actor} added you to ${see && pname ? pname : "a project"}` }));
      case "milestone.changed":
        if (p.status === p.from) return [];
        return to(await this.projectMembers(projectId), "MILESTONE_CHANGED", (see) => ({ title: `A milestone${on(see)} is now ${String(p.status).toLowerCase().replace("_", " ")}` }));
      case "workitem.changed":
        if (!p.assigneeId || p.assigneeId === p.previousAssigneeId) return [];
        return to([p.assigneeId as string], "WORK_ASSIGNED", (see) => ({ title: `${actor} assigned you work${on(see)}` }));
      case "dependency.changed": {
        const leads = await this.db.tx.project.findMany({ where: { id: { in: [p.upstreamProjectId as string, p.downstreamProjectId as string] } }, select: { leadId: true } });
        return to(leads.map((l) => l.leadId), "DEPENDENCY_CHANGED", () => ({ title: `A cross-project dependency is now ${String(p.state).toLowerCase().replace("_", " ")}` }));
      }
      case "decision.recorded":
        return to([p.ownerId as string], "DECISION_ASSIGNED", () => ({ title: `${actor} recorded a decision you own` }));
      case "action_item.assigned":
        return to([p.ownerId as string], "ACTION_ITEM_ASSIGNED", () => ({ title: `${actor} assigned you an action item` }));
      case "meeting.brief_ready":
        return to(p.participantIds as string[], "MEETING_BRIEF_READY", () => ({ title: "A meeting brief is ready for review" }));
      case "blocker.escalated":
        return to(await this.managersOf(p.reporterId as string), "BLOCKER_ESCALATED", () => ({ title: "An unowned high-severity blocker needs an owner" }));
      default:
        return [];
    }
  }
}

function specBase(type: string, p: Payload): Omit<Spec, "recipientId" | "type" | "render"> {
  const projectId = (p.projectId as string | null) ?? null;
  if (type === "update.requested") return { entityType: "member", entityId: p.memberId as string, link: "/updates/new", projectId };
  if (type.startsWith("update.")) return { entityType: "update", entityId: p.updateId as string, link: `/updates/${p.updateId}`, projectId };
  if (type === "comment.added") {
    const et = p.entityType === "UPDATE" ? "update" : p.entityType === "BLOCKER" ? "blocker" : "project";
    return { entityType: et, entityId: p.entityId as string, link: `/${et === "update" ? "updates" : et === "blocker" ? "blockers" : "projects"}/${p.entityId}`, projectId };
  }
  if (type.startsWith("blocker.")) return { entityType: "blocker", entityId: p.blockerId as string, link: `/blockers/${p.blockerId}`, projectId };
  if (type === "milestone.changed") return { entityType: "milestone", entityId: p.milestoneId as string, link: `/projects/${projectId}?tab=milestones`, projectId };
  if (type === "workitem.changed") return { entityType: "workItem", entityId: p.workItemId as string, link: `/projects/${projectId}?tab=work&item=${p.workItemId}`, projectId };
  if (type === "dependency.changed") return { entityType: "dependency", entityId: p.dependencyId as string, link: `/dependencies?projectId=${p.downstreamProjectId}`, projectId: p.downstreamProjectId as string };
  if (type === "decision.recorded") return { entityType: "decision", entityId: p.decisionId as string, link: p.meetingId ? `/meetings/${p.meetingId}` : "/decisions", projectId };
  if (type === "action_item.assigned") return { entityType: "actionItem", entityId: p.actionItemId as string, link: p.meetingId ? `/meetings/${p.meetingId}` : "/my-work?tab=actions", projectId };
  if (type.startsWith("meeting.")) return { entityType: "meeting", entityId: p.meetingId as string, link: `/meetings/${p.meetingId}`, projectId: null };
  return { entityType: "project", entityId: projectId as string, link: `/projects/${projectId}`, projectId };
}

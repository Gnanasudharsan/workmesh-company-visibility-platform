import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Worker } from "bullmq";
import { dedupeKey } from "@workmesh/core";
import { Db } from "../../common/db.service";
import { EVENTS_QUEUE, QueueService, redisConnection } from "../../common/queue.service";
import { config } from "../../config";
import { DeliveryService } from "./delivery.service";

const POLL_MS = 10_000;
const MAINTENANCE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 8;

/**
 * Background processing:
 *  - BullMQ worker consumes "deliver" jobs (one per outbox event, jobId = outbox id).
 *  - Recovery poller re-enqueues outbox rows that were committed but never delivered
 *    (Redis outage, crash between commit and enqueue). Delivery is idempotent.
 *  - Maintenance: configurable blocker escalation and deadline reminders, both deduped.
 * Runs inside the API (WORKER_INLINE=true) or as `node dist/worker.js`.
 */
@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private worker?: Worker;
  private timers: NodeJS.Timeout[] = [];
  enabled = false;

  constructor(
    private readonly db: Db,
    private readonly queue: QueueService,
    private readonly delivery: DeliveryService,
  ) {}

  onModuleInit() {
    if (process.env.WORKMESH_ROLE === "worker" || (config().WORKER_INLINE && process.env.WORKMESH_ROLE !== "api-only")) this.start();
  }

  start() {
    if (this.enabled) return;
    this.enabled = true;
    this.worker = new Worker(EVENTS_QUEUE, async (job) => this.delivery.deliver(job.data.outboxId as string), {
      connection: redisConnection(),
      prefix: config().REDIS_PREFIX,
      concurrency: 4,
    });
    this.worker.on("failed", (job, err) => this.logger.warn(`job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`));
    this.worker.on("error", (err) => this.logger.warn(`worker error: ${err.message}`));
    this.timers.push(setInterval(() => void this.recover().catch(() => undefined), POLL_MS));
    this.timers.push(setInterval(() => void this.maintenance().catch((e: Error) => this.logger.warn(e.message)), MAINTENANCE_MS));
    this.logger.log("background worker started");
  }

  /** Re-enqueue committed-but-undelivered events. */
  async recover() {
    const stale = await this.db.system.outboxEvent.findMany({
      where: { processedAt: null, attempts: { lt: MAX_ATTEMPTS }, createdAt: { lt: new Date(Date.now() - 15_000) } },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: { id: true },
    });
    for (const e of stale) {
      try {
        const existing = await this.queue.queue.getJob(e.id);
        if (existing && (await existing.isFailed())) await existing.remove();
        if (!existing || (await existing.isFailed())) await this.queue.enqueue(e.id);
      } catch {
        // Redis unavailable: deliver directly so notifications are not lost.
        await this.delivery.deliver(e.id).catch(() => undefined);
      }
    }
    return stale.length;
  }

  /** Blocker escalation (opt-in per org) and deadline reminders. */
  async maintenance(now = new Date()) {
    const orgs = await this.db.system.organization.findMany({ select: { id: true, escalateBlockersAfterHours: true } });
    for (const org of orgs) {
      await this.db.runAsTenant(org.id, async () => {
        if (org.escalateBlockersAfterHours) {
          const cutoff = new Date(now.getTime() - org.escalateBlockersAfterHours * 3_600_000);
          const due = await this.db.tx.blocker.findMany({ where: { ownerId: null, escalatedAt: null, state: { in: ["OPEN", "REOPENED"] }, severity: { in: ["HIGH", "CRITICAL"] }, createdAt: { lt: cutoff } } });
          for (const b of due) {
            await this.db.tx.blocker.update({ where: { id: b.id }, data: { escalatedAt: now } });
            const ev = await this.db.tx.outboxEvent.create({ data: { organizationId: org.id, type: "blocker.escalated", payload: { blockerId: b.id, reporterId: b.reporterId, projectId: b.projectId, actorId: null } } });
            this.db.afterCommit(() => this.queue.enqueue(ev.id).catch(() => undefined));
          }
        }
        const soon = new Date(now.getTime() + 3 * 86_400_000);
        const milestones = await this.db.tx.milestone.findMany({
          where: { status: { in: ["PLANNED", "IN_PROGRESS"] }, dueDate: { gte: now, lte: soon } },
          include: { project: { select: { leadId: true, name: true } } },
        });
        const rows = milestones.flatMap((m) =>
          [...new Set([m.ownerId, m.project.leadId].filter((x): x is string => !!x))].map((recipientId) => ({
            organizationId: org.id,
            recipientId,
            type: "DEADLINE_APPROACHING",
            title: `"${m.title}" is due ${m.dueDate!.toISOString().slice(0, 10)}`,
            body: m.isCritical ? "Critical milestone" : null,
            link: `/projects/${m.projectId}?tab=milestones`,
            entityType: "milestone",
            entityId: m.id,
            dedupeKey: dedupeKey({ type: "DEADLINE_APPROACHING", entityId: m.id, eventId: "daily", at: now }),
          })),
        );
        if (rows.length) await this.db.tx.notification.createMany({ data: rows, skipDuplicates: true });
      });
    }
  }

  async onModuleDestroy() {
    for (const t of this.timers) clearInterval(t);
    await this.worker?.close().catch(() => undefined);
  }
}

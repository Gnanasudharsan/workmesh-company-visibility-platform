import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { currentStore } from "./context";
import { Db } from "./db.service";
import { QueueService } from "./queue.service";

export type DomainEventType =
  | "update.published"
  | "update.acknowledged"
  | "update.requested"
  | "comment.added"
  | "blocker.created"
  | "blocker.assigned"
  | "blocker.changed"
  | "project.changed"
  | "project.member_added"
  | "milestone.changed"
  | "workitem.changed"
  | "dependency.changed"
  | "decision.recorded"
  | "action_item.assigned"
  | "meeting.brief_ready"
  | "meeting.changed";

/**
 * Transactional outbox. `emit` writes the event row in the caller's transaction; delivery is
 * scheduled only after commit. If the enqueue fails (Redis down, crash between commit and
 * enqueue), the outbox poller re-enqueues unprocessed rows, so committed events are never lost.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly db: Db,
    private readonly queue: QueueService,
  ) {}

  async emit(type: DomainEventType, payload: Record<string, unknown>) {
    const store = currentStore();
    const event = await this.db.tx.outboxEvent.create({
      data: {
        organizationId: this.db.orgId,
        type,
        payload: { ...payload, actorId: store?.auth?.membershipId ?? null } as Prisma.InputJsonValue,
        correlationId: store?.requestId?.slice(0, 64) ?? null,
      },
      select: { id: true },
    });
    this.db.afterCommit(async () => {
      try {
        await this.queue.enqueue(event.id);
      } catch (err) {
        this.logger.warn(`enqueue failed for ${event.id}; poller will retry (${(err as Error).message})`);
      }
    });
    return event.id;
  }
}

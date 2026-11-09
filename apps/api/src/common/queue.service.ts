import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config";

export const EVENTS_QUEUE = "wm-events";

export function redisConnection() {
  return new IORedis(config().REDIS_URL, { maxRetriesPerRequest: null, enableOfflineQueue: false, lazyConnect: false });
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  readonly connection = redisConnection();
  readonly queue = new Queue(EVENTS_QUEUE, {
    connection: this.connection,
    prefix: config().REDIS_PREFIX,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: { count: 1_000, age: 24 * 3600 },
      removeOnFail: { count: 5_000 },
    },
  });

  constructor() {
    this.connection.on("error", (err) => this.logger.warn(`redis: ${err.message}`));
  }

  /** jobId = outbox id, so the same event can never be queued twice concurrently. */
  async enqueue(outboxId: string) {
    await this.queue.add("deliver", { outboxId }, { jobId: outboxId });
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.connection.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async counts() {
    return this.queue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
  }

  async onModuleDestroy() {
    await this.queue.close().catch(() => undefined);
    this.connection.disconnect();
  }
}

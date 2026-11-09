import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { redisConnection } from "../../common/queue.service";

import { config } from "../../config";

export const realtimeChannel = () => `${config().REDIS_PREFIX}:realtime`;

export interface RealtimeEnvelope {
  orgId: string;
  recipients: string[];
  event: { type: string; entityIds: Record<string, string>; notifications: boolean; correlationId?: string | null };
}

/**
 * Publishes realtime pings through Redis pub/sub so a standalone worker process and any
 * number of API instances can fan out to the sockets they hold. Payloads carry only event
 * types and IDs — clients refetch through the authorized REST API.
 */
@Injectable()
export class RealtimePublisher implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimePublisher.name);
  private readonly redis = redisConnection();

  constructor() {
    this.redis.on("error", (e) => this.logger.warn(`redis: ${e.message}`));
  }

  async publish(orgId: string, recipients: string[], event: RealtimeEnvelope["event"]) {
    if (recipients.length === 0) return;
    const envelope: RealtimeEnvelope = { orgId, recipients, event };
    try {
      await this.redis.publish(realtimeChannel(), JSON.stringify(envelope));
    } catch (err) {
      // Realtime is best effort; durable state lives in Postgres and clients resync on reconnect.
      this.logger.warn(`realtime publish failed: ${(err as Error).message}`);
    }
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}

import "./env";
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Db } from "./common/db.service";
import { MetricsService } from "./common/metrics.service";
import { QueueService } from "./common/queue.service";
import { DeliveryService } from "./modules/notifications/delivery.service";
import { RealtimePublisher } from "./modules/notifications/realtime.publisher";
import { WorkerService } from "./modules/notifications/worker.service";
import { PeopleService } from "./modules/org/people.service";
import { AuthzService } from "./modules/policy/authz.service";

/** Standalone background worker: `node dist/worker.js` (set WORKER_INLINE=false on the API). */
@Module({ providers: [Db, QueueService, MetricsService, AuthzService, PeopleService, RealtimePublisher, DeliveryService, WorkerService] })
class WorkerModule {}

async function main() {
  process.env.WORKMESH_ROLE = "worker";
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
}

void main();

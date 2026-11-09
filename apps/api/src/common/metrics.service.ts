import { Injectable } from "@nestjs/common";
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpDuration = new Histogram({
    name: "workmesh_http_request_duration_seconds",
    help: "HTTP request latency",
    labelNames: ["method", "route", "status"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [this.registry],
  });

  readonly jobDuration = new Histogram({
    name: "workmesh_job_duration_seconds",
    help: "Background job duration",
    labelNames: ["type", "outcome"],
    buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [this.registry],
  });

  readonly notificationsDelivered = new Counter({
    name: "workmesh_notifications_delivered_total",
    help: "Notifications created by the worker",
    labelNames: ["type"],
    registers: [this.registry],
  });

  readonly jobFailures = new Counter({
    name: "workmesh_job_failures_total",
    help: "Background job failures",
    labelNames: ["type"],
    registers: [this.registry],
  });

  readonly realtimeMessages = new Counter({
    name: "workmesh_realtime_messages_total",
    help: "Realtime messages emitted to sockets",
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: "workmesh_" });
  }
}

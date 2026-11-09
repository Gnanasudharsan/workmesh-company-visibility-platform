import { Controller, Get, Headers, Res, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { Db } from "../../common/db.service";
import { Public } from "../../common/decorators";
import { MetricsService } from "../../common/metrics.service";
import { QueueService } from "../../common/queue.service";
import { config } from "../../config";

@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(
    private readonly db: Db,
    private readonly queue: QueueService,
  ) {}

  /** Liveness: the process is up. */
  @Public()
  @Get("live")
  live() {
    return { status: "ok" };
  }

  /** Readiness: verifies the real dependencies (both DB roles, RLS, Redis, queue). */
  @Public()
  @Get()
  async ready() {
    const started = Date.now();
    const check = async (fn: () => Promise<unknown>) => {
      const t = Date.now();
      try {
        const detail = await fn();
        return { ok: true, ms: Date.now() - t, ...(detail && typeof detail === "object" ? detail : {}) };
      } catch (err) {
        return { ok: false, ms: Date.now() - t, error: (err as Error).message.slice(0, 200) };
      }
    };
    const [database, rls, redis, queue] = await Promise.all([
      check(async () => {
        await this.db.system.$queryRaw`SELECT 1`;
      }),
      check(async () => {
        // The app role must see zero rows when no tenant is set: proves RLS is active.
        const rows = await this.db.app.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM organizations`;
        if (Number(rows[0]?.n ?? 0) !== 0) throw new Error("RLS not enforced for the application role");
        return { enforced: true };
      }),
      check(async () => {
        if (!(await this.queue.ping())) throw new Error("Redis did not answer PING");
      }),
      check(async () => ({ jobs: await this.queue.counts() })),
    ]);
    const body = { status: database.ok && rls.ok && redis.ok && queue.ok ? "ok" : "degraded", checks: { database, rls, redis, queue }, ms: Date.now() - started };
    if (body.status !== "ok") throw new ServiceUnavailableException(body);
    return body;
  }
}

@SkipThrottle()
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  /** Prometheus metrics. Protected by a bearer token; never public. */
  @Public()
  @Get()
  async scrape(@Headers("authorization") authorization: string | undefined, @Res() res: Response) {
    const token = config().METRICS_TOKEN;
    if (!token || authorization !== `Bearer ${token}`) throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Metrics token required" });
    res.setHeader("Content-Type", this.metrics.registry.contentType);
    res.send(await this.metrics.registry.metrics());
  }
}

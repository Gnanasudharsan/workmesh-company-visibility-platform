import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AuditService } from "./common/audit.service";
import { Db } from "./common/db.service";
import { AllExceptionsFilter } from "./common/errors";
import { EventsService } from "./common/events.service";
import { AuthGuard, CsrfGuard } from "./common/guards";
import { MetricsService } from "./common/metrics.service";
import { QueueService } from "./common/queue.service";
import { TenantTransactionInterceptor } from "./common/tenant.interceptor";
import { config } from "./config";
import { AuthController, PublicInvitationsController } from "./modules/auth/auth.controller";
import { AuthService } from "./modules/auth/auth.service";
import { InvitationsService } from "./modules/auth/invitations.service";
import { MailService } from "./modules/auth/mail.service";
import { SessionsService } from "./modules/auth/sessions.service";
import { HealthController, MetricsController } from "./modules/health/health.controller";
import { OrgController } from "./modules/org/org.controller";
import { OrgService } from "./modules/org/org.service";
import { PeopleService } from "./modules/org/people.service";
import { AuthzService } from "./modules/policy/authz.service";
import { FEATURE_CONTROLLERS, FEATURE_PROVIDERS } from "./modules/features";

/**
 * Modular monolith: feature folders under src/modules, one DI container.
 * Request pipeline: request-id → throttler → AuthGuard (session → AuthContext) → CsrfGuard
 *                   → TenantTransactionInterceptor (RLS transaction) → controller.
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: config().LOG_LEVEL,
        genReqId: (req, res) => {
          const id = (req.headers["x-request-id"] as string | undefined)?.slice(0, 64) || randomUUID();
          res.setHeader("x-request-id", id);
          return id;
        },
        // Request/response bodies are never logged; credentials are redacted.
        redact: ["req.headers.cookie", "req.headers.authorization", "req.headers['x-csrf-token']", "res.headers['set-cookie']"],
        customProps: (req) => ({ orgId: (req as Request & { auth?: { orgId?: string } }).auth?.orgId }),
        autoLogging: { ignore: (req) => (req.url ?? "").startsWith("/api/health") },
        transport: config().NODE_ENV === "development" ? { target: "pino-pretty", options: { singleLine: true } } : undefined,
      },
    }),
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: config().RATE_LIMIT_PER_MINUTE }]),
  ],
  controllers: [AuthController, PublicInvitationsController, OrgController, HealthController, MetricsController, ...FEATURE_CONTROLLERS],
  providers: [
    Db,
    QueueService,
    EventsService,
    AuditService,
    MetricsService,
    SessionsService,
    AuthService,
    MailService,
    InvitationsService,
    AuthzService,
    PeopleService,
    OrgService,
    ...FEATURE_PROVIDERS,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantTransactionInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  constructor(private readonly metrics: MetricsService) {}

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req: Request, res: Response, next: NextFunction) => {
        const end = this.metrics.httpDuration.startTimer();
        res.on("finish", () => {
          const route = (req.route?.path as string | undefined) ?? "unmatched";
          end({ method: req.method, route, status: String(res.statusCode) });
        });
        next();
      })
      .forRoutes("*");
  }
}

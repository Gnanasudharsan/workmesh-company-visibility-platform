import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { from, lastValueFrom, Observable } from "rxjs";
import { defaultIfEmpty } from "rxjs/operators";
import { Db } from "./db.service";
import type { RequestAuth } from "./request-auth";

/**
 * Runs every organization-scoped request inside one RLS-scoped transaction.
 * Consequences:
 *  - all reads see a consistent snapshot of one tenant only (enforced by Postgres);
 *  - multi-record writes are atomic — an exception anywhere rolls the whole request back;
 *  - outbox events are committed together with the change that produced them.
 */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(private readonly db: Db) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const req = context.switchToHttp().getRequest<Request & { auth?: RequestAuth; id?: string }>();
    const auth = req.auth;
    if (!auth?.orgId) return next.handle();
    const requestId = (req.headers["x-request-id"] as string) ?? String(req.id ?? "");
    return from(
      this.db.runAsTenant(auth.orgId, () => lastValueFrom(next.handle().pipe(defaultIfEmpty(undefined))), {
        requestId,
        auth: auth.ctx,
        scope: auth.scope,
      }),
    );
  }
}

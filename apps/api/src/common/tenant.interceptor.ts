import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { from, lastValueFrom, Observable } from "rxjs";
import { defaultIfEmpty } from "rxjs/operators";
import { Db } from "./db.service";
import { NO_REQUEST_TX_KEY } from "./decorators";
import type { RequestAuth } from "./request-auth";

/**
 * Runs every organization-scoped request inside one RLS-scoped transaction.
 * Consequences:
 *  - all reads see a consistent snapshot of one tenant only (enforced by Postgres);
 *  - multi-record writes are atomic — an exception anywhere rolls the whole request back;
 *  - outbox events are committed together with the change that produced them.
 *
 * Handlers marked `@NoRequestTransaction()` open their own short tenant transactions instead
 * (same AuthContext and ViewerScope), so nothing holds a connection while waiting on a model.
 */
@Injectable()
export class TenantTransactionInterceptor implements NestInterceptor {
  constructor(
    private readonly db: Db,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const req = context.switchToHttp().getRequest<Request & { auth?: RequestAuth; id?: string }>();
    const auth = req.auth;
    if (!auth?.orgId) return next.handle();
    if (this.reflector.getAllAndOverride<boolean>(NO_REQUEST_TX_KEY, [context.getHandler(), context.getClass()])) return next.handle();
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

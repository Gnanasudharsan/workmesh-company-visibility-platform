import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { RequestAuth } from "./request-auth";

export const PUBLIC_KEY = "wm:public";
export const ALLOW_NO_ORG_KEY = "wm:allowNoOrg";
export const NO_REQUEST_TX_KEY = "wm:noRequestTx";

/** Route does not require a session. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Route requires a session but not an active organization (e.g. /auth/me, switch-org). */
export const AllowNoOrg = () => SetMetadata(ALLOW_NO_ORG_KEY, true);

/**
 * The handler is not wrapped in the request-wide tenant transaction. It must open its own short
 * transactions with `Db.runAsTenant(orgId, fn, { auth, scope })` using the request's AuthContext and
 * ViewerScope. Used by the copilot, whose model calls must not hold a pooled connection open.
 * Authentication, CSRF and rate limiting are unaffected.
 */
export const NoRequestTransaction = () => SetMetadata(NO_REQUEST_TX_KEY, true);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestAuth => {
  const req = ctx.switchToHttp().getRequest();
  return req.auth;
});

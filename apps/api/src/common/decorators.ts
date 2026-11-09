import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { RequestAuth } from "./request-auth";

export const PUBLIC_KEY = "wm:public";
export const ALLOW_NO_ORG_KEY = "wm:allowNoOrg";

/** Route does not require a session. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Route requires a session but not an active organization (e.g. /auth/me, switch-org). */
export const AllowNoOrg = () => SetMetadata(ALLOW_NO_ORG_KEY, true);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestAuth => {
  const req = ctx.switchToHttp().getRequest();
  return req.auth;
});

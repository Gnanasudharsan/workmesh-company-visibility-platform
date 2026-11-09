import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { config } from "../config";
import { AuthzService } from "../modules/policy/authz.service";
import { SESSION_COOKIE, SessionsService } from "../modules/auth/sessions.service";
import { Db } from "./db.service";
import { ALLOW_NO_ORG_KEY, PUBLIC_KEY } from "./decorators";
import type { RequestAuth } from "./request-auth";

type AuthedRequest = Request & { auth?: RequestAuth };

/**
 * Resolves the session cookie into a RequestAuth. The organization comes from the
 * server-side session, never from the client; the membership is re-checked on every
 * request, so a deactivated member is locked out immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    private readonly db: Db,
    private readonly authz: AuthzService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets) ?? false;
    const allowNoOrg = this.reflector.getAllAndOverride<boolean>(ALLOW_NO_ORG_KEY, targets) ?? false;
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const session = token ? await this.sessions.validate(token) : null;
    if (!session) {
      if (isPublic) return true;
      throw new UnauthorizedException({ code: "UNAUTHENTICATED", message: "Please sign in." });
    }

    const auth: RequestAuth = {
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      sessionId: session.id,
      csrfToken: session.csrfToken,
    };
    req.auth = auth;

    if (session.activeOrganizationId) {
      const orgId = session.activeOrganizationId;
      const membership = await this.db.system.membership.findFirst({
        where: { organizationId: orgId, userId: session.user.id, status: "ACTIVE" },
        select: { id: true },
      });
      if (membership) {
        const loaded = await this.db.runAsTenant(orgId, () => this.authz.load(orgId, membership.id, session.user.id));
        if (loaded && loaded.ctx.active) {
          auth.orgId = orgId;
          auth.membershipId = membership.id;
          auth.ctx = loaded.ctx;
          auth.scope = loaded.scope;
        }
      }
    }

    if (!auth.orgId && !allowNoOrg && !isPublic) {
      throw new ForbiddenException({ code: "NO_ORGANIZATION", message: "Select an organization to continue." });
    }
    return true;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF protection for cookie-authenticated requests:
 *  1. Origin (or Referer) must be the configured web origin when present.
 *  2. Double-submit token: X-CSRF-Token header must equal the session's CSRF token.
 * SameSite=Lax cookies are a third layer.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "http") return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = (req.headers.origin as string | undefined) ?? refererOrigin(req.headers.referer);
    if (origin && origin !== config().WEB_ORIGIN) {
      throw new ForbiddenException({ code: "BAD_ORIGIN", message: "Cross-origin request rejected." });
    }
    if (!req.auth) return true; // unauthenticated endpoints (login/register) are protected by origin + rate limits
    const header = req.headers["x-csrf-token"];
    if (typeof header !== "string" || header !== req.auth.csrfToken) {
      throw new ForbiddenException({ code: "CSRF", message: "Missing or invalid CSRF token. Reload the page." });
    }
    return true;
  }
}

function refererOrigin(referer?: string) {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

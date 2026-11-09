import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { Response } from "express";
import { Db } from "../../common/db.service";
import { config } from "../../config";

export const SESSION_COOKIE = "wm_session";
export const CSRF_COOKIE = "wm_csrf";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

/**
 * Opaque server-side sessions. The browser holds a random 256-bit token in an HTTP-only
 * cookie; the database stores only its SHA-256 hash, so a database leak does not yield
 * usable session tokens. Tokens never appear in URLs.
 */
@Injectable()
export class SessionsService {
  constructor(private readonly db: Db) {}

  async create(userId: string, activeOrganizationId: string | null, userAgent?: string) {
    const token = randomToken();
    const csrfToken = randomToken(24);
    const ttl = config().SESSION_TTL_HOURS * 3_600_000;
    const session = await this.db.system.session.create({
      data: {
        tokenHash: sha256(token),
        userId,
        activeOrganizationId,
        csrfToken,
        expiresAt: new Date(Date.now() + ttl),
        userAgent: userAgent?.slice(0, 200),
      },
    });
    return { token, session };
  }

  async validate(token: string) {
    const session = await this.db.system.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
    // Sliding activity timestamp, written at most every 5 minutes.
    if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
      await this.db.system.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    return session;
  }

  async revoke(sessionId: string) {
    await this.db.system.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string) {
    await this.db.system.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async setActiveOrg(sessionId: string, organizationId: string | null) {
    await this.db.system.session.update({ where: { id: sessionId }, data: { activeOrganizationId: organizationId } });
  }

  writeCookies(res: Response, token: string, csrfToken: string) {
    const cfg = config();
    const maxAge = cfg.SESSION_TTL_HOURS * 3_600_000;
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: cfg.COOKIE_SECURE, path: "/", maxAge });
    // Readable by the web app so it can echo it in the X-CSRF-Token header (double submit).
    res.cookie(CSRF_COOKIE, csrfToken, { httpOnly: false, sameSite: "lax", secure: cfg.COOKIE_SECURE, path: "/", maxAge });
  }

  clearCookies(res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.clearCookie(CSRF_COOKIE, { path: "/" });
  }
}

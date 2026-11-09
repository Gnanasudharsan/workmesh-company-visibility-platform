import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ORG_ROLES } from "@workmesh/core";
import type { Request, Response } from "express";
import { z } from "zod";
import { AllowNoOrg, Auth, Public } from "../../common/decorators";
import type { RequestAuth } from "../../common/request-auth";
import { V } from "../../common/zod.pipe";
import { config } from "../../config";
import { AuthService } from "./auth.service";
import { InvitationsService } from "./invitations.service";
import { SessionsService } from "./sessions.service";

const authLimit = () => ({ default: { limit: Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 20), ttl: 60_000 } });

const email = z.email().max(254).transform((v) => v.trim().toLowerCase());
const password = z.string().min(10, "Use at least 10 characters").max(200);

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email,
  password,
  organizationName: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and single dashes"),
  title: z.string().trim().max(100).optional(),
});

export const inviteSchema = z.object({
  email,
  role: z.enum(ORG_ROLES).default("MEMBER"),
  title: z.string().trim().max(100).nullable().optional(),
  teamId: z.uuid().nullable().optional(),
  managerId: z.uuid().nullable().optional(),
});

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
  ) {}

  @Public()
  @Throttle(authLimit())
  @Post("register")
  async register(@Body(V(registerSchema)) body: z.infer<typeof registerSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(body, req.headers["user-agent"]);
    this.sessions.writeCookies(res, result.token, result.csrfToken);
    return { ok: true, organizationId: result.organizationId };
  }

  @Public()
  @Throttle(authLimit())
  @HttpCode(200)
  @Post("login")
  async login(@Body(V(z.object({ email, password: z.string().min(1).max(200) }))) body: { email: string; password: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(body.email, body.password, req.headers["user-agent"]);
    this.sessions.writeCookies(res, result.token, result.csrfToken);
    return { ok: true };
  }

  @Public()
  @HttpCode(200)
  @Post("logout")
  async logout(@Auth() auth: RequestAuth | undefined, @Res({ passthrough: true }) res: Response) {
    if (auth) await this.sessions.revoke(auth.sessionId);
    this.sessions.clearCookies(res);
    return { ok: true };
  }

  @AllowNoOrg()
  @Get("me")
  me(@Auth() auth: RequestAuth) {
    return this.auth.me(auth);
  }

  @AllowNoOrg()
  @HttpCode(200)
  @Post("switch-organization")
  async switchOrg(@Auth() auth: RequestAuth, @Body(V(z.object({ organizationId: z.uuid() }))) body: { organizationId: string }) {
    await this.auth.switchOrganization(auth, body.organizationId);
    return { ok: true };
  }

  @Public()
  @Throttle(authLimit())
  @HttpCode(200)
  @Post("password/forgot")
  async forgot(@Body(V(z.object({ email }))) body: { email: string }) {
    await this.auth.requestPasswordReset(body.email);
    return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
  }

  @Public()
  @Throttle(authLimit())
  @HttpCode(200)
  @Post("password/reset")
  async reset(@Body(V(z.object({ token: z.string().min(10).max(200), password }))) body: { token: string; password: string }) {
    await this.auth.resetPassword(body.token, body.password);
    return { ok: true };
  }

  @Public()
  @Throttle(authLimit())
  @HttpCode(200)
  @Post("demo-login")
  async demoLogin(@Body(V(z.object({ email }))) body: { email: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.demoLogin(body.email, req.headers["user-agent"]);
    this.sessions.writeCookies(res, result.token, result.csrfToken);
    return { ok: true };
  }
}

@Controller("invitations")
export class PublicInvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly sessions: SessionsService,
  ) {}

  @Public()
  @Throttle(authLimit())
  @Get("lookup/:token")
  lookup(@Param("token") token: string) {
    return this.invitations.lookup(token.slice(0, 200));
  }

  @Public()
  @Throttle(authLimit())
  @HttpCode(200)
  @Post("accept")
  async accept(
    @Body(V(z.object({ token: z.string().min(10).max(200), name: z.string().trim().min(2).max(100).optional(), password }))) body: { token: string; name?: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.invitations.accept(body, req.headers["user-agent"]);
    this.sessions.writeCookies(res, result.token, result.csrfToken);
    return { ok: true };
  }
}

export const isDemo = () => !!config().DEMO_MODE && config().NODE_ENV !== "production";

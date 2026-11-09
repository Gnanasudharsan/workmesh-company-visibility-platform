import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { authorizedWorkspaces } from "@workmesh/core";
import { Db } from "../../common/db.service";
import { invalid, notFound } from "../../common/errors";
import type { RequestAuth } from "../../common/request-auth";
import { config } from "../../config";
import { MailService } from "./mail.service";
import { hashPassword, verifyPassword } from "./password";
import { randomToken, SessionsService, sha256 } from "./sessions.service";

const RESERVED_SLUGS = new Set(["api", "admin", "app", "login", "register", "invite", "dev", "www", "static"]);

@Injectable()
export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly sessions: SessionsService,
    private readonly mail: MailService,
  ) {}

  async register(input: {
    name: string;
    email: string;
    password: string;
    organizationName: string;
    slug: string;
    title?: string;
  }, userAgent?: string) {
    const email = input.email.toLowerCase();
    if (RESERVED_SLUGS.has(input.slug)) throw invalid("SLUG_RESERVED", "That URL is reserved. Choose another.");
    const [existingUser, existingOrg] = await Promise.all([
      this.db.system.user.findUnique({ where: { email } }),
      this.db.system.organization.findUnique({ where: { slug: input.slug } }),
    ]);
    if (existingUser) throw new ConflictException({ code: "EMAIL_TAKEN", message: "An account with this email exists. Sign in instead." });
    if (existingOrg) throw new ConflictException({ code: "SLUG_TAKEN", message: "That company URL is already taken." });

    const passwordHash = await hashPassword(input.password);
    const { user, org } = await this.db.system.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, name: input.name, passwordHash } });
      const org = await tx.organization.create({ data: { name: input.organizationName, slug: input.slug } });
      const membership = await tx.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
      });
      await tx.employeeProfile.create({
        data: {
          organizationId: org.id,
          membershipId: membership.id,
          displayName: input.name,
          workEmail: email,
          title: input.title || "Founder",
          avatarHue: hueFor(email),
        },
      });
      await tx.auditEvent.create({
        data: { organizationId: org.id, actorId: membership.id, action: "organization.created", resourceType: "organization", resourceId: org.id, metadata: { slug: org.slug } },
      });
      return { user, org };
    });
    const { token, session } = await this.sessions.create(user.id, org.id, userAgent);
    return { token, csrfToken: session.csrfToken, organizationId: org.id };
  }

  async login(emailRaw: string, password: string, userAgent?: string) {
    const email = emailRaw.toLowerCase();
    const user = await this.db.system.user.findUnique({ where: { email } });
    const ok = await verifyPassword(user?.passwordHash ?? null, password);
    if (!user || !ok) throw new UnauthorizedException({ code: "BAD_CREDENTIALS", message: "Email or password is incorrect." });
    const membership = await this.db.system.membership.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { joinedAt: "asc" },
    });
    await this.db.system.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const { token, session } = await this.sessions.create(user.id, membership?.organizationId ?? null, userAgent);
    return { token, csrfToken: session.csrfToken };
  }

  /** Demo-only: sign in as a seeded persona without a password. Disabled unless DEMO_MODE. */
  async demoLogin(email: string, userAgent?: string) {
    if (!config().DEMO_MODE || config().NODE_ENV === "production") throw notFound();
    const user = await this.db.system.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw notFound("Persona");
    const membership = await this.db.system.membership.findFirst({
      where: { userId: user.id, status: "ACTIVE", organization: { isDemo: true } },
    });
    if (!membership) throw notFound("Persona");
    const { token, session } = await this.sessions.create(user.id, membership.organizationId, userAgent);
    return { token, csrfToken: session.csrfToken };
  }

  async me(auth: RequestAuth) {
    const memberships = await this.db.system.membership.findMany({
      where: { userId: auth.userId, status: "ACTIVE" },
      include: { organization: { select: { id: true, name: true, slug: true, isDemo: true } } },
      orderBy: { joinedAt: "asc" },
    });
    let active: Record<string, unknown> | null = null;
    if (auth.orgId && auth.membershipId && auth.ctx) {
      const m = memberships.find((x) => x.organizationId === auth.orgId)!;
      const profile = await this.db.runAsTenant(auth.orgId, () =>
        this.db.tx.employeeProfile.findUnique({ where: { membershipId: auth.membershipId! } }),
      );
      active = {
        organization: m.organization,
        membershipId: auth.membershipId,
        role: m.role,
        onboardedAt: m.onboardedAt,
        profile: profile && {
          displayName: profile.displayName,
          title: profile.title,
          avatarHue: profile.avatarHue,
        },
        workspaces: authorizedWorkspaces(auth.ctx),
        relationships: {
          directReports: auth.ctx.directReportIds.size,
          managed: auth.ctx.managedMemberIds.size,
          teams: auth.ctx.teamIds.size,
          ledTeams: auth.ctx.ledTeamIds.size,
          ledProjects: [...auth.ctx.projectRoles.values()].filter((r) => r === "LEAD").length,
          headedDepartments: auth.ctx.headedDepartmentIds.size,
        },
      };
    }
    return {
      user: { id: auth.userId, email: auth.email, name: auth.name },
      organizations: memberships.map((m) => ({ ...m.organization, role: m.role })),
      active,
      csrfToken: auth.csrfToken,
      demoMode: !!config().DEMO_MODE,
    };
  }

  async switchOrganization(auth: RequestAuth, organizationId: string) {
    const membership = await this.db.system.membership.findFirst({
      where: { organizationId, userId: auth.userId, status: "ACTIVE" },
    });
    // Same response for "doesn't exist" and "not a member": no tenant enumeration.
    if (!membership) throw notFound("Organization");
    await this.sessions.setActiveOrg(auth.sessionId, organizationId);
  }

  async requestPasswordReset(emailRaw: string) {
    const email = emailRaw.toLowerCase();
    const user = await this.db.system.user.findUnique({ where: { email } });
    if (!user) return; // identical response whether or not the account exists
    const token = randomToken();
    await this.db.system.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const link = `${config().WEB_ORIGIN}/reset-password/${token}`;
    await this.mail.send(email, "Reset your WorkMesh password", `Use this link within one hour to choose a new password:\n${link}`, link);
  }

  async resetPassword(token: string, password: string) {
    const record = await this.db.system.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date())
      throw invalid("TOKEN_INVALID", "This reset link is invalid or has expired.");
    const passwordHash = await hashPassword(password);
    await this.db.system.$transaction([
      this.db.system.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.db.system.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.db.system.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }
}

export function hueFor(seed: string): number {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

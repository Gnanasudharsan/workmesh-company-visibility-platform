import { ConflictException, Injectable } from "@nestjs/common";
import { validateReportingChange, type OrgRole } from "@workmesh/core";
import { AuditService } from "../../common/audit.service";
import { Db } from "../../common/db.service";
import { invalid, notFound } from "../../common/errors";
import { config } from "../../config";
import { hueFor } from "./auth.service";
import { MailService } from "./mail.service";
import { hashPassword, verifyPassword } from "./password";
import { randomToken, SessionsService, sha256 } from "./sessions.service";

const INVITE_TTL_MS = 7 * 24 * 3_600_000;

/**
 * Invitation lifecycle: PENDING → ACCEPTED | REVOKED | EXPIRED.
 *  - tokens are random, stored hashed, single-use and expire after 7 days
 *  - one PENDING invitation per (org, email), enforced by a partial unique index
 *  - resend rotates the token (old links stop working) and extends expiry
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly db: Db,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly sessions: SessionsService,
  ) {}

  /** Tenant-scoped (admin). */
  async list() {
    await this.expireStale();
    return this.db.tx.invitation.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, email: true, role: true, title: true, teamId: true, managerId: true, status: true,
        expiresAt: true, acceptedAt: true, sendCount: true, lastSentAt: true, createdAt: true, invitedById: true,
      },
    });
  }

  async create(input: { email: string; role: OrgRole; title?: string | null; teamId?: string | null; managerId?: string | null }, inviterId: string) {
    const tx = this.db.tx;
    const email = input.email.toLowerCase();
    await this.expireStale();
    const existingMember = await tx.employeeProfile.findFirst({
      where: { workEmail: email, membership: { status: "ACTIVE" } },
      select: { id: true },
    });
    if (existingMember) throw new ConflictException({ code: "ALREADY_MEMBER", message: "This person is already a member." });
    const pending = await tx.invitation.findFirst({ where: { email, status: "PENDING" } });
    if (pending) throw new ConflictException({ code: "ALREADY_INVITED", message: "An invitation is already pending. Resend it instead." });
    if (input.teamId && !(await tx.team.findUnique({ where: { id: input.teamId } }))) throw invalid("INVALID_TEAM", "Team not found");
    if (input.managerId && !(await tx.membership.findFirst({ where: { id: input.managerId, status: "ACTIVE" } })))
      throw invalid("INVALID_MANAGER", "Manager not found");

    const token = randomToken();
    const invitation = await tx.invitation.create({
      data: {
        organizationId: this.db.orgId,
        email,
        role: input.role,
        title: input.title ?? null,
        teamId: input.teamId ?? null,
        managerId: input.managerId ?? null,
        tokenHash: sha256(token),
        invitedById: inviterId,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    await this.audit.record("invitation.created", "invitation", invitation.id, { email, role: input.role });
    const link = await this.sendMail(email, token, inviterId);
    return { id: invitation.id, email, status: invitation.status, expiresAt: invitation.expiresAt, ...(config().DEMO_MODE ? { devLink: link } : {}) };
  }

  async resend(id: string, actorId: string) {
    const inv = await this.db.tx.invitation.findUnique({ where: { id } });
    if (!inv) throw notFound("Invitation");
    if (inv.status !== "PENDING" && inv.status !== "EXPIRED") throw invalid("NOT_PENDING", "Only pending or expired invitations can be resent.");
    const token = randomToken();
    await this.db.tx.invitation.update({
      where: { id },
      data: { tokenHash: sha256(token), status: "PENDING", expiresAt: new Date(Date.now() + INVITE_TTL_MS), sendCount: { increment: 1 }, lastSentAt: new Date() },
    });
    await this.audit.record("invitation.resent", "invitation", id, { email: inv.email });
    const link = await this.sendMail(inv.email, token, actorId);
    return { ok: true, ...(config().DEMO_MODE ? { devLink: link } : {}) };
  }

  async revoke(id: string) {
    const res = await this.db.tx.invitation.updateMany({ where: { id, status: "PENDING" }, data: { status: "REVOKED" } });
    if (res.count === 0) throw notFound("Pending invitation");
    await this.audit.record("invitation.revoked", "invitation", id);
  }

  private async expireStale() {
    await this.db.tx.invitation.updateMany({ where: { status: "PENDING", expiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } });
  }

  private async sendMail(email: string, token: string, inviterId: string) {
    const [org, inviter] = await Promise.all([
      this.db.tx.organization.findUnique({ where: { id: this.db.orgId }, select: { name: true } }),
      this.db.tx.employeeProfile.findUnique({ where: { membershipId: inviterId }, select: { displayName: true } }),
    ]);
    const link = `${config().WEB_ORIGIN}/invite/${token}`;
    await this.mail.send(
      email,
      `${inviter?.displayName ?? "A colleague"} invited you to ${org?.name} on WorkMesh`,
      `You've been invited to join ${org?.name} on WorkMesh. This link works once and expires in 7 days:\n${link}`,
      link,
    );
    return link;
  }

  /* ------------------------------ public flows ------------------------------ */

  async lookup(token: string) {
    const inv = await this.db.system.invitation.findUnique({ where: { tokenHash: sha256(token) } });
    if (!inv) throw notFound("Invitation");
    const expired = inv.status === "PENDING" && inv.expiresAt < new Date();
    if (expired) await this.db.system.invitation.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
    const [org, inviter, existingUser] = await Promise.all([
      this.db.system.organization.findUnique({ where: { id: inv.organizationId }, select: { name: true } }),
      this.db.system.employeeProfile.findFirst({
        where: { membershipId: inv.invitedById, organizationId: inv.organizationId },
        select: { displayName: true },
      }),
      this.db.system.user.findUnique({ where: { email: inv.email }, select: { id: true } }),
    ]);
    return {
      organizationName: org?.name,
      email: inv.email,
      role: inv.role,
      title: inv.title,
      inviterName: inviter?.displayName ?? null,
      status: expired ? "EXPIRED" : inv.status,
      expiresAt: inv.expiresAt,
      existingAccount: !!existingUser,
    };
  }

  async accept(input: { token: string; name?: string; password: string }, userAgent?: string) {
    const tokenHash = sha256(input.token);
    const inv = await this.db.system.invitation.findUnique({ where: { tokenHash } });
    if (!inv || inv.status !== "PENDING" || inv.expiresAt < new Date())
      throw invalid("INVITE_INVALID", "This invitation is no longer valid. Ask your administrator to resend it.");
    const orgId = inv.organizationId;

    let user = await this.db.system.user.findUnique({ where: { email: inv.email } });
    if (user) {
      if (!(await verifyPassword(user.passwordHash, input.password)))
        throw invalid("BAD_CREDENTIALS", "Enter the password of your existing WorkMesh account.");
    } else if (!input.name) {
      throw invalid("NAME_REQUIRED", "Tell us your name.");
    }
    const passwordHash = user ? null : await hashPassword(input.password);

    // System client (the invitee has no tenant context yet): every write sets organizationId explicitly.
    const membershipId = await this.db.system.$transaction(async (tx) => {
      // Single use: only one concurrent acceptance can flip PENDING → ACCEPTED.
      const claimed = await tx.invitation.updateMany({
        where: { id: inv.id, status: "PENDING", tokenHash },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw invalid("INVITE_INVALID", "This invitation was already used.");
      if (!user) user = await tx.user.create({ data: { email: inv.email, name: input.name!, passwordHash: passwordHash! } });
      const existing = await tx.membership.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId: user.id } } });
      if (existing?.status === "ACTIVE") throw new ConflictException({ code: "ALREADY_MEMBER", message: "You're already a member." });
      const membership = existing
        ? await tx.membership.update({ where: { id: existing.id }, data: { status: "ACTIVE", role: inv.role, deactivatedAt: null } })
        : await tx.membership.create({ data: { organizationId: orgId, userId: user.id, role: inv.role } });
      await tx.employeeProfile.upsert({
        where: { membershipId: membership.id },
        update: {},
        create: {
          organizationId: orgId,
          membershipId: membership.id,
          displayName: user.name,
          workEmail: inv.email,
          title: inv.title ?? "Team member",
          avatarHue: hueFor(inv.email),
        },
      });
      if (inv.teamId) {
        const team = await tx.team.findFirst({ where: { id: inv.teamId, organizationId: orgId } });
        if (team) await tx.teamMembership.create({ data: { organizationId: orgId, teamId: team.id, membershipId: membership.id } });
      }
      if (inv.managerId) {
        const manager = await tx.membership.findFirst({ where: { id: inv.managerId, organizationId: orgId } });
        const lines = await tx.reportingLine.findMany({ where: { organizationId: orgId, endedAt: null } });
        const error = validateReportingChange({
          orgId,
          report: { id: membership.id, orgId, active: true },
          manager: manager ? { id: manager.id, orgId: manager.organizationId, active: manager.status === "ACTIVE" } : undefined,
          type: "PRIMARY",
          existing: lines.map((l) => ({ reportId: l.reportId, managerId: l.managerId, type: l.type })),
          replacePrimary: true,
        });
        if (!error) {
          await tx.reportingLine.updateMany({ where: { organizationId: orgId, reportId: membership.id, type: "PRIMARY", endedAt: null }, data: { endedAt: new Date() } });
          await tx.reportingLine.create({ data: { organizationId: orgId, reportId: membership.id, managerId: inv.managerId, type: "PRIMARY", reason: "Set by invitation" } });
        }
      }
      await tx.organization.update({ where: { id: orgId }, data: { authzVersion: { increment: 1 } } });
      await tx.auditEvent.create({
        data: { organizationId: orgId, actorId: membership.id, action: "invitation.accepted", resourceType: "membership", resourceId: membership.id, metadata: { invitationId: inv.id, role: inv.role } },
      });
      return membership.id;
    });
    const { token, session } = await this.sessions.create(user!.id, orgId, userAgent);
    return { token, csrfToken: session.csrfToken, membershipId };
  }
}

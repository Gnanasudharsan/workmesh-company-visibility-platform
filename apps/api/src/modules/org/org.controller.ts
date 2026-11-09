import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from "@nestjs/common";
import { can, ORG_ROLES } from "@workmesh/core";
import { z } from "zod";
import { Auth } from "../../common/decorators";
import { forbidden } from "../../common/errors";
import { requireOrg, type RequestAuth } from "../../common/request-auth";
import { V, zOptDate, zOptText } from "../../common/zod.pipe";
import { InvitationsService } from "../auth/invitations.service";
import { inviteSchema } from "../auth/auth.controller";
import { OrgService } from "./org.service";

const uuid = new ParseUUIDPipe({ version: "4" });

const departmentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: zOptText(1000),
  headId: z.uuid().nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const teamSchema = z.object({
  name: z.string().trim().min(2).max(80),
  departmentId: z.uuid().nullable().optional(),
  mission: zOptText(1000),
  responsibilities: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  contact: zOptText(200),
  docsUrl: z.url().max(500).nullable().optional(),
});

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  title: z.string().trim().min(2).max(100).optional(),
  bio: zOptText(1000),
  location: zOptText(100),
  timezone: zOptText(60),
  responsibilities: z.array(z.string().trim().min(1).max(120)).max(15).optional(),
  contact: zOptText(200),
});

@Controller()
export class OrgController {
  constructor(
    private readonly org: OrgService,
    private readonly invitations: InvitationsService,
  ) {}

  @Get("departments")
  departments() {
    return this.org.departments();
  }

  @Get("teams")
  teams() {
    return this.org.teams();
  }

  @Get("org/chart")
  chart() {
    return this.org.chart();
  }

  @Get("reporting/:memberId/subtree")
  subtree(@Param("memberId", uuid) memberId: string) {
    return this.org.subtree(memberId);
  }

  @Get("reporting/:memberId/history")
  history(@Param("memberId", uuid) memberId: string) {
    return this.org.reportingHistory(memberId);
  }

  @Post("reporting")
  setManager(
    @Auth() auth: RequestAuth,
    @Body(V(z.object({ reportId: z.uuid(), managerId: z.uuid(), type: z.enum(["PRIMARY", "DOTTED"]).default("PRIMARY"), reason: zOptText(300) })))
    body: { reportId: string; managerId: string; type: "PRIMARY" | "DOTTED"; reason?: string | null },
  ) {
    return this.org.setManager(requireOrg(auth).ctx, body);
  }

  @Delete("reporting/:lineId")
  @HttpCode(204)
  endLine(@Auth() auth: RequestAuth, @Param("lineId", uuid) id: string) {
    return this.org.endReportingLine(requireOrg(auth).ctx, id);
  }

  @Get("delegations")
  delegations(@Auth() auth: RequestAuth) {
    return this.org.delegations(requireOrg(auth).ctx);
  }

  @Post("delegations")
  delegate(
    @Auth() auth: RequestAuth,
    @Body(V(z.object({ delegatorId: z.uuid(), delegateId: z.uuid(), startsAt: zOptDate, expiresAt: z.iso.datetime({ offset: true }).transform((v) => new Date(v)), reason: zOptText(300) })))
    body: { delegatorId: string; delegateId: string; startsAt?: Date | null; expiresAt: Date; reason?: string | null },
  ) {
    return this.org.createDelegation(requireOrg(auth).ctx, body);
  }

  @Delete("delegations/:id")
  @HttpCode(204)
  revokeDelegation(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.org.revokeDelegation(requireOrg(auth).ctx, id);
  }

  @Post("departments")
  createDept(@Auth() auth: RequestAuth, @Body(V(departmentSchema)) body: z.infer<typeof departmentSchema>) {
    return this.org.upsertDepartment(requireOrg(auth).ctx, null, body);
  }

  @Patch("departments/:id")
  updateDept(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(departmentSchema)) body: z.infer<typeof departmentSchema>) {
    return this.org.upsertDepartment(requireOrg(auth).ctx, id, body);
  }

  @Delete("departments/:id")
  @HttpCode(204)
  deleteDept(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.org.deleteDepartment(requireOrg(auth).ctx, id);
  }

  @Post("teams")
  createTeam(@Auth() auth: RequestAuth, @Body(V(teamSchema)) body: z.infer<typeof teamSchema>) {
    return this.org.upsertTeam(requireOrg(auth).ctx, null, body);
  }

  @Patch("teams/:id")
  updateTeam(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(teamSchema.partial().extend({ name: z.string().trim().min(2).max(80) }))) body: z.infer<typeof teamSchema>) {
    return this.org.upsertTeam(requireOrg(auth).ctx, id, body);
  }

  @Delete("teams/:id")
  @HttpCode(204)
  deleteTeam(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.org.deleteTeam(requireOrg(auth).ctx, id);
  }

  @Put("teams/:id/members/:memberId")
  addMember(
    @Auth() auth: RequestAuth,
    @Param("id", uuid) id: string,
    @Param("memberId", uuid) memberId: string,
    @Body(V(z.object({ role: z.enum(["MEMBER", "LEAD"]).default("MEMBER"), isPrimary: z.boolean().optional() }))) body: { role: "MEMBER" | "LEAD"; isPrimary?: boolean },
  ) {
    return this.org.addTeamMember(requireOrg(auth).ctx, id, { membershipId: memberId, ...body });
  }

  @Delete("teams/:id/members/:memberId")
  @HttpCode(204)
  removeMember(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Param("memberId", uuid) memberId: string) {
    return this.org.removeTeamMember(requireOrg(auth).ctx, id, memberId);
  }

  @Patch("people/:id/profile")
  updateProfile(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(profileSchema)) body: z.infer<typeof profileSchema>) {
    return this.org.updateProfile(requireOrg(auth).ctx, id, body);
  }

  /* --------------------------------- admin --------------------------------- */

  @Get("admin/members")
  members(@Auth() auth: RequestAuth) {
    if (!can(requireOrg(auth).ctx, "org.manageMembers").allow) throw forbidden("Administrators only");
    return this.org.adminMembers();
  }

  @Patch("admin/members/:id")
  updateMember(
    @Auth() auth: RequestAuth,
    @Param("id", uuid) id: string,
    @Body(V(z.object({ role: z.enum(ORG_ROLES).optional(), status: z.enum(["ACTIVE", "DEACTIVATED"]).optional() }))) body: { role?: (typeof ORG_ROLES)[number]; status?: "ACTIVE" | "DEACTIVATED" },
  ) {
    const { ctx } = requireOrg(auth);
    return (async () => {
      if (body.role) await this.org.changeRole(ctx, id, body.role);
      if (body.status) await this.org.setStatus(ctx, id, body.status);
      return { ok: true };
    })();
  }

  @Get("admin/invitations")
  listInvites(@Auth() auth: RequestAuth) {
    if (!can(requireOrg(auth).ctx, "org.manageInvitations").allow) throw forbidden("Administrators only");
    return this.invitations.list();
  }

  @Post("admin/invitations")
  invite(@Auth() auth: RequestAuth, @Body(V(inviteSchema)) body: z.infer<typeof inviteSchema>) {
    const { ctx } = requireOrg(auth);
    if (!can(ctx, "org.manageInvitations").allow) throw forbidden("Administrators only");
    if (body.role === "OWNER" && ctx.role !== "OWNER") throw forbidden("Only owners can invite owners");
    return this.invitations.create(body, ctx.membershipId);
  }

  @Post("admin/invitations/:id/resend")
  resend(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    const { ctx } = requireOrg(auth);
    if (!can(ctx, "org.manageInvitations").allow) throw forbidden("Administrators only");
    return this.invitations.resend(id, ctx.membershipId);
  }

  @Post("admin/invitations/:id/revoke")
  @HttpCode(200)
  async revoke(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    if (!can(requireOrg(auth).ctx, "org.manageInvitations").allow) throw forbidden("Administrators only");
    await this.invitations.revoke(id);
    return { ok: true };
  }

  @Get("admin/settings")
  settings(@Auth() auth: RequestAuth) {
    if (!can(requireOrg(auth).ctx, "org.manageSettings").allow) throw forbidden("Administrators only");
    return this.org.settings();
  }

  @Patch("admin/settings")
  updateSettings(
    @Auth() auth: RequestAuth,
    @Body(V(z.object({ name: z.string().trim().min(2).max(100).optional(), staleAfterDays: z.number().int().min(1).max(60).optional(), escalateBlockersAfterHours: z.number().int().min(1).max(720).nullable().optional() })))
    body: { name?: string; staleAfterDays?: number; escalateBlockersAfterHours?: number | null },
  ) {
    return this.org.updateSettings(requireOrg(auth).ctx, body);
  }

  @Get("people")
  async directory(@Query("q") q?: string) {
    const chart = await this.org.chart();
    if (!q) return chart.people;
    const needle = q.toLowerCase();
    return chart.people.filter((p) => p.name.toLowerCase().includes(needle) || p.title.toLowerCase().includes(needle));
  }
}

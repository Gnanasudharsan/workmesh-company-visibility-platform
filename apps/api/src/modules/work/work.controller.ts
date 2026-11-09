import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from "@nestjs/common";
import { GOAL_STATUSES, MILESTONE_STATUSES, PRIORITIES, PROJECT_ROLES, PROJECT_STATUSES, RESOURCE_VISIBILITIES, WORK_ITEM_STATUSES, label, type ProjectStatus } from "@workmesh/core";
import type { Response } from "express";
import { z } from "zod";
import { Db } from "../../common/db.service";
import { Auth } from "../../common/decorators";
import { requireOrg, type RequestAuth } from "../../common/request-auth";
import { V, zOptDate, zOptText } from "../../common/zod.pipe";
import { GoalsService } from "./goals.service";
import { ItemsService } from "./items.service";
import { ProjectsService } from "./projects.service";

const uuid = new ParseUUIDPipe({ version: "4" });
const version = z.number().int().positive();

const projectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  key: z.string().trim().regex(/^[A-Za-z0-9]{2,8}$/).optional(),
  summary: zOptText(300),
  description: zOptText(5000),
  initiativeId: z.uuid().nullable().optional(),
  owningTeamId: z.uuid().nullable().optional(),
  leadId: z.uuid().nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  startDate: zOptDate,
  targetDate: zOptDate,
  visibility: z.enum(RESOURCE_VISIBILITIES).optional(),
  discoverable: z.boolean().optional(),
});

const goalSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: zOptText(3000),
  ownerId: z.uuid().nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  period: zOptText(40),
  startDate: zOptDate,
  targetDate: zOptDate,
  visibility: z.enum(["ORG", "RESTRICTED"]).optional(),
  goalId: z.uuid().nullable().optional(),
});

const milestoneSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: zOptText(2000),
  ownerId: z.uuid().nullable().optional(),
  dueDate: zOptDate,
  isCritical: z.boolean().optional(),
});

const workItemSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: zOptText(4000),
  milestoneId: z.uuid().nullable().optional(),
  assigneeId: z.uuid().nullable().optional(),
  reviewerId: z.uuid().nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  dueDate: zOptDate,
});

@Controller()
export class WorkController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly items: ItemsService,
    private readonly goals: GoalsService,
    private readonly db: Db,
  ) {}

  /* ---------------------------------- goals --------------------------------- */

  @Get("goals")
  goalTree(@Auth() auth: RequestAuth) {
    return this.goals.tree(requireOrg(auth).ctx);
  }

  @Get("goals/:id")
  goal(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.goals.getGoal(requireOrg(auth).ctx, id);
  }

  @Post("goals")
  createGoal(@Auth() auth: RequestAuth, @Body(V(goalSchema)) body: z.infer<typeof goalSchema>) {
    return this.goals.create(requireOrg(auth).ctx, "GOAL", body);
  }

  @Patch("goals/:id")
  updateGoal(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(goalSchema.partial().extend({ status: z.enum(GOAL_STATUSES).optional() }))) body: Partial<z.infer<typeof goalSchema>> & { status?: (typeof GOAL_STATUSES)[number] }) {
    return this.goals.update(requireOrg(auth).ctx, "GOAL", id, body);
  }

  @Get("initiatives/:id")
  initiative(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.goals.getInitiative(requireOrg(auth).ctx, id);
  }

  @Post("initiatives")
  createInitiative(@Auth() auth: RequestAuth, @Body(V(goalSchema)) body: z.infer<typeof goalSchema>) {
    return this.goals.create(requireOrg(auth).ctx, "INITIATIVE", body);
  }

  @Patch("initiatives/:id")
  updateInitiative(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(goalSchema.partial().extend({ status: z.enum(GOAL_STATUSES).optional() }))) body: Partial<z.infer<typeof goalSchema>> & { status?: (typeof GOAL_STATUSES)[number] }) {
    return this.goals.update(requireOrg(auth).ctx, "INITIATIVE", id, body);
  }

  /* -------------------------------- projects -------------------------------- */

  @Get("projects")
  list(@Auth() auth: RequestAuth, @Query("status") status?: string, @Query("teamId") teamId?: string, @Query("mine") mine?: string, @Query("initiativeId") initiativeId?: string) {
    const s = PROJECT_STATUSES.includes(status as ProjectStatus) ? (status as ProjectStatus) : undefined;
    return this.projects.list(requireOrg(auth).ctx, { status: s, teamId: teamId || undefined, mine: mine === "true", initiativeId: initiativeId || undefined });
  }

  /** CSV export of the viewer's visible portfolio (summary fields only). */
  @Get("projects/export.csv")
  async exportCsv(@Auth() auth: RequestAuth, @Res() res: Response) {
    const rows = await this.projects.list(requireOrg(auth).ctx);
    // Quote every cell and neutralize spreadsheet formula injection (=, +, -, @, tab, CR).
    const esc = (v: unknown) => {
      const text = String(v ?? "");
      return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
    };
    const header = ["Key", "Name", "Status", "Health", "Computed progress %", "Reported progress %", "Team", "Lead", "Target date", "Access"];
    const lines = rows.map((p) =>
      [p.key, p.name, label(p.status), label(p.health), p.computedProgress ?? "", p.reportedProgress ?? "", p.owningTeam?.name, p.lead?.name, p.targetDate?.toISOString().slice(0, 10), p.access].map(esc).join(","),
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="workmesh-projects.csv"');
    res.send([header.map(esc).join(","), ...lines].join("\n"));
  }

  @Get("projects/:id")
  get(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.projects.get(requireOrg(auth).ctx, id);
  }

  @Post("projects")
  create(@Auth() auth: RequestAuth, @Body(V(projectSchema)) body: z.infer<typeof projectSchema>) {
    return this.projects.create(requireOrg(auth).ctx, body);
  }

  @Patch("projects/:id")
  update(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(projectSchema.partial().extend({ version }))) body: Partial<z.infer<typeof projectSchema>> & { version: number }) {
    return this.projects.update(requireOrg(auth).ctx, id, body);
  }

  @Post("projects/:id/status")
  @HttpCode(200)
  status(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(z.object({ status: z.enum(PROJECT_STATUSES), version }))) body: { status: ProjectStatus; version: number }) {
    return this.projects.transition(requireOrg(auth).ctx, id, body.status, body.version);
  }

  @Post("projects/:id/progress")
  @HttpCode(200)
  progress(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(z.object({ reportedProgress: z.number().int().min(0).max(100) }))) body: { reportedProgress: number }) {
    return this.projects.reportProgress(requireOrg(auth).ctx, id, body.reportedProgress);
  }

  @Get("projects/:id/activity")
  activity(@Param("id", uuid) id: string) {
    return this.projects.activity(id);
  }

  @Put("projects/:id/members/:memberId")
  async addMember(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Param("memberId", uuid) memberId: string, @Body(V(z.object({ role: z.enum(PROJECT_ROLES).default("CONTRIBUTOR") }))) body: { role: (typeof PROJECT_ROLES)[number] }) {
    await this.projects.addMember(requireOrg(auth).ctx, id, memberId, body.role);
    return { ok: true };
  }

  @Delete("projects/:id/members/:memberId")
  @HttpCode(204)
  removeMember(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Param("memberId", uuid) memberId: string) {
    return this.projects.removeMember(requireOrg(auth).ctx, id, memberId);
  }

  @Get("projects/:id/grants")
  grants(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.projects.grants(requireOrg(auth).ctx, id);
  }

  @Post("projects/:id/grants")
  grant(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(z.object({ granteeId: z.uuid(), level: z.enum(["SUMMARY", "DETAILS"]), reason: zOptText(300), expiresAt: zOptDate }))) body: { granteeId: string; level: "SUMMARY" | "DETAILS"; reason?: string | null; expiresAt?: Date | null }) {
    return this.projects.grant(requireOrg(auth).ctx, id, body);
  }

  @Delete("projects/:id/grants/:grantId")
  @HttpCode(204)
  revokeGrant(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Param("grantId", uuid) grantId: string) {
    return this.projects.revokeGrant(requireOrg(auth).ctx, id, grantId);
  }

  /* ------------------------------- milestones ------------------------------- */

  @Post("projects/:id/milestones")
  createMilestone(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(milestoneSchema)) body: z.infer<typeof milestoneSchema>) {
    return this.items.createMilestone(requireOrg(auth).ctx, id, body);
  }

  @Get("milestones/:id")
  milestone(@Param("id", uuid) id: string) {
    return this.items.getMilestone(id);
  }

  @Patch("milestones/:id")
  updateMilestone(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(milestoneSchema.partial().extend({ status: z.enum(MILESTONE_STATUSES).optional(), version }))) body: Partial<z.infer<typeof milestoneSchema>> & { status?: (typeof MILESTONE_STATUSES)[number]; version: number }) {
    return this.items.updateMilestone(requireOrg(auth).ctx, id, body);
  }

  @Delete("milestones/:id")
  @HttpCode(204)
  deleteMilestone(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.items.deleteMilestone(requireOrg(auth).ctx, id);
  }

  /* ------------------------------- work items ------------------------------- */

  @Get("projects/:id/work-items")
  workItems(@Param("id", uuid) id: string) {
    return this.items.listWorkItems(id);
  }

  @Post("projects/:id/work-items")
  createWorkItem(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(workItemSchema)) body: z.infer<typeof workItemSchema>) {
    return this.items.createWorkItem(requireOrg(auth).ctx, id, body);
  }

  @Get("work-items/:id")
  workItem(@Param("id", uuid) id: string) {
    return this.items.getWorkItem(id);
  }

  @Patch("work-items/:id")
  updateWorkItem(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(workItemSchema.partial().extend({ status: z.enum(WORK_ITEM_STATUSES).optional(), version }))) body: Partial<z.infer<typeof workItemSchema>> & { status?: (typeof WORK_ITEM_STATUSES)[number]; version: number }) {
    return this.items.updateWorkItem(requireOrg(auth).ctx, id, body);
  }

  @Delete("work-items/:id")
  @HttpCode(204)
  deleteWorkItem(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.items.deleteWorkItem(requireOrg(auth).ctx, id);
  }

  /** Same records as /projects, plus milestones, for timeline / kanban / tracker views. */
  @Get("roadmap")
  async roadmap(@Auth() auth: RequestAuth) {
    const { ctx } = requireOrg(auth);
    const projects = await this.projects.list(ctx);
    const detailIds = projects.filter((p) => p.access === "details").map((p) => p.id);
    const milestones = await this.db.tx.milestone.findMany({
      where: { projectId: { in: detailIds } },
      select: { id: true, projectId: true, title: true, status: true, dueDate: true, isCritical: true, completedAt: true },
      orderBy: { dueDate: "asc" },
    });
    return { projects, milestones };
  }
}

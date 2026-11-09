import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from "@nestjs/common";
import { MEETING_VISIBILITIES } from "@workmesh/core";
import type { Response } from "express";
import { z } from "zod";
import { Auth } from "../../common/decorators";
import { requireOrg, type RequestAuth } from "../../common/request-auth";
import { V, zOptDate, zOptText } from "../../common/zod.pipe";
import { MeetingsService } from "./meetings.service";

const uuid = new ParseUUIDPipe({ version: "4" });
const dt = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

const meetingSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: zOptText(2000),
  teamId: z.uuid().nullable().optional(),
  scheduledAt: dt,
  durationMinutes: z.number().int().min(5).max(480).optional(),
  recurrence: z.enum(["NONE", "WEEKLY", "BIWEEKLY", "MONTHLY"]).optional(),
  visibility: z.enum(MEETING_VISIBILITIES).optional(),
  participantIds: z.array(z.uuid()).max(100).optional(),
  projectIds: z.array(z.uuid()).max(30).optional(),
  agenda: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
});

const decisionSchema = z.object({
  title: z.string().trim().min(2).max(300),
  rationale: zOptText(3000),
  projectId: z.uuid().nullable().optional(),
  ownerId: z.uuid().nullable().optional(),
  status: z.enum(["PENDING", "DECIDED"]).optional(),
});

const actionSchema = z.object({
  title: z.string().trim().min(2).max(300),
  ownerId: z.uuid(),
  dueDate: zOptDate,
  projectId: z.uuid().nullable().optional(),
  decisionId: z.uuid().nullable().optional(),
  blockerId: z.uuid().nullable().optional(),
});

@Controller()
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get("meetings")
  list(@Auth() auth: RequestAuth, @Query("when") when?: string) {
    return this.meetings.list(requireOrg(auth).ctx, { upcoming: when === "upcoming", past: when === "past" });
  }

  @Post("meetings")
  create(@Auth() auth: RequestAuth, @Body(V(meetingSchema)) body: z.infer<typeof meetingSchema>) {
    return this.meetings.create(requireOrg(auth).ctx, body);
  }

  @Get("meetings/:id")
  get(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.meetings.get(requireOrg(auth).ctx, id);
  }

  @Patch("meetings/:id")
  update(
    @Auth() auth: RequestAuth,
    @Param("id", uuid) id: string,
    @Body(V(meetingSchema.partial().extend({ notes: zOptText(20000), compareFrom: zOptDate, status: z.enum(["SCHEDULED", "IN_PROGRESS", "CANCELLED"]).optional() })))
    body: Partial<z.infer<typeof meetingSchema>> & { notes?: string | null; compareFrom?: Date | null; status?: "SCHEDULED" | "IN_PROGRESS" | "CANCELLED" },
  ) {
    return this.meetings.update(requireOrg(auth).ctx, id, body);
  }

  @Get("meetings/:id/brief")
  brief(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Query("since") since?: string) {
    const s = since && !Number.isNaN(Date.parse(since)) ? new Date(since) : undefined;
    return this.meetings.brief(requireOrg(auth).ctx, id, s);
  }

  @Post("meetings/:id/brief/share")
  @HttpCode(200)
  share(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.meetings.shareBrief(requireOrg(auth).ctx, id);
  }

  @Post("meetings/:id/complete")
  @HttpCode(200)
  complete(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.meetings.complete(requireOrg(auth).ctx, id);
  }

  @Get("meetings/:id/summary.md")
  async summary(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Res() res: Response) {
    const md = await this.meetings.summaryMarkdown(requireOrg(auth).ctx, id);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="meeting-summary.md"');
    res.send(md);
  }

  @Post("meetings/:id/agenda")
  addAgenda(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(z.object({ title: z.string().trim().min(1).max(200), notes: zOptText(2000), sourceType: zOptText(30), sourceId: z.uuid().nullable().optional() }))) body: { title: string; notes?: string | null; sourceType?: string | null; sourceId?: string | null }) {
    return this.meetings.addAgenda(requireOrg(auth).ctx, id, body);
  }

  @Patch("agenda/:id")
  updateAgenda(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(z.object({ title: z.string().trim().min(1).max(200).optional(), notes: zOptText(2000), discussed: z.boolean().optional(), sortOrder: z.number().int().min(0).optional() }))) body: { title?: string; notes?: string | null; discussed?: boolean; sortOrder?: number }) {
    return this.meetings.updateAgenda(requireOrg(auth).ctx, id, body);
  }

  @Delete("agenda/:id")
  @HttpCode(204)
  deleteAgenda(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.meetings.deleteAgenda(requireOrg(auth).ctx, id);
  }

  @Post("meetings/:id/decisions")
  addDecision(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(decisionSchema)) body: z.infer<typeof decisionSchema>) {
    return this.meetings.addDecision(requireOrg(auth).ctx, id, body);
  }

  @Post("decisions")
  addStandaloneDecision(@Auth() auth: RequestAuth, @Body(V(decisionSchema)) body: z.infer<typeof decisionSchema>) {
    return this.meetings.addDecision(requireOrg(auth).ctx, null, body);
  }

  @Get("decisions")
  decisions(@Auth() auth: RequestAuth, @Query("status") status?: string) {
    return this.meetings.decisionLog(requireOrg(auth).ctx, status === "PENDING" || status === "DECIDED" ? status : undefined);
  }

  @Patch("decisions/:id")
  updateDecision(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(decisionSchema.partial().extend({ status: z.enum(["PENDING", "DECIDED", "SUPERSEDED"]).optional() }))) body: { title?: string; rationale?: string | null; status?: "PENDING" | "DECIDED" | "SUPERSEDED"; ownerId?: string | null }) {
    return this.meetings.updateDecision(requireOrg(auth).ctx, id, body);
  }

  @Post("meetings/:id/action-items")
  addAction(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(actionSchema)) body: z.infer<typeof actionSchema>) {
    return this.meetings.addActionItem(requireOrg(auth).ctx, id, body);
  }

  @Post("action-items")
  addStandaloneAction(@Auth() auth: RequestAuth, @Body(V(actionSchema)) body: z.infer<typeof actionSchema>) {
    return this.meetings.addActionItem(requireOrg(auth).ctx, null, body);
  }

  @Get("action-items")
  actions(@Auth() auth: RequestAuth, @Query("ownerId") ownerId?: string) {
    return this.meetings.myActionItems(requireOrg(auth).ctx, ownerId && /^[0-9a-f-]{36}$/i.test(ownerId) ? ownerId : undefined);
  }

  @Patch("action-items/:id")
  updateAction(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(z.object({ title: z.string().trim().min(2).max(300).optional(), ownerId: z.uuid().optional(), dueDate: zOptDate, status: z.enum(["OPEN", "DONE", "CANCELLED"]).optional() }))) body: { title?: string; ownerId?: string; dueDate?: Date | null; status?: "OPEN" | "DONE" | "CANCELLED" }) {
    return this.meetings.updateActionItem(requireOrg(auth).ctx, id, body);
  }
}

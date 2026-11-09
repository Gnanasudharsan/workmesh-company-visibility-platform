import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { BLOCKER_STATES, SEVERITIES, UPDATE_STAGES, UPDATE_VISIBILITIES, type BlockerState } from "@workmesh/core";
import { z } from "zod";
import { Auth } from "../../common/decorators";
import { requireOrg, type RequestAuth } from "../../common/request-auth";
import { V, zOptDate, zOptText } from "../../common/zod.pipe";
import { BlockersService } from "./blockers.service";
import { UpdatesService } from "./updates.service";

const uuid = new ParseUUIDPipe({ version: "4" });
const version = z.number().int().positive();

const updateSchema = z.object({
  projectId: z.uuid().nullable().optional(),
  milestoneId: z.uuid().nullable().optional(),
  workItemId: z.uuid().nullable().optional(),
  stage: z.enum(UPDATE_STAGES).optional(),
  currentFocus: z.string().trim().min(2).max(500),
  completed: zOptText(2000),
  nextSteps: zOptText(2000),
  helpNeeded: zOptText(1000),
  helpFromId: z.uuid().nullable().optional(),
  confidence: z.number().int().min(1).max(5).nullable().optional(),
  visibility: z.enum(UPDATE_VISIBILITIES).optional(),
});

const blockerSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: zOptText(3000),
  projectId: z.uuid().nullable().optional(),
  milestoneId: z.uuid().nullable().optional(),
  workItemId: z.uuid().nullable().optional(),
  severity: z.enum(SEVERITIES).optional(),
  visibility: z.enum(UPDATE_VISIBILITIES).optional(),
  targetDate: zOptDate,
  ownerId: z.uuid().nullable().optional(),
});

const createUpdateSchema = updateSchema.extend({
  publish: z.boolean().default(false),
  /** "Mark blocker": create a linked blocker in the same transaction. */
  blocker: blockerSchema.omit({ projectId: true, milestoneId: true, workItemId: true }).optional(),
});

const commentSchema = z.object({ body: z.string().trim().min(1).max(4000) });

@Controller()
export class UpdatesController {
  constructor(
    private readonly updates: UpdatesService,
    private readonly blockers: BlockersService,
  ) {}

  @Get("updates")
  list(
    @Auth() auth: RequestAuth,
    @Query("authorId") authorId?: string,
    @Query("projectId") projectId?: string,
    @Query("drafts") drafts?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    const { ctx } = requireOrg(auth);
    return this.updates.list(ctx, {
      authorId: authorId === "me" ? ctx.membershipId : authorId || undefined,
      projectId: projectId || undefined,
      drafts: drafts === "true",
      cursor: cursor && !Number.isNaN(Date.parse(cursor)) ? cursor : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("updates/:id")
  get(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.updates.get(requireOrg(auth).ctx, id);
  }

  @Post("updates")
  async create(@Auth() auth: RequestAuth, @Body(V(createUpdateSchema)) body: z.infer<typeof createUpdateSchema>) {
    const { ctx } = requireOrg(auth);
    const { publish, blocker, ...input } = body;
    const update = await this.updates.create(ctx, input, publish);
    let createdBlocker = null;
    if (blocker) {
      createdBlocker = await this.blockers.create(ctx, {
        ...blocker,
        projectId: input.projectId ?? null,
        milestoneId: input.milestoneId ?? null,
        workItemId: input.workItemId ?? null,
        updateId: update.id,
        visibility: blocker.visibility ?? (input.visibility === "PRIVATE" ? "MANAGER" : input.visibility),
      });
    }
    return { update, blocker: createdBlocker };
  }

  @Patch("updates/:id")
  update(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(updateSchema.partial().extend({ version }))) body: Partial<z.infer<typeof updateSchema>> & { version: number }) {
    return this.updates.update(requireOrg(auth).ctx, id, body);
  }

  @Post("updates/:id/publish")
  @HttpCode(200)
  publish(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.updates.publish(requireOrg(auth).ctx, id);
  }

  @Delete("updates/:id")
  @HttpCode(204)
  deleteDraft(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.updates.deleteDraft(requireOrg(auth).ctx, id);
  }

  @Post("updates/:id/acknowledge")
  @HttpCode(200)
  ack(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.updates.acknowledge(requireOrg(auth).ctx, id);
  }

  @Post("updates/:id/comments")
  comment(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(commentSchema)) body: { body: string }) {
    return this.updates.commentOnUpdate(requireOrg(auth).ctx, id, body.body);
  }

  @Post("people/:id/request-update")
  @HttpCode(200)
  requestUpdate(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(z.object({ note: zOptText(300), projectId: z.uuid().nullable().optional() }))) body: { note?: string | null; projectId?: string | null }) {
    return this.updates.requestUpdate(requireOrg(auth).ctx, id, body.note ?? null, body.projectId ?? null);
  }

  /* --------------------------------- blockers -------------------------------- */

  @Get("blockers")
  blockerList(@Auth() auth: RequestAuth, @Query("scope") scope?: string, @Query("projectId") projectId?: string, @Query("state") state?: string, @Query("open") open?: string) {
    const s = scope === "mine" || scope === "queue" ? scope : "all";
    const st = BLOCKER_STATES.includes(state as BlockerState) ? (state as BlockerState) : undefined;
    return this.blockers.list(requireOrg(auth).ctx, { scope: s, projectId: projectId || undefined, state: st, open: open === "true" });
  }

  @Get("blockers/:id")
  blocker(@Auth() auth: RequestAuth, @Param("id", uuid) id: string) {
    return this.blockers.get(requireOrg(auth).ctx, id);
  }

  @Post("blockers")
  createBlocker(@Auth() auth: RequestAuth, @Body(V(blockerSchema)) body: z.infer<typeof blockerSchema>) {
    return this.blockers.create(requireOrg(auth).ctx, body);
  }

  @Post("blockers/:id/assign")
  @HttpCode(200)
  assign(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(z.object({ ownerId: z.uuid().nullable(), version, note: zOptText(500) }))) body: { ownerId: string | null; version: number; note?: string | null }) {
    return this.blockers.assign(requireOrg(auth).ctx, id, body.ownerId, body.version, body.note);
  }

  @Post("blockers/:id/transition")
  @HttpCode(200)
  transition(
    @Auth() auth: RequestAuth,
    @Param("id", uuid) id: string,
    @Body(V(z.object({ state: z.enum(BLOCKER_STATES), version, note: zOptText(500), resolutionNotes: zOptText(2000) }))) body: { state: BlockerState; version: number; note?: string | null; resolutionNotes?: string | null },
  ) {
    return this.blockers.transition(requireOrg(auth).ctx, id, body.state, body.version, body.note, body.resolutionNotes);
  }

  @Post("blockers/:id/comments")
  blockerComment(@Auth() auth: RequestAuth, @Param("id", uuid) id: string, @Body(V(commentSchema)) body: { body: string }) {
    return this.blockers.comment(requireOrg(auth).ctx, id, body.body);
  }
}

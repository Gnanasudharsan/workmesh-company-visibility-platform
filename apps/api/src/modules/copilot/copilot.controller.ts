import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Auth, NoRequestTransaction } from "../../common/decorators";
import { notFound } from "../../common/errors";
import { requireOrg, type RequestAuth } from "../../common/request-auth";
import { config } from "../../config";
import { isDemo } from "../auth/auth.controller";
import { CitationLedger, CopilotToolRunner, type CopilotAuth } from "./tool-runner";
import { TOOLS } from "./tools";

/** Per-client limit for copilot endpoints, read at startup like the auth limits. */
export const copilotLimit = () => ({ default: { limit: Number(process.env.COPILOT_RATE_LIMIT_PER_MINUTE ?? 10), ttl: 60_000 } });

const toolName = z.string().regex(/^[a-z_]{1,40}$/);

export const copilotEnabled = () => config().COPILOT_ENABLED;

export function copilotAuth(auth: RequestAuth, req: Request): CopilotAuth {
  const a = requireOrg(auth);
  const requestId = (req.headers["x-request-id"] as string | undefined) ?? (req.id ? String(req.id) : randomUUID());
  return { orgId: a.orgId, membershipId: a.membershipId, ctx: a.ctx, scope: a.scope, requestId };
}

@Controller("copilot")
export class CopilotController {
  constructor(private readonly runner: CopilotToolRunner) {}

  /* ------------------- local development only (DEMO_MODE + COPILOT_ENABLED) ------------------- */

  /** Lists the tools and their JSON input schemas, for the copilot:try CLI. */
  @Get("dev/tools")
  tools() {
    if (!isDemo() || !copilotEnabled()) throw notFound();
    return TOOLS.map((t) => ({ name: t.name, description: t.description, input: z.toJSONSchema(t.input, { io: "input" }) }));
  }

  /**
   * Runs one tool as the signed-in user — the same runner the agent loop uses — and returns its
   * raw result plus the records it contributed to the citation ledger.
   */
  @Post("dev/tools/:name")
  @HttpCode(200)
  @NoRequestTransaction()
  @Throttle(copilotLimit())
  async runTool(@Auth() auth: RequestAuth, @Req() req: Request, @Param("name") name: string, @Body() body: unknown) {
    if (!isDemo() || !copilotEnabled()) throw notFound();
    if (!toolName.safeParse(name).success) throw notFound("Tool");
    const ledger = new CitationLedger();
    const run = await this.runner.run(copilotAuth(auth, req), name, body, ledger);
    if (!run.ok) {
      if (run.error === "UNKNOWN_TOOL") throw notFound("Tool");
      throw new BadRequestException({ code: "VALIDATION_FAILED", message: "Some fields are invalid", issues: run.issues });
    }
    return { tool: run.tool, result: run.result, records: ledger.all(), latencyMs: run.latencyMs };
  }
}

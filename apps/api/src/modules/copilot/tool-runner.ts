import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { AuthContext } from "@workmesh/core";
import { Db } from "../../common/db.service";
import type { ViewerScope } from "../policy/authz.types";
import { CopilotReadFacade } from "./facade";
import { findTool, NOT_FOUND, RECORD_TYPES, type RecordRef, type RecordType } from "./tools";

/** The request's authorization inputs, exactly as the AuthGuard built them. */
export interface CopilotAuth {
  orgId: string;
  membershipId: string;
  ctx: AuthContext;
  scope: ViewerScope;
  requestId: string;
}

/**
 * Records every (type, id, title) a tool returned during one request. Phase 2 validates answer
 * citations against it: a model may only cite what the viewer's own tools gave it.
 */
export class CitationLedger {
  private readonly records = new Map<string, RecordRef>();

  add(r: RecordRef) {
    const key = `${r.type}:${r.id}`;
    if (!this.records.has(key)) this.records.set(key, r);
  }

  get(type: string, id: string): RecordRef | undefined {
    return this.records.get(`${type}:${id}`);
  }

  all(): RecordRef[] {
    return [...this.records.values()];
  }
}

export type ToolRun =
  | { ok: true; tool: string; result: object; records: number; latencyMs: number }
  | { ok: false; tool: string; error: "UNKNOWN_TOOL" | "INVALID_INPUT"; issues?: Array<{ path: string; message: string }> };

const TYPES = new Set<string>(RECORD_TYPES);

/** Walks a tool result and registers every titled record in the ledger. */
export function collectRecords(value: unknown, ledger: CitationLedger, depth = 0): number {
  if (depth > 8 || value === null || typeof value !== "object") return 0;
  if (Array.isArray(value)) return value.reduce<number>((n, v) => n + collectRecords(v, ledger, depth + 1), 0);
  const o = value as Record<string, unknown>;
  let n = 0;
  if (typeof o.type === "string" && TYPES.has(o.type) && typeof o.id === "string" && typeof o.title === "string") {
    ledger.add({ type: o.type as RecordType, id: o.id, title: o.title });
    n++;
  }
  for (const v of Object.values(o)) n += collectRecords(v, ledger, depth + 1);
  return n;
}

@Injectable()
export class CopilotToolRunner {
  private readonly logger = new Logger("Copilot");

  constructor(
    private readonly db: Db,
    private readonly facade: CopilotReadFacade,
  ) {}

  /**
   * Runs `fn` in its own tenant transaction with the request's AuthContext and ViewerScope, and
   * switches that transaction to READ ONLY first, so Postgres rejects any write a read path might
   * attempt. This is the same `runAsTenant` every request uses; only its lifetime is shorter.
   */
  readOnly<T>(auth: CopilotAuth, fn: () => Promise<T>): Promise<T> {
    return this.db.runAsTenant(
      auth.orgId,
      async () => {
        await this.db.tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return fn();
      },
      { requestId: auth.requestId, auth: auth.ctx, scope: auth.scope },
    );
  }

  async run(auth: CopilotAuth, name: string, rawInput: unknown, ledger: CitationLedger): Promise<ToolRun> {
    const tool = findTool(name);
    if (!tool) return { ok: false, tool: name, error: "UNKNOWN_TOOL" };
    const parsed = tool.input.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return { ok: false, tool: name, error: "INVALID_INPUT", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
    }
    const started = Date.now();
    const api = this.facade.forRequest(auth.ctx);
    let result: object;
    try {
      result = await this.readOnly(auth, () => tool.run(api, parsed.data));
    } catch (err) {
      // A record the viewer may not see is a 404 in the service layer — identical to a missing one.
      if (!(err instanceof NotFoundException)) throw err;
      result = NOT_FOUND;
    }
    const records = collectRecords(result, ledger);
    const latencyMs = Date.now() - started;
    // Metadata only: never the input (it may contain question text) or the result.
    this.logger.log({ event: "copilot.tool", memberId: auth.membershipId, tool: name, found: (result as { found?: boolean }).found !== false, records, latencyMs });
    return { ok: true, tool: name, result, records, latencyMs };
  }
}

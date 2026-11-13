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

/** A citable record plus the project and person it belongs to, as the tool result showed them. */
export interface LedgerRecord extends RecordRef {
  projectId?: string;
  personId?: string;
  /** Short per-request handle ("R3") the model cites instead of copying a UUID. */
  ref?: string;
}

/**
 * Records every (type, id, title) a tool returned during one request. Answer citations are
 * validated against it: a model may only cite what the viewer's own tools gave it.
 */
export class CitationLedger {
  private readonly records = new Map<string, LedgerRecord>();
  private readonly ids = new Map<string, LedgerRecord>();
  private readonly refs = new Map<string, LedgerRecord>();

  /** Registers a record and returns its handle. The same record keeps the same handle. */
  add(r: LedgerRecord): string {
    const key = `${r.type}:${r.id}`;
    const existing = this.records.get(key);
    if (existing) {
      existing.projectId ??= r.projectId;
      existing.personId ??= r.personId;
      return existing.ref!;
    }
    const rec = { ...r, ref: `R${this.records.size + 1}` };
    this.records.set(key, rec);
    this.refs.set(rec.ref, rec);
    if (!this.ids.has(r.id)) this.ids.set(r.id, rec);
    return rec.ref;
  }

  /** Lookup by handle ("R3"); only handles issued in this request exist. */
  byRef(ref: string): LedgerRecord | undefined {
    return this.refs.get(ref.toUpperCase());
  }

  get(type: string, id: string): LedgerRecord | undefined {
    return this.records.get(`${type}:${id}`);
  }

  /** Lookup by id alone, so a model that mislabels a record's type still cites the real record. */
  byId(id: string): LedgerRecord | undefined {
    return this.ids.get(id);
  }

  all(): LedgerRecord[] {
    return [...this.records.values()];
  }
}

export type ToolRun =
  | { ok: true; tool: string; result: object; records: number; latencyMs: number }
  | { ok: false; tool: string; error: "UNKNOWN_TOOL" | "INVALID_INPUT"; issues?: Array<{ path: string; message: string }> };

const TYPES = new Set<string>(RECORD_TYPES);

/**
 * The model's view of a tool result: the same data, with each titled record's handle (`ref`)
 * first, so the model can cite `[[R3]]` instead of copying a UUID. The result itself (returned to
 * the dev endpoint and used for parity tests) is never changed.
 */
export function modelView(value: unknown, ledger: CitationLedger, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => modelView(v, ledger, depth + 1));
  const o = value as Record<string, unknown>;
  const rec = typeof o.type === "string" && typeof o.id === "string" ? ledger.get(o.type, o.id) : undefined;
  const out: Record<string, unknown> = rec?.ref ? { ref: rec.ref } : {};
  for (const [k, v] of Object.entries(o)) out[k] = modelView(v, ledger, depth + 1);
  return out;
}

/** Replaces handles the model passes as tool inputs ("R3") with the record's id. Unknown handles stay as text. */
export function resolveRefs(input: unknown, ledger: CitationLedger): unknown {
  if (typeof input === "string") return /^R\d{1,4}$/i.test(input.trim()) ? (ledger.byRef(input.trim())?.id ?? input) : input;
  if (Array.isArray(input)) return input.map((v) => resolveRefs(v, ledger));
  if (input && typeof input === "object") return Object.fromEntries(Object.entries(input as Record<string, unknown>).map(([k, v]) => [k, resolveRefs(v, ledger)]));
  return input;
}

const refId = (v: unknown, type: string): string | undefined => {
  const o = v as { type?: unknown; id?: unknown } | null;
  return o && o.type === type && typeof o.id === "string" ? o.id : undefined;
};

/**
 * Walks a tool result and registers every titled record in the ledger, with the project it sits
 * under (its own `project`/`projectId`, an enclosing project, or the result's top-level project)
 * and the person it's about (author, owner, reporter).
 */
export function collectRecords(value: unknown, ledger: CitationLedger, depth = 0, projectCtx?: string): number {
  if (depth > 8 || value === null || typeof value !== "object") return 0;
  if (Array.isArray(value)) return value.reduce<number>((n, v) => n + collectRecords(v, ledger, depth + 1, projectCtx), 0);
  const o = value as Record<string, unknown>;
  if (depth === 0) projectCtx = refId(o.project, "project") ?? projectCtx;
  let n = 0;
  let childCtx = projectCtx;
  if (typeof o.type === "string" && TYPES.has(o.type) && typeof o.id === "string" && typeof o.title === "string") {
    const type = o.type as RecordType;
    if (type === "project") childCtx = o.id;
    const own = refId(o.project, "project") ?? (typeof o.projectId === "string" ? o.projectId : undefined) ?? refId(o.downstream, "project");
    const projectId = type === "project" ? undefined : (own ?? (["milestone", "update", "blocker", "work_item", "dependency", "change"].includes(type) ? projectCtx : undefined));
    const personId = type === "person" ? undefined : (refId(o.author, "person") ?? refId(o.owner, "person") ?? refId(o.reporter, "person"));
    ledger.add({ type, id: o.id, title: o.title, ...(projectId ? { projectId } : {}), ...(personId ? { personId } : {}) });
    n++;
  }
  for (const v of Object.values(o)) n += collectRecords(v, ledger, depth + 1, childCtx);
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
    const parsed = tool.input.safeParse(resolveRefs(rawInput ?? {}, ledger));
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

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { config } from "../config";
import { als, currentStore, type ExecutionStore } from "./context";

/**
 * Two Prisma clients:
 *
 *  - `system` connects as the schema owner. Used ONLY for global tables (users, sessions,
 *    reset tokens, mailbox), registration, invitation acceptance by token, the outbox poller
 *    and seeding. It bypasses RLS, so every tenant query it runs must filter explicitly.
 *  - `app` connects as `workmesh_app` (NOBYPASSRLS). Tenant work always runs through
 *    `runAsTenant`, which opens a transaction and sets `app.org_id` *transaction-locally*
 *    (`set_config(..., true)`). Because the setting dies with the transaction, a pooled
 *    connection can never carry one tenant's context into another request.
 */
@Injectable()
export class Db implements OnModuleDestroy {
  private readonly logger = new Logger(Db.name);
  readonly system: PrismaClient;
  readonly app: PrismaClient;

  constructor() {
    const cfg = config();
    this.system = new PrismaClient({ datasourceUrl: cfg.DATABASE_URL });
    this.app = new PrismaClient({ datasourceUrl: cfg.APP_DATABASE_URL });
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.system.$disconnect(), this.app.$disconnect()]);
  }

  /** The tenant transaction of the current request/job. Throws if called outside one. */
  get tx(): Prisma.TransactionClient {
    const tx = currentStore()?.tx;
    if (!tx) throw new Error("No tenant transaction in the current execution context");
    return tx;
  }

  get orgId(): string {
    const id = currentStore()?.orgId;
    if (!id) throw new Error("No tenant in the current execution context");
    return id;
  }

  /** Registers work to run only after the surrounding tenant transaction commits. */
  afterCommit(fn: () => Promise<void> | void) {
    const store = currentStore();
    if (!store) throw new Error("afterCommit outside an execution context");
    store.afterCommit.push(fn);
  }

  /** Per-request memo (e.g. the people directory) to avoid N+1 lookups. */
  async memo<T>(key: string, load: () => Promise<T>): Promise<T> {
    const store = currentStore();
    if (!store) return load();
    if (store.cache.has(key)) return store.cache.get(key) as T;
    const value = await load();
    store.cache.set(key, value);
    return value;
  }

  /**
   * Runs `fn` inside an RLS-scoped transaction for `orgId`. Nested calls for the same org
   * reuse the outer transaction. After-commit hooks run once the outermost transaction commits.
   */
  async runAsTenant<T>(orgId: string, fn: () => Promise<T>, base?: Partial<ExecutionStore>): Promise<T> {
    const outer = currentStore();
    if (outer?.tx && outer.orgId === orgId) return fn();
    const store: ExecutionStore = {
      requestId: base?.requestId ?? outer?.requestId ?? randomUUID(),
      orgId,
      auth: base?.auth,
      scope: base?.scope,
      afterCommit: [],
      cache: new Map(),
    };
    const result = await als.run(store, () =>
      this.app.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
          store.tx = tx;
          return fn();
        },
        { timeout: 20_000, maxWait: 10_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      ),
    );
    store.tx = undefined;
    for (const hook of store.afterCommit) {
      try {
        await als.run(store, () => hook());
      } catch (err) {
        this.logger.warn(`after-commit hook failed: ${(err as Error).message}`);
      }
    }
    return result;
  }
}

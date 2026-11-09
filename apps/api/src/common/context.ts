import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import type { AuthContext } from "@workmesh/core";
import type { ViewerScope } from "../modules/policy/authz.types";

/**
 * Per-request (or per-job) execution context, carried with AsyncLocalStorage.
 * `tx` is a Prisma interactive transaction in which `app.org_id` has been set,
 * so every query it runs is constrained by Row-Level Security.
 */
export interface ExecutionStore {
  requestId: string;
  orgId?: string;
  tx?: Prisma.TransactionClient;
  auth?: AuthContext;
  scope?: ViewerScope;
  afterCommit: Array<() => Promise<void> | void>;
  cache: Map<string, unknown>;
}

export const als = new AsyncLocalStorage<ExecutionStore>();

export function currentStore(): ExecutionStore | undefined {
  return als.getStore();
}

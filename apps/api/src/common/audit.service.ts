import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { currentStore } from "./context";
import { Db } from "./db.service";

/** Keys that must never be written to audit metadata. */
const FORBIDDEN_KEYS = /password|token|secret|hash|csrf/i;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.test(k)) continue;
      out[k] = sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  return value;
}

/**
 * Append-only audit trail, written in the same transaction as the change it describes.
 * Metadata holds identifiers and before/after values of structural fields — not the
 * free-text content of updates or comments.
 */
@Injectable()
export class AuditService {
  constructor(private readonly db: Db) {}

  async record(
    action: string,
    resourceType: string,
    resourceId: string | null,
    metadata?: Record<string, unknown>,
    actorOverride?: string | null,
  ) {
    const store = currentStore();
    await this.db.tx.auditEvent.create({
      data: {
        organizationId: this.db.orgId,
        actorId: actorOverride === undefined ? (store?.auth?.membershipId ?? null) : actorOverride,
        action,
        resourceType,
        resourceId,
        metadata: metadata ? (sanitize(metadata) as Prisma.InputJsonValue) : Prisma.JsonNull,
        requestId: store?.requestId?.slice(0, 64) ?? null,
      },
    });
  }
}

export { sanitize as sanitizeAuditMetadata };

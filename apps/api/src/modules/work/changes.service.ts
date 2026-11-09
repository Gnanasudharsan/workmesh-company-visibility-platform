import { Injectable } from "@nestjs/common";
import { currentStore } from "../../common/context";
import { Db } from "../../common/db.service";

type Entity = "PROJECT" | "MILESTONE" | "WORK_ITEM";

/** Records field-level changes (append-only) used by briefs, activity feeds and history views. */
@Injectable()
export class ChangesService {
  constructor(private readonly db: Db) {}

  async record(entityType: Entity, entityId: string, projectId: string, before: Record<string, unknown>, after: Record<string, unknown>, fields: string[]) {
    const actorId = currentStore()?.auth?.membershipId ?? null;
    const rows = fields
      .filter((f) => after[f] !== undefined && norm(before[f]) !== norm(after[f]))
      .map((field) => ({
        organizationId: this.db.orgId,
        entityType,
        entityId,
        projectId,
        field,
        fromValue: norm(before[field]),
        toValue: norm(after[field]),
        actorId,
      }));
    if (rows.length) await this.db.tx.changeEvent.createMany({ data: rows });
    return rows.length;
  }
}

function norm(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

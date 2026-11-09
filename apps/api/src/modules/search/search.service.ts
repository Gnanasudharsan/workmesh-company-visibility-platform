import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AuthContext } from "@workmesh/core";
import { currentStore } from "../../common/context";
import { Db } from "../../common/db.service";
import { PeopleService } from "../org/people.service";
import { detailIds, visibleIds } from "../policy/authz.types";
import { BlockersService } from "../updates/blockers.service";
import { UpdatesService } from "../updates/updates.service";

export type SearchType = "people" | "teams" | "departments" | "projects" | "goals" | "initiatives" | "milestones" | "updates" | "blockers" | "decisions";
export const SEARCH_TYPES: SearchType[] = ["people", "teams", "departments", "projects", "goals", "initiatives", "milestones", "updates", "blockers", "decisions"];

/** Turns user input into a safe prefix tsquery: "pay gate" → "pay:* & gate:*". */
export function toPrefixQuery(q: string): string | null {
  const tokens = q
    .toLowerCase()
    .normalize("NFKD")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
    .slice(0, 6);
  return tokens.length ? tokens.map((t) => `${t}:*`).join(" & ") : null;
}

/**
 * Global search with PostgreSQL full-text search (expression GIN indexes from the security
 * migration). Every query runs in the RLS-scoped transaction *and* is restricted to the IDs
 * the viewer may see, so confidential rows are never returned to the application layer for
 * later filtering — they are excluded in SQL.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly db: Db,
    private readonly people: PeopleService,
    private readonly updates: UpdatesService,
    private readonly blockers: BlockersService,
  ) {}

  async search(ctx: AuthContext, q: string, types: SearchType[] = SEARCH_TYPES, limit = 6) {
    const tsq = toPrefixQuery(q);
    const empty = Object.fromEntries(types.map((t) => [t, [] as unknown[]])) as Record<string, unknown[]>;
    if (!tsq) return { query: q, results: empty, total: 0 };
    const scope = currentStore()!.scope!;
    const tx = this.db.tx;
    const visible = visibleIds(scope);
    const details = detailIds(scope);
    const goalIds = [...scope.goals.keys()];
    const initIds = [...scope.initiatives.keys()];
    const ids = async (sql: Prisma.Sql) => (await tx.$queryRaw<Array<{ id: string }>>(sql)).map((r) => r.id);
    const tsv = (expr: Prisma.Sql) => Prisma.sql`to_tsvector('simple'::regconfig, ${expr}) @@ to_tsquery('simple', ${tsq})`;
    const uuids = (arr: string[]) => (arr.length ? arr : ["00000000-0000-0000-0000-000000000000"]);
    const results: Record<string, unknown[]> = { ...empty };
    const want = new Set(types);
    const jobs: Array<Promise<void>> = [];

    if (want.has("people"))
      jobs.push(
        (async () => {
          const found = await ids(Prisma.sql`SELECT "membershipId" AS id FROM employee_profiles p JOIN memberships m ON m.id = p."membershipId" WHERE m.status = 'ACTIVE' AND ${tsv(Prisma.sql`coalesce("displayName",'') || ' ' || coalesce("title",'') || ' ' || wm_join("responsibilities")`)} LIMIT ${limit}`);
          results.people = await this.people.many(found);
        })(),
      );
    if (want.has("teams"))
      jobs.push(
        (async () => {
          const found = await ids(Prisma.sql`SELECT id FROM teams WHERE ${tsv(Prisma.sql`coalesce("name",'') || ' ' || coalesce("mission",'') || ' ' || wm_join("responsibilities")`)} LIMIT ${limit}`);
          results.teams = await tx.team.findMany({ where: { id: { in: found } }, select: { id: true, name: true, mission: true } });
        })(),
      );
    if (want.has("departments"))
      jobs.push(
        (async () => {
          const found = await ids(Prisma.sql`SELECT id FROM departments WHERE ${tsv(Prisma.sql`coalesce("name",'') || ' ' || coalesce("description",'')`)} LIMIT ${limit}`);
          results.departments = await tx.department.findMany({ where: { id: { in: found } }, select: { id: true, name: true, description: true } });
        })(),
      );
    if (want.has("projects"))
      jobs.push(
        (async () => {
          const found = await ids(Prisma.sql`SELECT id FROM projects WHERE id = ANY(${uuids(visible)}::uuid[]) AND ${tsv(Prisma.sql`coalesce("name",'') || ' ' || coalesce("key",'') || ' ' || coalesce("summary",'')`)} LIMIT ${limit}`);
          const rows = await tx.project.findMany({ where: { id: { in: found } }, select: { id: true, name: true, key: true, status: true, summary: true } });
          results.projects = rows.map((p) => ({ ...p, access: scope.projectAccess.get(p.id), summary: p.summary }));
        })(),
      );
    if (want.has("goals"))
      jobs.push(
        (async () => {
          const found = await ids(Prisma.sql`SELECT id FROM company_goals WHERE id = ANY(${uuids(goalIds)}::uuid[]) AND ${tsv(Prisma.sql`coalesce("title",'') || ' ' || coalesce("description",'')`)} LIMIT ${limit}`);
          results.goals = await tx.companyGoal.findMany({ where: { id: { in: found } }, select: { id: true, title: true, status: true } });
        })(),
      );
    if (want.has("initiatives"))
      jobs.push(
        (async () => {
          const found = await ids(Prisma.sql`SELECT id FROM initiatives WHERE id = ANY(${uuids(initIds)}::uuid[]) AND ${tsv(Prisma.sql`coalesce("title",'') || ' ' || coalesce("description",'')`)} LIMIT ${limit}`);
          results.initiatives = await tx.initiative.findMany({ where: { id: { in: found } }, select: { id: true, title: true, status: true } });
        })(),
      );
    if (want.has("milestones"))
      jobs.push(
        (async () => {
          const found = await ids(Prisma.sql`SELECT id FROM milestones WHERE "projectId" = ANY(${uuids(details)}::uuid[]) AND ${tsv(Prisma.sql`coalesce("title",'')`)} LIMIT ${limit}`);
          results.milestones = await tx.milestone.findMany({ where: { id: { in: found } }, select: { id: true, title: true, status: true, projectId: true, dueDate: true } });
        })(),
      );
    if (want.has("updates"))
      jobs.push(
        (async () => {
          const found = await ids(Prisma.sql`SELECT id FROM progress_updates WHERE ${tsv(Prisma.sql`coalesce("currentFocus",'') || ' ' || coalesce("completed",'') || ' ' || coalesce("nextSteps",'')`)} ORDER BY "publishedAt" DESC NULLS LAST LIMIT 200`);
          const rows = await tx.progressUpdate.findMany({ where: { AND: [{ id: { in: found } }, this.updates.visibilityWhere(ctx), { status: "PUBLISHED" }] }, take: limit, orderBy: { publishedAt: "desc" } });
          const people = await this.people.all();
          results.updates = rows
            .filter((u) => this.updates.canView(ctx, u))
            .map((u) => ({ id: u.id, currentFocus: u.currentFocus, stage: u.stage, publishedAt: u.publishedAt, author: this.people.liteOf(people.get(u.authorId)) }));
        })(),
      );
    if (want.has("blockers"))
      jobs.push(
        (async () => {
          const found = await ids(Prisma.sql`SELECT id FROM blockers WHERE ${tsv(Prisma.sql`coalesce("title",'') || ' ' || coalesce("description",'')`)} LIMIT 200`);
          const rows = await tx.blocker.findMany({ where: { AND: [{ id: { in: found } }, this.blockers.visibilityWhere(ctx)] }, take: limit });
          results.blockers = rows.filter((b) => this.blockers.canView(ctx, b)).map((b) => ({ id: b.id, title: b.title, state: b.state, severity: b.severity }));
        })(),
      );
    if (want.has("decisions"))
      jobs.push(
        (async () => {
          const found = await ids(Prisma.sql`SELECT id FROM decisions WHERE ("projectId" = ANY(${uuids(details)}::uuid[]) OR ("projectId" IS NULL AND "createdById" = ${ctx.membershipId}::uuid)) AND ${tsv(Prisma.sql`coalesce("title",'') || ' ' || coalesce("rationale",'')`)} LIMIT ${limit}`);
          results.decisions = await tx.decision.findMany({ where: { id: { in: found } }, select: { id: true, title: true, status: true, meetingId: true, projectId: true } });
        })(),
      );
    await Promise.all(jobs);
    const total = Object.values(results).reduce((a, r) => a + r.length, 0);
    return { query: q, results, total };
  }
}

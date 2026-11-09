import { Injectable } from "@nestjs/common";
import {
  assertTransition,
  canCreateGoal,
  canEditGoal,
  type AuthContext,
  type GoalStatus,
  type Priority,
  type ResourceVisibility,
} from "@workmesh/core";
import { AuditService } from "../../common/audit.service";
import { currentStore } from "../../common/context";
import { Db } from "../../common/db.service";
import { forbidden, invalid, notFound } from "../../common/errors";
import { PeopleService } from "../org/people.service";
import { AuthzService } from "../policy/authz.service";
import { ProjectsService } from "./projects.service";

export interface GoalInput {
  title: string;
  description?: string | null;
  ownerId?: string | null;
  priority?: Priority;
  period?: string | null;
  startDate?: Date | null;
  targetDate?: Date | null;
  visibility?: "ORG" | "RESTRICTED";
  goalId?: string | null;
}

/**
 * Goal → initiative → project hierarchy. Aggregate progress for a goal is the mean computed
 * progress of the projects *this viewer* can see — documented as such, and the count of
 * contributing projects is returned alongside, so the number is never mistaken for an
 * organization-wide figure that includes hidden work.
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly db: Db,
    private readonly people: PeopleService,
    private readonly projects: ProjectsService,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
  ) {}

  private scope() {
    return currentStore()!.scope!;
  }

  async tree(ctx: AuthContext) {
    const scope = this.scope();
    const [goals, initiatives, projects, people] = await Promise.all([
      this.db.tx.companyGoal.findMany({ where: { id: { in: [...scope.goals.keys()] } }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }] }),
      this.db.tx.initiative.findMany({ where: { id: { in: [...scope.initiatives.keys()] } }, orderBy: { createdAt: "asc" } }),
      this.projects.list(ctx),
      this.people.all(),
    ]);
    const aggregate = (ps: typeof projects) => {
      const withProgress = ps.filter((p) => p.computedProgress !== null);
      return {
        projectCount: ps.length,
        progress: withProgress.length ? Math.round(withProgress.reduce((a, p) => a + (p.computedProgress ?? 0), 0) / withProgress.length) : null,
        atRisk: ps.filter((p) => ["AT_RISK", "OFF_TRACK", "BLOCKED"].includes(p.health)).length,
        blocked: ps.filter((p) => p.health === "BLOCKED").length,
      };
    };
    const presentInitiative = (i: (typeof initiatives)[number]) => {
      const ps = projects.filter((p) => p.initiative?.id === i.id);
      return {
        ...i,
        owner: this.people.liteOf(people.get(i.ownerId ?? "")),
        canEdit: canEditGoal(ctx, scope.initiatives.get(i.id)!).allow,
        projects: ps,
        ...aggregate(ps),
      };
    };
    return {
      goals: goals.map((g) => {
        const inits = initiatives.filter((i) => i.goalId === g.id).map(presentInitiative);
        const ps = inits.flatMap((i) => i.projects);
        return { ...g, owner: this.people.liteOf(people.get(g.ownerId ?? "")), canEdit: canEditGoal(ctx, scope.goals.get(g.id)!).allow, initiatives: inits, ...aggregate(ps) };
      }),
      unalignedInitiatives: initiatives.filter((i) => !i.goalId || !scope.goals.has(i.goalId)).map(presentInitiative),
      unalignedProjects: projects.filter((p) => !p.initiative),
      canCreateGoal: canCreateGoal(ctx, "GOAL").allow,
      canCreateInitiative: canCreateGoal(ctx, "INITIATIVE").allow,
    };
  }

  async getGoal(ctx: AuthContext, id: string) {
    const tree = await this.tree(ctx);
    const goal = tree.goals.find((g) => g.id === id);
    if (!goal) throw notFound("Goal");
    return goal;
  }

  async getInitiative(ctx: AuthContext, id: string) {
    const tree = await this.tree(ctx);
    const init = [...tree.goals.flatMap((g) => g.initiatives), ...tree.unalignedInitiatives].find((i) => i.id === id);
    if (!init) throw notFound("Initiative");
    const goal = tree.goals.find((g) => g.id === init.goalId);
    return { ...init, goal: goal ? { id: goal.id, title: goal.title } : null };
  }

  async create(ctx: AuthContext, kind: "GOAL" | "INITIATIVE", input: GoalInput) {
    const d = canCreateGoal(ctx, kind);
    if (!d.allow) throw forbidden(d.reason);
    if (input.ownerId && !(await this.db.tx.membership.findFirst({ where: { id: input.ownerId, status: "ACTIVE" } }))) throw invalid("UNKNOWN_PERSON", "Owner not found");
    const base = {
      organizationId: this.db.orgId,
      title: input.title,
      description: input.description ?? null,
      ownerId: input.ownerId ?? ctx.membershipId,
      priority: input.priority ?? "MEDIUM",
      startDate: input.startDate ?? null,
      targetDate: input.targetDate ?? null,
      visibility: (input.visibility ?? "ORG") as ResourceVisibility,
    };
    let created;
    if (kind === "GOAL") {
      created = await this.db.tx.companyGoal.create({ data: { ...base, period: input.period ?? null } });
    } else {
      if (input.goalId && !this.scope().goals.has(input.goalId)) throw invalid("INVALID_GOAL", "Goal not found");
      created = await this.db.tx.initiative.create({ data: { ...base, goalId: input.goalId ?? null } });
    }
    await this.authz.bump();
    await this.audit.record(`${kind.toLowerCase()}.created`, kind.toLowerCase(), created.id, { title: created.title, visibility: created.visibility });
    return created;
  }

  async update(ctx: AuthContext, kind: "GOAL" | "INITIATIVE", id: string, input: Partial<GoalInput> & { status?: GoalStatus }) {
    const res = kind === "GOAL" ? this.scope().goals.get(id) : this.scope().initiatives.get(id);
    if (!res) throw notFound(kind === "GOAL" ? "Goal" : "Initiative");
    const d = canEditGoal(ctx, res);
    if (!d.allow) throw forbidden(d.reason);
    const before = kind === "GOAL" ? await this.db.tx.companyGoal.findUnique({ where: { id } }) : await this.db.tx.initiative.findUnique({ where: { id } });
    if (!before) throw notFound();
    if (input.status) assertTransition("goal", before.status, input.status);
    if (kind === "INITIATIVE" && input.goalId && !this.scope().goals.has(input.goalId)) throw invalid("INVALID_GOAL", "Goal not found");
    const { goalId, period, ...common } = input;
    const updated =
      kind === "GOAL"
        ? await this.db.tx.companyGoal.update({ where: { id }, data: { ...common, ...(period !== undefined ? { period } : {}) } })
        : await this.db.tx.initiative.update({ where: { id }, data: { ...common, ...(goalId !== undefined ? { goalId } : {}) } });
    if (input.visibility !== undefined || input.ownerId !== undefined) await this.authz.bump();
    await this.audit.record(`${kind.toLowerCase()}.updated`, kind.toLowerCase(), id, {
      before: { status: before.status, ownerId: before.ownerId, visibility: before.visibility },
      after: { status: updated.status, ownerId: updated.ownerId, visibility: updated.visibility },
    });
    return updated;
  }
}

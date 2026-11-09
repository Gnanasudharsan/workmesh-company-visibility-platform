import { ConflictException, Injectable } from "@nestjs/common";
import {
  analyzeImpact,
  canEditProject,
  canManageProject,
  dependencyWouldCreateCycle,
  downstreamReach,
  upstreamReach,
  type AuthContext,
  type DependencyEdge,
  type DependencyState,
} from "@workmesh/core";
import { AuditService } from "../../common/audit.service";
import { currentStore } from "../../common/context";
import { Db } from "../../common/db.service";
import { EventsService } from "../../common/events.service";
import { forbidden, invalid, notFound } from "../../common/errors";
import { PeopleService } from "../org/people.service";
import { ProjectsService } from "../work/projects.service";

const DAY = 86_400_000;

@Injectable()
export class DependenciesService {
  constructor(
    private readonly db: Db,
    private readonly projects: ProjectsService,
    private readonly people: PeopleService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  private scope() {
    return currentStore()!.scope!;
  }

  /** Edges where the viewer can see both endpoints. Hidden projects contribute nothing. */
  private async visibleEdges() {
    const visible = this.scope().projectAccess;
    const rows = await this.db.tx.dependency.findMany({ orderBy: { createdAt: "asc" } });
    return rows.filter((d) => visible.has(d.upstreamProjectId) && visible.has(d.downstreamProjectId));
  }

  async explorer(ctx: AuthContext, focusProjectId?: string) {
    const rows = await this.visibleEdges();
    const edges: DependencyEdge[] = rows.map((d) => ({ id: d.id, upstreamId: d.upstreamProjectId, downstreamId: d.downstreamProjectId, state: d.state, isCritical: d.isCritical }));
    let nodeIds = new Set(rows.flatMap((d) => [d.upstreamProjectId, d.downstreamProjectId]));
    if (focusProjectId) {
      if (!this.scope().projectAccess.has(focusProjectId)) throw notFound("Project");
      const related = new Set([focusProjectId, ...upstreamReach(edges, focusProjectId).keys(), ...downstreamReach(edges, focusProjectId).keys()]);
      nodeIds = new Set([...nodeIds].filter((id) => related.has(id)));
      nodeIds.add(focusProjectId);
    }
    const presented = (await this.projects.list(ctx)).filter((p) => nodeIds.has(p.id));
    const blocking = await this.db.tx.blocker.groupBy({
      by: ["projectId"],
      where: { projectId: { in: [...nodeIds] }, state: { not: "RESOLVED" }, severity: { in: ["HIGH", "CRITICAL"] } },
      _count: { _all: true },
    });
    const impact = analyzeImpact({
      projects: presented.map((p) => ({ id: p.id, status: p.status, hasBlockingBlocker: blocking.some((b) => b.projectId === p.id) })),
      edges: edges.filter((e) => nodeIds.has(e.upstreamId) && nodeIds.has(e.downstreamId)),
    });
    const byId = new Map(presented.map((p) => [p.id, p]));
    const people = await this.people.all();
    return {
      nodes: presented,
      edges: rows
        .filter((d) => nodeIds.has(d.upstreamProjectId) && nodeIds.has(d.downstreamProjectId))
        .map((d) => {
          const upstreamTarget = byId.get(d.upstreamProjectId)?.targetDate ?? null;
          return {
            id: d.id,
            upstreamId: d.upstreamProjectId,
            downstreamId: d.downstreamProjectId,
            description: d.description,
            state: d.state,
            isCritical: d.isCritical,
            needBy: d.needBy,
            owner: this.people.liteOf(people.get(d.ownerId ?? "")),
            resolvedAt: d.resolvedAt,
            // Evidence, not a prediction: days between upstream target and downstream need-by date.
            slackDays: d.needBy && upstreamTarget ? Math.round((d.needBy.getTime() - new Date(upstreamTarget).getTime()) / DAY) : null,
            canEdit: this.canEdit(ctx, d.upstreamProjectId, d.downstreamProjectId),
          };
        }),
      impact: {
        confirmed: [...impact.confirmed].map(([id, reasons]) => ({ id, reasons })),
        potential: [...impact.potential].map(([id, info]) => ({ id, ...info })),
      },
    };
  }

  private canEdit(ctx: AuthContext, upstreamId: string, downstreamId: string) {
    const s = this.scope();
    return [upstreamId, downstreamId].some((id) => {
      const res = s.projects.get(id);
      return !!res && s.projectAccess.get(id) === "details" && canEditProject(ctx, res).allow;
    });
  }

  async create(ctx: AuthContext, input: { upstreamProjectId: string; downstreamProjectId: string; description: string; ownerId?: string | null; isCritical?: boolean; needBy?: Date | null; upstreamMilestoneId?: string | null; downstreamMilestoneId?: string | null }) {
    const s = this.scope();
    if (!s.projectAccess.has(input.upstreamProjectId) || !s.projectAccess.has(input.downstreamProjectId)) throw notFound("Project");
    if (input.upstreamProjectId === input.downstreamProjectId) throw invalid("SELF_DEPENDENCY", "A project cannot depend on itself");
    const downstream = s.projects.get(input.downstreamProjectId)!;
    if (s.projectAccess.get(input.downstreamProjectId) !== "details" || !canEditProject(ctx, downstream).allow)
      throw forbidden("Only people who can edit the dependent project can add its dependencies");
    if (input.ownerId && !(await this.db.tx.membership.findFirst({ where: { id: input.ownerId, status: "ACTIVE" } }))) throw invalid("UNKNOWN_PERSON", "Owner not found");
    // Cycle detection must consider every edge, including ones the viewer cannot see.
    const all = await this.db.tx.dependency.findMany({ select: { id: true, upstreamProjectId: true, downstreamProjectId: true, state: true, isCritical: true } });
    const edges = all.map((d) => ({ id: d.id, upstreamId: d.upstreamProjectId, downstreamId: d.downstreamProjectId, state: d.state, isCritical: d.isCritical }));
    if (edges.some((e) => e.upstreamId === input.upstreamProjectId && e.downstreamId === input.downstreamProjectId))
      throw new ConflictException({ code: "DUPLICATE", message: "This dependency already exists." });
    if (dependencyWouldCreateCycle(edges, input.upstreamProjectId, input.downstreamProjectId))
      throw invalid("DEPENDENCY_CYCLE", "This would create a circular dependency.");
    const d = await this.db.tx.dependency.create({
      data: { ...input, organizationId: this.db.orgId, createdById: ctx.membershipId },
    });
    await this.audit.record("dependency.created", "dependency", d.id, { upstream: d.upstreamProjectId, downstream: d.downstreamProjectId, isCritical: d.isCritical });
    await this.events.emit("dependency.changed", { dependencyId: d.id, upstreamProjectId: d.upstreamProjectId, downstreamProjectId: d.downstreamProjectId, state: d.state });
    return d;
  }

  async update(ctx: AuthContext, id: string, input: { state?: DependencyState; ownerId?: string | null; isCritical?: boolean; needBy?: Date | null; description?: string }) {
    const d = await this.db.tx.dependency.findUnique({ where: { id } });
    const s = this.scope();
    if (!d || !s.projectAccess.has(d.upstreamProjectId) || !s.projectAccess.has(d.downstreamProjectId)) throw notFound("Dependency");
    if (!this.canEdit(ctx, d.upstreamProjectId, d.downstreamProjectId)) throw forbidden("Only editors of either project can change this dependency");
    if (input.ownerId && !(await this.db.tx.membership.findFirst({ where: { id: input.ownerId, status: "ACTIVE" } }))) throw invalid("UNKNOWN_PERSON", "Owner not found");
    const resolvedAt = input.state === "RESOLVED" && d.state !== "RESOLVED" ? new Date() : input.state && input.state !== "RESOLVED" ? null : undefined;
    const updated = await this.db.tx.dependency.update({ where: { id }, data: { ...input, ...(resolvedAt !== undefined ? { resolvedAt } : {}) } });
    await this.audit.record("dependency.updated", "dependency", id, { before: { state: d.state, ownerId: d.ownerId }, after: { state: updated.state, ownerId: updated.ownerId } });
    await this.events.emit("dependency.changed", { dependencyId: id, upstreamProjectId: d.upstreamProjectId, downstreamProjectId: d.downstreamProjectId, state: updated.state, from: d.state });
    return updated;
  }

  async remove(ctx: AuthContext, id: string) {
    const d = await this.db.tx.dependency.findUnique({ where: { id } });
    const s = this.scope();
    if (!d || !s.projectAccess.has(d.upstreamProjectId) || !s.projectAccess.has(d.downstreamProjectId)) throw notFound("Dependency");
    const downstream = s.projects.get(d.downstreamProjectId)!;
    if (!canManageProject(ctx, downstream).allow && !canEditProject(ctx, downstream).allow) throw forbidden("Only editors of the dependent project can remove it");
    await this.db.tx.dependency.delete({ where: { id } });
    await this.audit.record("dependency.deleted", "dependency", id, { upstream: d.upstreamProjectId, downstream: d.downstreamProjectId });
    await this.events.emit("dependency.changed", { dependencyId: id, upstreamProjectId: d.upstreamProjectId, downstreamProjectId: d.downstreamProjectId, state: "DELETED" });
  }
}

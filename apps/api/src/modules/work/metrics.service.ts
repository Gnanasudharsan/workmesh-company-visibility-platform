import { Injectable } from "@nestjs/common";
import { computeHealth, type HealthResult } from "@workmesh/core";
import { currentStore } from "../../common/context";
import { Db } from "../../common/db.service";

export interface ProjectMetrics extends HealthResult {
  milestones: { total: number; done: number; critical: number; nextDue: { id: string; title: string; dueDate: Date } | null };
  workItems: { total: number; done: number; blocked: number; cancelled: number };
  openBlockers: number;
  upstream: { unresolved: number; blocked: number; atRisk: number };
}

/**
 * Batched health/progress computation for many projects with a constant number of queries
 * (no N+1). Upstream dependencies are counted only when the viewer can see the upstream
 * project, so health never reveals the existence of a restricted project.
 */
@Injectable()
export class ProjectMetricsService {
  constructor(private readonly db: Db) {}

  async compute(projectIds: string[]): Promise<Map<string, ProjectMetrics>> {
    const out = new Map<string, ProjectMetrics>();
    if (projectIds.length === 0) return out;
    const tx = this.db.tx;
    const visible = currentStore()?.scope?.projectAccess;
    const [projects, milestones, items, blockers, deps] = await Promise.all([
      tx.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, status: true, startDate: true, targetDate: true } }),
      tx.milestone.findMany({
        where: { projectId: { in: projectIds } },
        select: { id: true, projectId: true, title: true, status: true, dueDate: true, isCritical: true },
        orderBy: { dueDate: "asc" },
      }),
      tx.workItem.groupBy({ by: ["projectId", "status"], where: { projectId: { in: projectIds } }, _count: { _all: true } }),
      tx.blocker.findMany({ where: { projectId: { in: projectIds }, state: { not: "RESOLVED" } }, select: { projectId: true, severity: true } }),
      tx.dependency.findMany({
        where: { downstreamProjectId: { in: projectIds }, state: { not: "RESOLVED" } },
        select: { downstreamProjectId: true, upstreamProjectId: true, state: true },
      }),
    ]);
    const now = new Date();
    for (const p of projects) {
      const ms = milestones.filter((m) => m.projectId === p.id);
      const wi = items.filter((i) => i.projectId === p.id);
      const count = (s: string) => wi.find((i) => i.status === s)?._count._all ?? 0;
      const work = { total: wi.reduce((a, i) => a + i._count._all, 0), done: count("DONE"), cancelled: count("CANCELLED"), blocked: count("BLOCKED") };
      const bl = blockers.filter((b) => b.projectId === p.id);
      const up = deps.filter((d) => d.downstreamProjectId === p.id && (!visible || visible.has(d.upstreamProjectId)));
      const upstream = { unresolved: up.length, blocked: up.filter((d) => d.state === "BLOCKED").length, atRisk: up.filter((d) => d.state === "AT_RISK").length };
      const health = computeHealth({
        status: p.status,
        startDate: p.startDate,
        targetDate: p.targetDate,
        milestones: ms,
        workItems: work,
        openBlockers: bl,
        upstream,
        now,
      });
      const next = ms.find((m) => m.status !== "DONE" && m.status !== "CANCELLED" && m.dueDate);
      out.set(p.id, {
        ...health,
        milestones: {
          total: ms.filter((m) => m.status !== "CANCELLED").length,
          done: ms.filter((m) => m.status === "DONE").length,
          critical: ms.filter((m) => m.isCritical).length,
          nextDue: next ? { id: next.id, title: next.title, dueDate: next.dueDate! } : null,
        },
        workItems: work,
        openBlockers: bl.length,
        upstream,
      });
    }
    return out;
  }
}

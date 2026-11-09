import { Injectable } from "@nestjs/common";
import {
  buildIndex,
  canViewGoal,
  projectAccess,
  reportingSubtree,
  type AuthContext,
  type GoalResource,
  type GrantLevel,
  type ProjectResource,
  type ProjectRole,
  type ReportingEdge,
} from "@workmesh/core";
import { Db } from "../../common/db.service";
import type { ViewerScope } from "./authz.types";

interface CacheEntry {
  ctx: AuthContext;
  scope: ViewerScope;
}

const MAX_CACHE = 2_000;
const MAX_AGE_MS = 60_000;

/**
 * Builds the AuthContext (relationships) and ViewerScope (resource visibility) for a member.
 *
 * Caching: entries are keyed by (org, member) and stamped with the organization's
 * `authzVersion`. Every write that can change authorization bumps that version inside the
 * same transaction, so the next request after commit sees a version mismatch and rebuilds —
 * revocation is immediate. Entries also expire at the earliest grant/delegation boundary.
 */
@Injectable()
export class AuthzService {
  private readonly cache = new Map<string, CacheEntry>();
  /** Exposed for tests/metrics. */
  stats = { hits: 0, misses: 0 };

  constructor(private readonly db: Db) {}

  /** Must be called inside a tenant transaction for any write that changes who can see what. */
  async bump(): Promise<void> {
    await this.db.tx.organization.update({
      where: { id: this.db.orgId },
      data: { authzVersion: { increment: 1 } },
    });
  }

  async currentVersion(orgId: string): Promise<number> {
    const org = await this.db.tx.organization.findUnique({ where: { id: orgId }, select: { authzVersion: true } });
    return org?.authzVersion ?? -1;
  }

  /** Loads (or reuses) the context. Must run inside `db.runAsTenant(orgId)`. */
  async load(orgId: string, membershipId: string, userId: string): Promise<CacheEntry | null> {
    const key = `${orgId}:${membershipId}`;
    const version = await this.currentVersion(orgId);
    const hit = this.cache.get(key);
    if (hit && hit.scope.authzVersion === version && Date.now() < hit.scope.validUntil) {
      this.stats.hits++;
      return hit;
    }
    this.stats.misses++;
    const built = await this.build(orgId, membershipId, userId, version);
    if (!built) {
      this.cache.delete(key);
      return null;
    }
    if (this.cache.size >= MAX_CACHE) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, built);
    return built;
  }

  invalidateAll() {
    this.cache.clear();
  }

  private async build(orgId: string, membershipId: string, userId: string, version: number): Promise<CacheEntry | null> {
    const tx = this.db.tx;
    const now = new Date();
    const [membership, teamMemberships, teams, headed, lines, delegations, myProjects, grants, projects, goals, initiatives] =
      await Promise.all([
        tx.membership.findFirst({ where: { id: membershipId, organizationId: orgId, userId } }),
        tx.teamMembership.findMany({ where: { endedAt: null }, select: { teamId: true, membershipId: true, role: true } }),
        tx.team.findMany({ select: { id: true, departmentId: true } }),
        tx.department.findMany({ where: { headId: membershipId }, select: { id: true } }),
        tx.reportingLine.findMany({ where: { endedAt: null }, select: { reportId: true, managerId: true, type: true } }),
        tx.delegation.findMany({
          where: { revokedAt: null, expiresAt: { gt: now } },
          select: { delegatorId: true, delegateId: true, startsAt: true, expiresAt: true },
        }),
        tx.projectMember.findMany({ where: { membershipId }, select: { projectId: true, role: true } }),
        tx.accessGrant.findMany({
          where: { granteeId: membershipId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          select: { resourceType: true, resourceId: true, level: true, expiresAt: true },
        }),
        tx.project.findMany({
          select: { id: true, visibility: true, discoverable: true, owningTeamId: true, leadId: true },
        }),
        tx.companyGoal.findMany({ select: { id: true, visibility: true, ownerId: true } }),
        tx.initiative.findMany({ select: { id: true, visibility: true, ownerId: true } }),
      ]);
    if (!membership) return null;

    // Teams
    const teamIds = new Set<string>();
    const ledTeamIds = new Set<string>();
    for (const tm of teamMemberships) {
      if (tm.membershipId !== membershipId) continue;
      teamIds.add(tm.teamId);
      if (tm.role === "LEAD") ledTeamIds.add(tm.teamId);
    }
    const teammateIds = new Set<string>();
    for (const tm of teamMemberships) {
      if (teamIds.has(tm.teamId) && tm.membershipId !== membershipId) teammateIds.add(tm.membershipId);
    }
    const teamDept = new Map(teams.map((t) => [t.id, t.departmentId]));

    // Reporting (+ active delegations: the delegate inherits the delegator's direct reports)
    const edges: ReportingEdge[] = lines.map((l) => ({ reportId: l.reportId, managerId: l.managerId, type: l.type }));
    const primaryIdx = buildIndex(edges);
    let nextBoundary = now.getTime() + MAX_AGE_MS;
    for (const d of delegations) {
      if (d.startsAt > now) {
        nextBoundary = Math.min(nextBoundary, d.startsAt.getTime());
        continue;
      }
      nextBoundary = Math.min(nextBoundary, d.expiresAt.getTime());
      for (const r of primaryIdx.reportsOf.get(d.delegatorId) ?? []) {
        if (r !== d.delegateId) edges.push({ reportId: r, managerId: d.delegateId, type: "DOTTED" });
      }
    }
    const idx = buildIndex(edges);
    const managedMemberIds = new Set(reportingSubtree(idx, membershipId).keys());
    const directReportIds = new Set(idx.reportsOf.get(membershipId) ?? []);

    // Projects
    const projectRoles = new Map<string, ProjectRole>(myProjects.map((p) => [p.projectId, p.role]));
    for (const p of projects) if (p.leadId === membershipId) projectRoles.set(p.id, "LEAD");

    const grantMap = new Map<string, GrantLevel>();
    for (const g of grants) {
      const key = `${g.resourceType}:${g.resourceId}`;
      if (g.level === "DETAILS" || !grantMap.has(key)) grantMap.set(key, g.level);
      if (g.expiresAt) nextBoundary = Math.min(nextBoundary, g.expiresAt.getTime());
    }

    const ctx: AuthContext = {
      orgId,
      userId,
      membershipId,
      role: membership.role,
      active: membership.status === "ACTIVE",
      teamIds,
      ledTeamIds,
      headedDepartmentIds: new Set(headed.map((d) => d.id)),
      directReportIds,
      managedMemberIds,
      teammateIds,
      projectRoles,
      grants: grantMap,
    };

    const scope: ViewerScope = {
      authzVersion: version,
      builtAt: now.getTime(),
      validUntil: nextBoundary,
      projectAccess: new Map(),
      projects: new Map(),
      goals: new Map(),
      initiatives: new Map(),
    };
    for (const p of projects) {
      const res: ProjectResource = {
        id: p.id,
        orgId,
        visibility: p.visibility,
        discoverable: p.discoverable,
        owningTeamId: p.owningTeamId,
        owningDepartmentId: p.owningTeamId ? (teamDept.get(p.owningTeamId) ?? null) : null,
        leadId: p.leadId,
      };
      const level = projectAccess(ctx, res).level;
      if (level !== "none") {
        scope.projectAccess.set(p.id, level);
        scope.projects.set(p.id, res);
      }
    }
    for (const g of goals) {
      const res: GoalResource = { id: g.id, orgId, kind: "GOAL", visibility: g.visibility, ownerId: g.ownerId };
      if (canViewGoal(ctx, res).allow) scope.goals.set(g.id, res);
    }
    for (const i of initiatives) {
      const res: GoalResource = { id: i.id, orgId, kind: "INITIATIVE", visibility: i.visibility, ownerId: i.ownerId };
      if (canViewGoal(ctx, res).allow) scope.initiatives.set(i.id, res);
    }
    return { ctx, scope };
  }
}

import { Injectable } from "@nestjs/common";
import { buildIndex, managementChain, reportingSubtree, type AuthContext } from "@workmesh/core";
import { currentStore } from "../../common/context";
import { Db } from "../../common/db.service";
import { notFound } from "../../common/errors";
import { OrgService } from "../org/org.service";
import { PeopleService } from "../org/people.service";
import { GoalsService } from "../work/goals.service";

export interface GraphNode {
  id: string;
  type: "company" | "department" | "team" | "person" | "goal" | "initiative" | "project" | "milestone";
  label: string;
  data: Record<string, unknown>;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: "contains" | "belongs_to" | "leads" | "reports_to" | "dotted_line" | "contributes_to" | "supports" | "owned_by" | "depends_on" | "milestone_of";
  data?: Record<string, unknown>;
}

/**
 * Company Map graph builder. The server returns only nodes/edges the viewer is authorized to
 * see; nothing is sent to the browser to be hidden with CSS. Expansion is progressive: the
 * overview contains company → departments → teams; people appear only for expanded teams or
 * a focused reporting subtree.
 */
@Injectable()
export class GraphService {
  constructor(
    private readonly db: Db,
    private readonly people: PeopleService,
    private readonly org: OrgService,
    private readonly goals: GoalsService,
  ) {}

  async peopleGraph(opts: { expandTeams: string[]; focus?: string; expandAll?: boolean }) {
    const [people, depts, teams, lines, org] = await Promise.all([
      this.people.all(),
      this.org.departments(),
      this.org.teams(),
      this.db.tx.reportingLine.findMany({ where: { endedAt: null }, select: { reportId: true, managerId: true, type: true } }),
      this.db.tx.organization.findUnique({ where: { id: this.db.orgId }, select: { id: true, name: true } }),
    ]);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const companyId = `company:${org!.id}`;
    const active = [...people.values()].filter((p) => p.active);
    nodes.push({ id: companyId, type: "company", label: org!.name, data: { memberCount: active.length, departmentCount: depts.length } });
    for (const d of depts) {
      nodes.push({ id: `department:${d.id}`, type: "department", label: d.name, data: { entityId: d.id, color: d.color, head: d.head, memberCount: d.memberCount, teamCount: d.teams.length } });
      edges.push({ id: `e:${companyId}:${d.id}`, source: companyId, target: `department:${d.id}`, type: "contains" });
    }
    const expanded = new Set(opts.expandAll ? teams.map((t) => t.id) : opts.expandTeams);
    for (const t of teams) {
      const parent = t.department ? `department:${t.department.id}` : companyId;
      nodes.push({
        id: `team:${t.id}`,
        type: "team",
        label: t.name,
        data: { entityId: t.id, lead: t.lead, memberCount: t.memberCount, mission: t.mission, departmentId: t.department?.id ?? null, color: t.department?.color, expanded: expanded.has(t.id) },
      });
      edges.push({ id: `e:${parent}:${t.id}`, source: parent, target: `team:${t.id}`, type: "contains" });
    }

    const personIds = new Set<string>();
    for (const p of active) if (p.primaryTeamId && expanded.has(p.primaryTeamId)) personIds.add(p.id);

    const idx = buildIndex(lines.map((l) => ({ reportId: l.reportId, managerId: l.managerId, type: l.type })));
    if (opts.focus) {
      if (!people.get(opts.focus)?.active) throw notFound("Person");
      personIds.add(opts.focus);
      for (const id of reportingSubtree(idx, opts.focus).keys()) personIds.add(id);
      for (const id of managementChain(idx, opts.focus)) personIds.add(id);
    }

    for (const id of personIds) {
      const p = people.get(id)!;
      const reports = idx.reportsOf.get(id)?.size ?? 0;
      nodes.push({
        id: `person:${id}`,
        type: "person",
        label: p.name,
        data: { entityId: id, title: p.title, avatarHue: p.avatarHue, role: p.role, teams: p.teams, primaryTeamId: p.primaryTeamId, departmentId: p.departmentId, directReports: reports, isManager: reports > 0, focused: id === opts.focus },
      });
      if (p.primaryTeamId && expanded.has(p.primaryTeamId)) {
        const isLead = p.teams.some((t) => t.id === p.primaryTeamId && t.role === "LEAD");
        edges.push({ id: `e:team:${p.primaryTeamId}:${id}`, source: `team:${p.primaryTeamId}`, target: `person:${id}`, type: isLead ? "leads" : "belongs_to" });
      }
    }
    for (const l of lines) {
      if (personIds.has(l.reportId) && personIds.has(l.managerId)) {
        edges.push({ id: `r:${l.managerId}:${l.reportId}:${l.type}`, source: `person:${l.managerId}`, target: `person:${l.reportId}`, type: l.type === "PRIMARY" ? "reports_to" : "dotted_line" });
      }
    }
    return { nodes, edges };
  }

  async workGraph(ctx: AuthContext, opts: { expandProjects: string[] }) {
    const scope = currentStore()!.scope!;
    const tree = await this.goals.tree(ctx);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const teams = new Map<string, string>();
    const addProject = (p: (typeof tree.unalignedProjects)[number], parent: string | null) => {
      nodes.push({
        id: `project:${p.id}`,
        type: "project",
        label: p.name,
        data: { entityId: p.id, key: p.key, status: p.status, health: p.health, computedProgress: p.computedProgress, access: p.access, lead: p.lead, team: p.owningTeam, targetDate: p.targetDate, openBlockers: p.openBlockers, expanded: opts.expandProjects.includes(p.id) },
      });
      if (parent) edges.push({ id: `s:${p.id}:${parent}`, source: parent, target: `project:${p.id}`, type: "supports" });
      if (p.owningTeam) {
        teams.set(p.owningTeam.id, p.owningTeam.name);
        edges.push({ id: `o:${p.id}:${p.owningTeam.id}`, source: `project:${p.id}`, target: `team:${p.owningTeam.id}`, type: "owned_by" });
      }
    };
    for (const g of tree.goals) {
      nodes.push({ id: `goal:${g.id}`, type: "goal", label: g.title, data: { entityId: g.id, status: g.status, priority: g.priority, period: g.period, progress: g.progress, projectCount: g.projectCount, atRisk: g.atRisk, owner: g.owner } });
      for (const i of g.initiatives) {
        nodes.push({ id: `initiative:${i.id}`, type: "initiative", label: i.title, data: { entityId: i.id, status: i.status, progress: i.progress, projectCount: i.projectCount, atRisk: i.atRisk, owner: i.owner } });
        edges.push({ id: `c:${i.id}:${g.id}`, source: `goal:${g.id}`, target: `initiative:${i.id}`, type: "contributes_to" });
        for (const p of i.projects) addProject(p, `initiative:${i.id}`);
      }
    }
    for (const i of tree.unalignedInitiatives) {
      nodes.push({ id: `initiative:${i.id}`, type: "initiative", label: i.title, data: { entityId: i.id, status: i.status, progress: i.progress, projectCount: i.projectCount, atRisk: i.atRisk, owner: i.owner } });
      for (const p of i.projects) addProject(p, `initiative:${i.id}`);
    }
    for (const p of tree.unalignedProjects) addProject(p, null);
    for (const [id, name] of teams) nodes.push({ id: `team:${id}`, type: "team", label: name, data: { entityId: id } });

    const visible = scope.projectAccess;
    const deps = await this.db.tx.dependency.findMany({ where: { state: { not: "RESOLVED" } } });
    for (const d of deps) {
      if (!visible.has(d.upstreamProjectId) || !visible.has(d.downstreamProjectId)) continue;
      edges.push({ id: `d:${d.id}`, source: `project:${d.upstreamProjectId}`, target: `project:${d.downstreamProjectId}`, type: "depends_on", data: { state: d.state, isCritical: d.isCritical, description: d.description } });
    }
    const expandable = opts.expandProjects.filter((id) => visible.get(id) === "details");
    if (expandable.length) {
      const milestones = await this.db.tx.milestone.findMany({ where: { projectId: { in: expandable } }, orderBy: { dueDate: "asc" } });
      for (const m of milestones) {
        nodes.push({ id: `milestone:${m.id}`, type: "milestone", label: m.title, data: { entityId: m.id, status: m.status, dueDate: m.dueDate, isCritical: m.isCritical, projectId: m.projectId } });
        edges.push({ id: `m:${m.id}`, source: `project:${m.projectId}`, target: `milestone:${m.id}`, type: "milestone_of" });
      }
    }
    return { nodes, edges };
  }
}

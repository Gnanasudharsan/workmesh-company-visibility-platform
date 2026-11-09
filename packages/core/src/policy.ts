/**
 * WorkMesh policy decision point.
 *
 * A pure, deny-by-default engine combining:
 *  - RBAC  — organization role (OWNER, ADMIN, EXECUTIVE, MEMBER)
 *  - ReBAC — relationships: reports-to (transitive), team membership/leadership,
 *            department headship, project membership/leadership, explicit grants, delegation
 *  - ABAC  — resource attributes: tenant, visibility classification, discoverability,
 *            membership status, grant/delegation expiry, ownership
 *
 * Important invariants:
 *  - Every decision first checks the tenant and that the viewer is an ACTIVE member.
 *  - Administrative permission (ADMIN/OWNER) grants configuration powers only. It never
 *    implies access to project details or updates.
 *  - Seniority (EXECUTIVE) grants *summaries* of non-restricted projects, never details.
 *  - RESTRICTED resources are invisible without a relationship or grant — no name, count or edge.
 *  - Drafts and PRIVATE updates are visible only to their author.
 *
 * The API constructs an AuthContext once per request (cached per org authzVersion) and calls
 * these functions. List endpoints pre-filter in SQL using the same sets, then re-check each
 * row with these functions as defense in depth.
 */
import type {
  GrantLevel,
  MeetingVisibility,
  OrgRole,
  ProjectRole,
  ResourceVisibility,
  UpdateVisibility,
} from "./enums";

export interface AuthContext {
  orgId: string;
  userId: string;
  membershipId: string;
  role: OrgRole;
  active: boolean;
  /** Teams the viewer actively belongs to. */
  teamIds: ReadonlySet<string>;
  /** Teams the viewer leads. */
  ledTeamIds: ReadonlySet<string>;
  /** Departments the viewer heads. */
  headedDepartmentIds: ReadonlySet<string>;
  /** Direct reports (primary + dotted + active delegation). */
  directReportIds: ReadonlySet<string>;
  /** Everyone below the viewer in the management graph (includes direct reports). */
  managedMemberIds: ReadonlySet<string>;
  /** Members who share at least one active team with the viewer. */
  teammateIds: ReadonlySet<string>;
  /** projectId → viewer's role on that project. */
  projectRoles: ReadonlyMap<string, ProjectRole>;
  /** `${resourceType}:${resourceId}` → strongest active (non-expired, non-revoked) grant level. */
  grants: ReadonlyMap<string, GrantLevel>;
}

export interface Decision {
  allow: boolean;
  reason: string;
}

const allow = (reason: string): Decision => ({ allow: true, reason });
const deny = (reason: string): Decision => ({ allow: false, reason });

export const isAdmin = (ctx: AuthContext) => ctx.role === "OWNER" || ctx.role === "ADMIN";
export const isExecutive = (ctx: AuthContext) => ctx.role === "OWNER" || ctx.role === "EXECUTIVE";

function baseCheck(ctx: AuthContext, orgId: string): Decision | null {
  if (!ctx.active) return deny("Membership is not active");
  if (ctx.orgId !== orgId) return deny("Resource belongs to a different organization");
  return null;
}

/* -------------------------------------------------------------------------- */
/* Projects / initiatives / goals                                              */
/* -------------------------------------------------------------------------- */

export interface ProjectResource {
  id: string;
  orgId: string;
  visibility: ResourceVisibility;
  discoverable: boolean;
  owningTeamId: string | null;
  owningDepartmentId: string | null;
  leadId: string | null;
}

export type AccessLevel = "none" | "summary" | "details";

export function projectAccess(ctx: AuthContext, p: ProjectResource): { level: AccessLevel; reason: string } {
  const base = baseCheck(ctx, p.orgId);
  if (base) return { level: "none", reason: base.reason };

  const role = ctx.projectRoles.get(p.id);
  if (role) return { level: "details", reason: `Project ${role.toLowerCase()}` };
  if (p.leadId === ctx.membershipId) return { level: "details", reason: "Project lead" };
  const grant = ctx.grants.get(`PROJECT:${p.id}`);
  if (grant === "DETAILS") return { level: "details", reason: "Explicit access grant (details)" };

  switch (p.visibility) {
    case "ORG":
      return { level: "details", reason: "Visible to the whole organization" };
    case "TEAM":
      if (p.owningTeamId && ctx.teamIds.has(p.owningTeamId))
        return { level: "details", reason: "Member of the owning team" };
      if (p.owningDepartmentId && ctx.headedDepartmentIds.has(p.owningDepartmentId))
        return { level: "details", reason: "Head of the owning department" };
      break;
    case "PROJECT_MEMBERS":
    case "RESTRICTED":
      break;
  }

  if (grant === "SUMMARY") return { level: "summary", reason: "Explicit access grant (summary)" };
  if (p.visibility === "RESTRICTED") return { level: "none", reason: "Restricted project — no relationship or grant" };
  if (isExecutive(ctx)) return { level: "summary", reason: "Executive portfolio summary" };
  if (p.owningDepartmentId && ctx.headedDepartmentIds.has(p.owningDepartmentId))
    return { level: "summary", reason: "Head of the owning department" };
  if (p.discoverable) return { level: "summary", reason: "Discoverable summary" };
  return { level: "none", reason: "Not a member of this project" };
}

export const canViewProject = (ctx: AuthContext, p: ProjectResource): Decision => {
  const a = projectAccess(ctx, p);
  return { allow: a.level !== "none", reason: a.reason };
};

export const canViewProjectDetails = (ctx: AuthContext, p: ProjectResource): Decision => {
  const a = projectAccess(ctx, p);
  return { allow: a.level === "details", reason: a.reason };
};

/** Edit project fields, milestones and work items. */
export function canEditProject(ctx: AuthContext, p: ProjectResource): Decision {
  const base = baseCheck(ctx, p.orgId);
  if (base) return base;
  const role = ctx.projectRoles.get(p.id);
  if (p.leadId === ctx.membershipId || role === "LEAD") return allow("Project lead");
  if (role === "CONTRIBUTOR") return allow("Project contributor");
  if (p.owningTeamId && ctx.ledTeamIds.has(p.owningTeamId) && projectAccess(ctx, p).level === "details")
    return allow("Lead of the owning team");
  return deny("Only project leads, contributors and the owning team lead can edit");
}

/** Change membership, visibility and grants of a project. */
export function canManageProject(ctx: AuthContext, p: ProjectResource): Decision {
  const base = baseCheck(ctx, p.orgId);
  if (base) return base;
  if (p.leadId === ctx.membershipId || ctx.projectRoles.get(p.id) === "LEAD") return allow("Project lead");
  if (p.owningTeamId && ctx.ledTeamIds.has(p.owningTeamId) && projectAccess(ctx, p).level === "details")
    return allow("Lead of the owning team");
  return deny("Only the project lead or owning team lead can manage this project");
}

export interface GoalResource {
  id: string;
  orgId: string;
  kind: "GOAL" | "INITIATIVE";
  visibility: ResourceVisibility;
  ownerId: string | null;
}

export function canViewGoal(ctx: AuthContext, g: GoalResource): Decision {
  const base = baseCheck(ctx, g.orgId);
  if (base) return base;
  if (g.ownerId === ctx.membershipId) return allow("Owner");
  if (ctx.grants.has(`${g.kind}:${g.id}`)) return allow("Explicit access grant");
  if (g.visibility === "RESTRICTED") return deny("Restricted");
  return allow("Visible to the whole organization");
}

export function canEditGoal(ctx: AuthContext, g: GoalResource): Decision {
  const base = baseCheck(ctx, g.orgId);
  if (base) return base;
  if (g.ownerId === ctx.membershipId) return allow("Owner");
  if (isExecutive(ctx) && canViewGoal(ctx, g).allow) return allow("Executive");
  return deny("Only the owner or an executive can edit goals");
}

export function canCreateGoal(ctx: AuthContext, kind: "GOAL" | "INITIATIVE"): Decision {
  if (!ctx.active) return deny("Membership is not active");
  if (isExecutive(ctx)) return allow("Executive");
  if (kind === "INITIATIVE" && ctx.headedDepartmentIds.size > 0) return allow("Department head");
  return deny(kind === "GOAL" ? "Only executives create company goals" : "Only executives and department heads create initiatives");
}

export function canCreateProject(ctx: AuthContext, owningTeamId: string | null): Decision {
  if (!ctx.active) return deny("Membership is not active");
  if (isExecutive(ctx)) return allow("Executive");
  if (owningTeamId && ctx.teamIds.has(owningTeamId)) return allow("Member of the owning team");
  if (ctx.headedDepartmentIds.size > 0) return allow("Department head");
  return deny("Projects are created by members of the owning team");
}

/* -------------------------------------------------------------------------- */
/* Progress updates                                                            */
/* -------------------------------------------------------------------------- */

export interface UpdateResource {
  id: string;
  orgId: string;
  authorId: string;
  status: "DRAFT" | "PUBLISHED";
  visibility: UpdateVisibility;
  projectId: string | null;
}

/** `projectLevel` = the viewer's access level to the update's project (if any). */
export function canViewUpdate(ctx: AuthContext, u: UpdateResource, projectLevel: AccessLevel | null): Decision {
  const base = baseCheck(ctx, u.orgId);
  if (base) return base;
  if (u.authorId === ctx.membershipId) return allow("Author");
  if (u.status === "DRAFT") return deny("Drafts are private to their author");
  if (u.visibility === "PRIVATE") return deny("Private to the author");
  if (u.projectId && projectLevel !== "details") return deny("No access to the related project's details");

  const managesAuthor = ctx.managedMemberIds.has(u.authorId);
  switch (u.visibility) {
    case "ORG":
      return allow("Shared with the organization");
    case "TEAM":
      if (ctx.teammateIds.has(u.authorId)) return allow("Teammate");
      if (managesAuthor) return allow("In the author's management line");
      return deny("Shared with the author's team");
    case "PROJECT":
      if (u.projectId && ctx.projectRoles.has(u.projectId)) return allow("Project member");
      if (managesAuthor) return allow("In the author's management line");
      return deny("Shared with project members");
    case "MANAGER":
      if (managesAuthor) return allow("In the author's management line");
      return deny("Shared with the author's management chain");
  }
  return deny("Denied by default");
}

export function canEditUpdate(ctx: AuthContext, u: UpdateResource): Decision {
  const base = baseCheck(ctx, u.orgId);
  if (base) return base;
  return u.authorId === ctx.membershipId ? allow("Author") : deny("Only the author can edit an update");
}

/* -------------------------------------------------------------------------- */
/* Blockers                                                                    */
/* -------------------------------------------------------------------------- */

export interface BlockerResource {
  id: string;
  orgId: string;
  reporterId: string;
  ownerId: string | null;
  projectId: string | null;
  visibility: UpdateVisibility;
}

export function canViewBlocker(ctx: AuthContext, b: BlockerResource, projectLevel: AccessLevel | null): Decision {
  const base = baseCheck(ctx, b.orgId);
  if (base) return base;
  if (b.reporterId === ctx.membershipId) return allow("Reporter");
  if (b.ownerId === ctx.membershipId) return allow("Assigned owner");
  if (b.visibility === "PRIVATE") return deny("Private to the reporter");
  const managesReporter = ctx.managedMemberIds.has(b.reporterId);
  if (b.projectId && projectLevel !== "details") return deny("No access to the related project's details");
  if (managesReporter) return allow("In the reporter's management line");
  switch (b.visibility) {
    case "ORG":
      return allow("Shared with the organization");
    case "TEAM":
      return ctx.teammateIds.has(b.reporterId) ? allow("Teammate") : deny("Shared with the reporter's team");
    case "PROJECT":
      return b.projectId && projectLevel === "details" ? allow("Can view project details") : deny("Project only");
    case "MANAGER":
      return deny("Shared with the reporter's management chain");
  }
  return deny("Denied by default");
}

/** Assign owner, change state. */
export function canManageBlocker(
  ctx: AuthContext,
  b: BlockerResource,
  project: ProjectResource | null,
): Decision {
  const base = baseCheck(ctx, b.orgId);
  if (base) return base;
  if (b.reporterId === ctx.membershipId) return allow("Reporter");
  if (b.ownerId === ctx.membershipId) return allow("Assigned owner");
  if (ctx.managedMemberIds.has(b.reporterId)) return allow("Reporter's manager");
  if (project && canManageProject(ctx, project).allow) return allow("Project lead");
  return deny("Only the reporter, owner, their managers or the project lead can manage a blocker");
}

/* -------------------------------------------------------------------------- */
/* People, teams, organization                                                 */
/* -------------------------------------------------------------------------- */

/** View a person's *work summary* (assignments + their shared updates), e.g. in Team Pulse. */
export function canViewMemberWork(ctx: AuthContext, memberId: string): Decision {
  if (!ctx.active) return deny("Membership is not active");
  if (memberId === ctx.membershipId) return allow("Self");
  if (ctx.managedMemberIds.has(memberId)) return allow("In your reporting line");
  return deny("Not in your reporting line");
}

export function canManageTeamMembership(ctx: AuthContext, team: { id: string; departmentId: string | null; orgId: string }): Decision {
  const base = baseCheck(ctx, team.orgId);
  if (base) return base;
  if (isAdmin(ctx)) return allow("Organization administrator");
  if (ctx.ledTeamIds.has(team.id)) return allow("Team lead");
  if (team.departmentId && ctx.headedDepartmentIds.has(team.departmentId)) return allow("Department head");
  return deny("Only admins, team leads or the department head can change team membership");
}

export type OrgCapability =
  | "org.manageSettings"
  | "org.manageMembers"
  | "org.manageInvitations"
  | "org.manageStructure"
  | "org.manageReporting"
  | "org.viewAudit"
  | "org.inspectPermissions";

export function can(ctx: AuthContext, capability: OrgCapability): Decision {
  if (!ctx.active) return deny("Membership is not active");
  if (capability === "org.manageSettings" && ctx.role !== "OWNER" && ctx.role !== "ADMIN")
    return deny("Administrators only");
  return isAdmin(ctx) ? allow("Organization administrator") : deny("Administrators only");
}

/** Who may change someone's org role. Only owners can create/demote other owners. */
export function canChangeRole(ctx: AuthContext, targetCurrent: OrgRole, targetNext: OrgRole): Decision {
  if (!isAdmin(ctx)) return deny("Administrators only");
  if ((targetCurrent === "OWNER" || targetNext === "OWNER") && ctx.role !== "OWNER")
    return deny("Only an owner can grant or remove the owner role");
  return allow("Organization administrator");
}

/* -------------------------------------------------------------------------- */
/* Meetings                                                                    */
/* -------------------------------------------------------------------------- */

export interface MeetingResource {
  id: string;
  orgId: string;
  organizerId: string;
  participantIds: ReadonlySet<string> | string[];
  visibility: MeetingVisibility;
  teamId: string | null;
}

export function canViewMeeting(ctx: AuthContext, m: MeetingResource): Decision {
  const base = baseCheck(ctx, m.orgId);
  if (base) return base;
  const participants = m.participantIds instanceof Set ? m.participantIds : new Set(m.participantIds);
  if (m.organizerId === ctx.membershipId) return allow("Organizer");
  if (participants.has(ctx.membershipId)) return allow("Participant");
  if (m.visibility === "ORG") return allow("Visible to the organization");
  if (m.visibility === "TEAM" && m.teamId && ctx.teamIds.has(m.teamId)) return allow("Team member");
  return deny("Not a participant");
}

export function canEditMeeting(ctx: AuthContext, m: MeetingResource): Decision {
  const base = baseCheck(ctx, m.orgId);
  if (base) return base;
  const participants = m.participantIds instanceof Set ? m.participantIds : new Set(m.participantIds);
  if (m.organizerId === ctx.membershipId) return allow("Organizer");
  if (participants.has(ctx.membershipId)) return allow("Participant");
  return deny("Only the organizer and participants can edit a meeting");
}

/* -------------------------------------------------------------------------- */
/* Workspaces                                                                  */
/* -------------------------------------------------------------------------- */

export type Workspace = "employee" | "manager" | "lead" | "leadership" | "admin";

/** Workspaces the backend authorizes for this member — the UI only shows these. */
export function authorizedWorkspaces(ctx: AuthContext): Workspace[] {
  const ws: Workspace[] = ["employee"];
  if (ctx.directReportIds.size > 0 || ctx.managedMemberIds.size > 0) ws.push("manager");
  const leadsProject = [...ctx.projectRoles.values()].some((r) => r === "LEAD");
  if (leadsProject || ctx.ledTeamIds.size > 0) ws.push("lead");
  if (isExecutive(ctx) || ctx.headedDepartmentIds.size > 0) ws.push("leadership");
  if (isAdmin(ctx)) ws.push("admin");
  return ws;
}

/** Builds an AuthContext with empty relationship sets (convenience for tests and system code). */
export function emptyContext(partial: Partial<AuthContext> & Pick<AuthContext, "orgId" | "membershipId">): AuthContext {
  return {
    userId: partial.userId ?? `user-${partial.membershipId}`,
    role: "MEMBER",
    active: true,
    teamIds: new Set(),
    ledTeamIds: new Set(),
    headedDepartmentIds: new Set(),
    directReportIds: new Set(),
    managedMemberIds: new Set(),
    teammateIds: new Set(),
    projectRoles: new Map(),
    grants: new Map(),
    ...partial,
  };
}

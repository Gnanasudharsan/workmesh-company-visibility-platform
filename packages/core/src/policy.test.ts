/**
 * Authorization matrix: personas × resources × actions.
 * Each row documents an expected decision; the table is the specification.
 */
import { describe, expect, it } from "vitest";
import {
  authorizedWorkspaces,
  can,
  canChangeRole,
  canCreateGoal,
  canEditProject,
  canEditUpdate,
  canManageBlocker,
  canManageProject,
  canManageTeamMembership,
  canViewBlocker,
  canViewGoal,
  canViewMeeting,
  canViewMemberWork,
  canViewUpdate,
  emptyContext,
  projectAccess,
  type AccessLevel,
  type AuthContext,
  type ProjectResource,
  type UpdateResource,
} from "./policy";

const ORG = "org-northstar";
const OTHER_ORG = "org-meridian";

const personas: Record<string, AuthContext> = {
  employee: emptyContext({
    orgId: ORG,
    membershipId: "emp",
    teamIds: new Set(["t-payments"]),
    teammateIds: new Set(["mate"]),
    projectRoles: new Map([["p-checkout", "CONTRIBUTOR"]]),
  }),
  teammate: emptyContext({
    orgId: ORG,
    membershipId: "mate",
    teamIds: new Set(["t-payments"]),
    teammateIds: new Set(["emp"]),
  }),
  manager: emptyContext({
    orgId: ORG,
    membershipId: "mgr",
    teamIds: new Set(["t-payments"]),
    ledTeamIds: new Set(["t-payments"]),
    directReportIds: new Set(["emp", "mate"]),
    managedMemberIds: new Set(["emp", "mate"]),
    teammateIds: new Set(["emp", "mate"]),
  }),
  skipManager: emptyContext({
    orgId: ORG,
    membershipId: "cto",
    role: "EXECUTIVE",
    headedDepartmentIds: new Set(["d-eng"]),
    directReportIds: new Set(["mgr"]),
    managedMemberIds: new Set(["mgr", "emp", "mate"]),
  }),
  projectLead: emptyContext({
    orgId: ORG,
    membershipId: "lead",
    teamIds: new Set(["t-product"]),
    projectRoles: new Map([["p-checkout", "LEAD"]]),
  }),
  outsider: emptyContext({ orgId: ORG, membershipId: "out", teamIds: new Set(["t-sales"]) }),
  executive: emptyContext({ orgId: ORG, membershipId: "ceo", role: "OWNER" }),
  admin: emptyContext({ orgId: ORG, membershipId: "adm", role: "ADMIN", teamIds: new Set(["t-ops"]) }),
  grantee: emptyContext({ orgId: ORG, membershipId: "legal", grants: new Map([["PROJECT:p-acq", "DETAILS"]]) }),
  removed: emptyContext({ orgId: ORG, membershipId: "gone", active: false, projectRoles: new Map([["p-checkout", "CONTRIBUTOR"]]) }),
  foreign: emptyContext({ orgId: OTHER_ORG, membershipId: "mx", role: "OWNER" }),
};

const project = (id: string, visibility: ProjectResource["visibility"], extra: Partial<ProjectResource> = {}): ProjectResource => ({
  id,
  orgId: ORG,
  visibility,
  discoverable: false,
  owningTeamId: "t-payments",
  owningDepartmentId: "d-eng",
  leadId: "lead",
  ...extra,
});

const projects = {
  roadmap: project("p-roadmap", "ORG", { leadId: "mgr" }),
  team: project("p-ledger", "TEAM", { leadId: "mgr" }),
  checkout: project("p-checkout", "PROJECT_MEMBERS", { discoverable: true }),
  acquisition: project("p-acq", "RESTRICTED", { owningTeamId: null, owningDepartmentId: null, leadId: "ceo-delegate" }),
};

type Row = [persona: keyof typeof personas, project: keyof typeof projects, level: AccessLevel];
const projectMatrix: Row[] = [
  // Example A: employees see the public roadmap but not the confidential acquisition
  ["employee", "roadmap", "details"],
  ["employee", "acquisition", "none"],
  ["employee", "team", "details"],
  ["employee", "checkout", "details"],
  ["teammate", "checkout", "summary"], // discoverable summary only
  ["outsider", "team", "none"],
  ["outsider", "checkout", "summary"],
  ["outsider", "acquisition", "none"],
  // Example C: a project lead sees details of the project they lead
  ["projectLead", "checkout", "details"],
  ["projectLead", "team", "none"],
  // Example D: executives get summaries, never details, and nothing restricted
  ["executive", "checkout", "summary"],
  ["executive", "team", "summary"],
  ["executive", "acquisition", "none"],
  ["skipManager", "team", "details"], // head of the owning department
  // Admin configuration power does not imply content access
  ["admin", "team", "none"],
  ["admin", "acquisition", "none"],
  ["admin", "roadmap", "details"],
  // Explicit grants
  ["grantee", "acquisition", "details"],
  // Example E: deactivated membership loses access immediately
  ["removed", "checkout", "none"],
  ["removed", "roadmap", "none"],
  // Tenant isolation: even an OWNER of another org sees nothing
  ["foreign", "roadmap", "none"],
  ["foreign", "checkout", "none"],
];

describe("project access matrix", () => {
  it.each(projectMatrix)("%s → %s = %s", (persona, proj, level) => {
    expect(projectAccess(personas[persona]!, projects[proj]).level).toBe(level);
  });

  it("removing project membership revokes access on the next context build", () => {
    const before = personas.employee!;
    const after: AuthContext = { ...before, projectRoles: new Map() };
    expect(projectAccess(before, projects.checkout).level).toBe("details");
    expect(projectAccess(after, projects.checkout).level).toBe("summary");
    expect(projectAccess({ ...after }, { ...projects.checkout, discoverable: false }).level).toBe("none");
  });
});

describe("project editing and management", () => {
  it("lets contributors edit, but only leads manage", () => {
    expect(canEditProject(personas.employee!, projects.checkout).allow).toBe(true);
    expect(canManageProject(personas.employee!, projects.checkout).allow).toBe(false);
    expect(canManageProject(personas.projectLead!, projects.checkout).allow).toBe(true);
  });

  it("never lets admins or executives edit content because of role alone", () => {
    expect(canEditProject(personas.admin!, projects.checkout).allow).toBe(false);
    expect(canEditProject(personas.executive!, projects.checkout).allow).toBe(false);
  });

  it("lets the owning team lead manage team projects", () => {
    expect(canManageProject(personas.manager!, projects.team).allow).toBe(true);
  });
});

describe("update visibility (Example B)", () => {
  const upd = (over: Partial<UpdateResource>): UpdateResource => ({
    id: "u",
    orgId: ORG,
    authorId: "emp",
    status: "PUBLISHED",
    visibility: "MANAGER",
    projectId: null,
    ...over,
  });
  const levelFor = (ctx: AuthContext, u: UpdateResource): AccessLevel | null => {
    if (!u.projectId) return null;
    const p = Object.values(projects).find((x) => x.id === u.projectId)!;
    return projectAccess(ctx, p).level;
  };
  const check = (persona: keyof typeof personas, u: UpdateResource) =>
    canViewUpdate(personas[persona]!, u, levelFor(personas[persona]!, u)).allow;

  it("keeps drafts and private updates to the author", () => {
    for (const u of [upd({ status: "DRAFT", visibility: "ORG" }), upd({ visibility: "PRIVATE" })]) {
      expect(check("employee", u)).toBe(true);
      expect(check("manager", u)).toBe(false);
      expect(check("skipManager", u)).toBe(false);
      expect(check("executive", u)).toBe(false);
      expect(check("admin", u)).toBe(false);
    }
  });

  it("shares MANAGER updates with the whole management line only", () => {
    const u = upd({ visibility: "MANAGER" });
    expect(check("manager", u)).toBe(true);
    expect(check("skipManager", u)).toBe(true);
    expect(check("teammate", u)).toBe(false);
    expect(check("executive", u)).toBe(false); // seniority alone is not a relationship
  });

  it("shares TEAM updates with teammates and managers", () => {
    const u = upd({ visibility: "TEAM" });
    expect(check("teammate", u)).toBe(true);
    expect(check("manager", u)).toBe(true);
    expect(check("outsider", u)).toBe(false);
  });

  it("shares PROJECT updates with project members including a lead who is not the manager (Example C)", () => {
    const u = upd({ visibility: "PROJECT", projectId: "p-checkout" });
    expect(check("projectLead", u)).toBe(true);
    expect(check("outsider", u)).toBe(false); // summary access is not enough
    expect(check("teammate", u)).toBe(false);
  });

  it("never reveals updates about a project the viewer cannot see in detail, even to managers", () => {
    const u = upd({ visibility: "MANAGER", projectId: "p-acq" });
    expect(check("manager", u)).toBe(false);
    expect(check("employee", u)).toBe(true);
  });

  it("only lets the author edit", () => {
    expect(canEditUpdate(personas.employee!, upd({})).allow).toBe(true);
    expect(canEditUpdate(personas.manager!, upd({})).allow).toBe(false);
  });

  it("rejects cross-tenant access", () => {
    expect(check("foreign", upd({ visibility: "ORG" }))).toBe(false);
  });
});

describe("blockers", () => {
  const blocker = { id: "b", orgId: ORG, reporterId: "emp", ownerId: "platform-lead", projectId: "p-checkout", visibility: "PROJECT" as const };
  const lvl = (ctx: AuthContext) => projectAccess(ctx, projects.checkout).level;

  it("is visible to the reporter's manager, the project lead and the assigned owner", () => {
    expect(canViewBlocker(personas.manager!, blocker, lvl(personas.manager!)).allow).toBe(false); // manager lacks project details
    expect(canViewBlocker(personas.projectLead!, blocker, lvl(personas.projectLead!)).allow).toBe(true);
    const owner = emptyContext({ orgId: ORG, membershipId: "platform-lead" });
    expect(canViewBlocker(owner, blocker, lvl(owner)).allow).toBe(true);
  });

  it("is visible to the manager when the project is visible to them", () => {
    const b = { ...blocker, projectId: "p-roadmap" };
    expect(canViewBlocker(personas.manager!, b, projectAccess(personas.manager!, projects.roadmap).level).allow).toBe(true);
  });

  it("can be managed by the reporter's manager, owner and project lead but not an outsider", () => {
    expect(canManageBlocker(personas.manager!, blocker, projects.checkout).allow).toBe(true);
    expect(canManageBlocker(personas.projectLead!, blocker, projects.checkout).allow).toBe(true);
    expect(canManageBlocker(personas.outsider!, blocker, projects.checkout).allow).toBe(false);
  });
});

describe("people, teams, organization", () => {
  it("limits work summaries to self and the reporting line (Team Pulse)", () => {
    expect(canViewMemberWork(personas.manager!, "emp").allow).toBe(true);
    expect(canViewMemberWork(personas.skipManager!, "emp").allow).toBe(true);
    expect(canViewMemberWork(personas.projectLead!, "emp").allow).toBe(false);
    expect(canViewMemberWork(personas.admin!, "emp").allow).toBe(false);
  });

  it("Example F: when a delegation expires the delegate loses the reporting line", () => {
    const delegate = emptyContext({ orgId: ORG, membershipId: "deputy", managedMemberIds: new Set(["emp"]) });
    expect(canViewMemberWork(delegate, "emp").allow).toBe(true);
    const expired: AuthContext = { ...delegate, managedMemberIds: new Set() };
    expect(canViewMemberWork(expired, "emp").allow).toBe(false);
  });

  it("lets admins, team leads and department heads manage team membership", () => {
    const team = { id: "t-payments", departmentId: "d-eng", orgId: ORG };
    expect(canManageTeamMembership(personas.admin!, team).allow).toBe(true);
    expect(canManageTeamMembership(personas.manager!, team).allow).toBe(true);
    expect(canManageTeamMembership(personas.skipManager!, team).allow).toBe(true);
    expect(canManageTeamMembership(personas.employee!, team).allow).toBe(false);
    expect(canManageTeamMembership(personas.foreign!, team).allow).toBe(false);
  });

  it("restricts organization configuration to admins", () => {
    expect(can(personas.admin!, "org.manageReporting").allow).toBe(true);
    expect(can(personas.executive!, "org.viewAudit").allow).toBe(true); // OWNER
    expect(can(personas.skipManager!, "org.manageMembers").allow).toBe(false); // EXECUTIVE only
    expect(can(personas.employee!, "org.inspectPermissions").allow).toBe(false);
  });

  it("only owners grant or remove the owner role", () => {
    expect(canChangeRole(personas.admin!, "MEMBER", "ADMIN").allow).toBe(true);
    expect(canChangeRole(personas.admin!, "MEMBER", "OWNER").allow).toBe(false);
    expect(canChangeRole(personas.executive!, "ADMIN", "OWNER").allow).toBe(true);
  });

  it("restricts goal visibility and creation", () => {
    const g = { id: "g1", orgId: ORG, kind: "GOAL" as const, visibility: "RESTRICTED" as const, ownerId: "ceo" };
    expect(canViewGoal(personas.executive!, g).allow).toBe(true);
    expect(canViewGoal(personas.skipManager!, g).allow).toBe(false);
    expect(canViewGoal(personas.employee!, { ...g, visibility: "ORG" }).allow).toBe(true);
    expect(canCreateGoal(personas.employee!, "GOAL").allow).toBe(false);
    expect(canCreateGoal(personas.skipManager!, "INITIATIVE").allow).toBe(true);
  });
});

describe("meetings", () => {
  const m = { id: "m", orgId: ORG, organizerId: "mgr", participantIds: ["emp"], visibility: "PARTICIPANTS" as const, teamId: "t-payments" };
  it("shows participant-only meetings to participants", () => {
    expect(canViewMeeting(personas.employee!, m).allow).toBe(true);
    expect(canViewMeeting(personas.teammate!, m).allow).toBe(false);
    expect(canViewMeeting(personas.teammate!, { ...m, visibility: "TEAM" }).allow).toBe(true);
    expect(canViewMeeting(personas.foreign!, { ...m, visibility: "ORG" }).allow).toBe(false);
  });
});

describe("workspaces", () => {
  it("derives workspaces from real relationships", () => {
    expect(authorizedWorkspaces(personas.employee!)).toEqual(["employee"]);
    expect(authorizedWorkspaces(personas.manager!)).toEqual(["employee", "manager", "lead"]);
    expect(authorizedWorkspaces(personas.projectLead!)).toEqual(["employee", "lead"]);
    expect(authorizedWorkspaces(personas.executive!)).toEqual(["employee", "leadership", "admin"]);
    expect(authorizedWorkspaces(personas.admin!)).toEqual(["employee", "admin"]);
  });
});

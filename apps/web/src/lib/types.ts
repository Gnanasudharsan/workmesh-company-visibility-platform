/** Shapes returned by the WorkMesh API (kept intentionally close to the server presenters). */
import type {
  BlockerState,
  Health,
  MilestoneStatus,
  OrgRole,
  Priority,
  ProjectStatus,
  ResourceVisibility,
  Severity,
  UpdateStage,
  UpdateVisibility,
  WorkItemStatus,
  Workspace,
} from "@workmesh/core";

export interface PersonLite {
  id: string;
  name: string;
  title: string;
  avatarHue: number;
  active?: boolean;
}

export interface Me {
  user: { id: string; email: string; name: string };
  organizations: Array<{ id: string; name: string; slug: string; role: OrgRole; isDemo: boolean }>;
  active: null | {
    organization: { id: string; name: string; slug: string; isDemo: boolean };
    membershipId: string;
    role: OrgRole;
    onboardedAt: string | null;
    profile: { displayName: string; title: string; avatarHue: number } | null;
    workspaces: Workspace[];
    relationships: { directReports: number; managed: number; teams: number; ledTeams: number; ledProjects: number; headedDepartments: number };
  };
  csrfToken: string;
  demoMode: boolean;
}

export interface ProjectSummary {
  id: string;
  key: string;
  name: string;
  summary: string | null;
  status: ProjectStatus;
  priority: Priority;
  visibility: ResourceVisibility;
  discoverable: boolean;
  startDate: string | null;
  targetDate: string | null;
  access: "summary" | "details";
  owningTeam: { id: string; name: string } | null;
  lead: PersonLite | null;
  initiative: { id: string; title: string; goalId: string | null } | null;
  health: Health;
  healthReasons: string[];
  computedProgress: number | null;
  progressBasis: "milestones" | "work_items" | "none";
  reportedProgress: number | null;
  reportedAt: string | null;
  milestones?: { total: number; done: number; critical: number; nextDue: { id: string; title: string; dueDate: string } | null };
  workItems?: { total: number; done: number; blocked: number; cancelled: number };
  openBlockers: number;
  myRole: "LEAD" | "CONTRIBUTOR" | "VIEWER" | null;
  canEdit: boolean;
  canManage: boolean;
  version: number;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: MilestoneStatus;
  isCritical: boolean;
  dueDate: string | null;
  completedAt: string | null;
  owner?: PersonLite | null;
  ownerId?: string | null;
  version: number;
}

export interface ProjectDetail extends ProjectSummary {
  description: string | null;
  members: Array<PersonLite & { role: string; addedAt: string }>;
  milestoneList: Milestone[];
}

export interface WorkItem {
  id: string;
  projectId: string;
  milestoneId: string | null;
  title: string;
  description: string | null;
  status: WorkItemStatus;
  priority: Priority;
  assignee: PersonLite | null;
  reviewer?: PersonLite | null;
  dueDate: string | null;
  completedAt: string | null;
  version: number;
  project?: { id: string; name: string; key: string };
  milestone?: { id: string; title: string; dueDate?: string | null } | null;
}

export interface Update {
  id: string;
  status: "DRAFT" | "PUBLISHED";
  visibility: UpdateVisibility;
  stage: UpdateStage;
  currentFocus: string;
  completed: string | null;
  nextSteps: string | null;
  helpNeeded: string | null;
  helpFrom: PersonLite | null;
  confidence: number | null;
  publishedAt: string | null;
  editedAt: string | null;
  createdAt: string;
  version: number;
  author: PersonLite | null;
  project: { id: string; name: string; key: string } | null;
  milestone: { id: string; title: string } | null;
  ackCount: number;
  acknowledgedByMe: boolean;
  commentCount: number;
  isMine: boolean;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: PersonLite | null;
}

export interface Blocker {
  id: string;
  title: string;
  description: string | null;
  severity: Severity;
  state: BlockerState;
  visibility: UpdateVisibility;
  targetDate: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  version: number;
  reporter: PersonLite | null;
  owner: PersonLite | null;
  project: { id: string; name: string; key: string } | null;
  ageDays: number;
  canManage: boolean;
  allowedTransitions: BlockerState[];
}

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
  type: string;
  data?: Record<string, unknown>;
}
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface MeetingSummary {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  recurrence: string;
  status: string;
  visibility: string;
  organizer: PersonLite | null;
  participantCount: number;
  participants: PersonLite[];
  openActionItems: number;
  decisions: number;
}

/* ------------------------------- Ask the Mesh ------------------------------- */

export interface CopilotStatus {
  enabled: true;
  model: string;
  maxQuestionLength: number;
  /** Per authorized workspace, built server-side from records the viewer can open. */
  suggestions: Partial<Record<Workspace, string[]>>;
}

export interface CopilotCitation {
  n: number;
  type: string;
  id: string;
  title: string;
  href: string;
}

export interface CopilotAnswer {
  answer: string;
  citations: CopilotCitation[];
  toolCalls: Array<{ name: string; found: boolean }>;
  latencyMs: number;
  model: string;
}

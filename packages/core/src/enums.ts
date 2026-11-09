/**
 * Shared domain enumerations. String values match the Prisma enums in apps/api/prisma/schema.prisma.
 */

export const ORG_ROLES = ["OWNER", "ADMIN", "EXECUTIVE", "MEMBER"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Visibility classification for goals, initiatives and projects. */
export const RESOURCE_VISIBILITIES = ["ORG", "TEAM", "PROJECT_MEMBERS", "RESTRICTED"] as const;
export type ResourceVisibility = (typeof RESOURCE_VISIBILITIES)[number];

/** Audience for progress updates and blockers. PRIVATE = personal draft, visible only to the author. */
export const UPDATE_VISIBILITIES = ["PRIVATE", "MANAGER", "PROJECT", "TEAM", "ORG"] as const;
export type UpdateVisibility = (typeof UPDATE_VISIBILITIES)[number];

export const PROJECT_STATUSES = [
  "PROPOSED",
  "PLANNED",
  "IN_PROGRESS",
  "IN_REVIEW",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const GOAL_STATUSES = ["DRAFT", "ACTIVE", "ACHIEVED", "MISSED", "ARCHIVED"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const MILESTONE_STATUSES = ["PLANNED", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const WORK_ITEM_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE", "CANCELLED"] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const BLOCKER_STATES = ["OPEN", "ASSIGNED", "INVESTIGATING", "WAITING", "RESOLVED", "REOPENED"] as const;
export type BlockerState = (typeof BLOCKER_STATES)[number];

export const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const UPDATE_STAGES = ["PLANNING", "DEVELOPMENT", "TESTING", "REVIEW", "BLOCKED", "COMPLETED"] as const;
export type UpdateStage = (typeof UPDATE_STAGES)[number];

export const DEPENDENCY_STATES = ["OPEN", "AT_RISK", "BLOCKED", "RESOLVED"] as const;
export type DependencyState = (typeof DEPENDENCY_STATES)[number];

export const PROJECT_ROLES = ["LEAD", "CONTRIBUTOR", "VIEWER"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const GRANT_LEVELS = ["SUMMARY", "DETAILS"] as const;
export type GrantLevel = (typeof GRANT_LEVELS)[number];

export const MEETING_VISIBILITIES = ["PARTICIPANTS", "TEAM", "ORG"] as const;
export type MeetingVisibility = (typeof MEETING_VISIBILITIES)[number];

export const HEALTH_STATES = ["NOT_STARTED", "ON_TRACK", "AT_RISK", "OFF_TRACK", "BLOCKED", "DONE", "CANCELLED"] as const;
export type Health = (typeof HEALTH_STATES)[number];

export const LABELS: Record<string, string> = {
  PROPOSED: "Proposed",
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  DRAFT: "Draft",
  ACTIVE: "Active",
  ACHIEVED: "Achieved",
  MISSED: "Missed",
  ARCHIVED: "Archived",
  DONE: "Done",
  TODO: "To do",
  OPEN: "Open",
  ASSIGNED: "Assigned",
  INVESTIGATING: "Investigating",
  WAITING: "Waiting",
  RESOLVED: "Resolved",
  REOPENED: "Reopened",
  AT_RISK: "At risk",
  NOT_STARTED: "Not started",
  ON_TRACK: "On track",
  OFF_TRACK: "Off track",
  PLANNING: "Planning",
  DEVELOPMENT: "Development",
  TESTING: "Testing",
  REVIEW: "Review",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
  CRITICAL: "Critical",
  ORG: "Organization",
  TEAM: "Team",
  PROJECT_MEMBERS: "Project members",
  PROJECT: "Project members",
  RESTRICTED: "Restricted",
  PRIVATE: "Only me (draft)",
  MANAGER: "My management chain",
  PARTICIPANTS: "Participants",
  OWNER: "Owner",
  ADMIN: "Administrator",
  EXECUTIVE: "Executive",
  MEMBER: "Member",
  LEAD: "Lead",
  CONTRIBUTOR: "Contributor",
  VIEWER: "Viewer",
};

export function label(value: string | null | undefined): string {
  if (!value) return "";
  return LABELS[value] ?? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

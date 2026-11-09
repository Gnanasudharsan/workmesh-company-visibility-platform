/**
 * Explicit state machines. Every status change in the API goes through `assertTransition`,
 * so invalid transitions fail loudly instead of being silently written.
 */
import type { BlockerState, MilestoneStatus, ProjectStatus, WorkItemStatus, GoalStatus } from "./enums";

type Machine<S extends string> = Record<S, readonly S[]>;

export const PROJECT_TRANSITIONS: Machine<ProjectStatus> = {
  PROPOSED: ["PLANNED", "CANCELLED"],
  PLANNED: ["IN_PROGRESS", "PROPOSED", "CANCELLED"],
  IN_PROGRESS: ["IN_REVIEW", "BLOCKED", "COMPLETED", "CANCELLED"],
  IN_REVIEW: ["IN_PROGRESS", "COMPLETED", "BLOCKED"],
  BLOCKED: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: ["IN_PROGRESS"], // reopen
  CANCELLED: ["PROPOSED"], // revive as a new proposal
};

export const MILESTONE_TRANSITIONS: Machine<MilestoneStatus> = {
  PLANNED: ["IN_PROGRESS", "DONE", "CANCELLED"],
  IN_PROGRESS: ["DONE", "PLANNED", "CANCELLED"],
  DONE: ["IN_PROGRESS"],
  CANCELLED: ["PLANNED"],
};

export const WORK_ITEM_TRANSITIONS: Machine<WorkItemStatus> = {
  TODO: ["IN_PROGRESS", "BLOCKED", "CANCELLED", "DONE"],
  IN_PROGRESS: ["IN_REVIEW", "BLOCKED", "DONE", "TODO", "CANCELLED"],
  IN_REVIEW: ["IN_PROGRESS", "DONE", "BLOCKED"],
  BLOCKED: ["TODO", "IN_PROGRESS", "CANCELLED"],
  DONE: ["IN_PROGRESS"],
  CANCELLED: ["TODO"],
};

export const BLOCKER_TRANSITIONS: Machine<BlockerState> = {
  OPEN: ["ASSIGNED", "INVESTIGATING", "WAITING", "RESOLVED"],
  ASSIGNED: ["INVESTIGATING", "WAITING", "RESOLVED", "OPEN"],
  INVESTIGATING: ["WAITING", "RESOLVED", "ASSIGNED"],
  WAITING: ["INVESTIGATING", "RESOLVED", "ASSIGNED"],
  RESOLVED: ["REOPENED"],
  REOPENED: ["ASSIGNED", "INVESTIGATING", "WAITING", "RESOLVED"],
};

export const GOAL_TRANSITIONS: Machine<GoalStatus> = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["ACHIEVED", "MISSED", "ARCHIVED"],
  ACHIEVED: ["ACTIVE", "ARCHIVED"],
  MISSED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: ["DRAFT"],
};

export const MACHINES = {
  project: PROJECT_TRANSITIONS,
  milestone: MILESTONE_TRANSITIONS,
  workItem: WORK_ITEM_TRANSITIONS,
  blocker: BLOCKER_TRANSITIONS,
  goal: GOAL_TRANSITIONS,
} as const;

export type MachineName = keyof typeof MACHINES;

export class InvalidTransitionError extends Error {
  constructor(
    public readonly machine: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Invalid ${machine} transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(machine: MachineName, from: string, to: string): boolean {
  const table = MACHINES[machine] as Record<string, readonly string[]>;
  return from === to || (table[from]?.includes(to) ?? false);
}

export function allowedTransitions(machine: MachineName, from: string): readonly string[] {
  return (MACHINES[machine] as Record<string, readonly string[]>)[from] ?? [];
}

export function assertTransition(machine: MachineName, from: string, to: string): void {
  if (!canTransition(machine, from, to)) throw new InvalidTransitionError(machine, from, to);
}

/** Blocker state implied by owner assignment: assigning an owner to an OPEN/REOPENED blocker moves it to ASSIGNED. */
export function blockerStateAfterAssignment(state: BlockerState): BlockerState {
  return state === "OPEN" || state === "REOPENED" ? "ASSIGNED" : state;
}

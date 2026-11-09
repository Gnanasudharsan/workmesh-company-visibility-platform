/**
 * Project health and progress derivation.
 *
 * WorkMesh never invents progress. Two numbers are kept strictly separate:
 *
 *  1. computedProgress — derived from data:
 *       If the project has milestones: weighted share of non-cancelled milestones that are DONE,
 *       where critical milestones weigh 2 and normal milestones weigh 1.
 *       Otherwise, if it has work items: DONE / (total − CANCELLED).
 *       Otherwise: null ("not enough information").
 *  2. reportedProgress — what the owner explicitly reported, shown with its date and labelled "reported".
 *
 * Health is rule-based and returns the reasons that produced it, so the UI can explain itself.
 * A project with many completed easy tasks but an overdue critical milestone is OFF_TRACK,
 * because milestone state dominates task counts.
 */
import type { Health, MilestoneStatus, ProjectStatus, Severity } from "./enums";

export interface HealthInput {
  status: ProjectStatus;
  startDate?: Date | null;
  targetDate?: Date | null;
  milestones: Array<{ status: MilestoneStatus; dueDate?: Date | null; isCritical: boolean }>;
  workItems: { total: number; done: number; cancelled: number };
  openBlockers: Array<{ severity: Severity }>;
  upstream: { unresolved: number; blocked: number; atRisk: number };
  now: Date;
}

export interface HealthResult {
  health: Health;
  computedProgress: number | null;
  progressBasis: "milestones" | "work_items" | "none";
  reasons: string[];
}

const DAY = 86_400_000;

export function computeProgress(input: Pick<HealthInput, "milestones" | "workItems">): {
  value: number | null;
  basis: HealthResult["progressBasis"];
} {
  const ms = input.milestones.filter((m) => m.status !== "CANCELLED");
  if (ms.length > 0) {
    let total = 0;
    let done = 0;
    for (const m of ms) {
      const w = m.isCritical ? 2 : 1;
      total += w;
      if (m.status === "DONE") done += w;
    }
    return { value: Math.round((done / total) * 100), basis: "milestones" };
  }
  const denom = input.workItems.total - input.workItems.cancelled;
  if (denom > 0) return { value: Math.round((input.workItems.done / denom) * 100), basis: "work_items" };
  return { value: null, basis: "none" };
}

export function computeHealth(input: HealthInput): HealthResult {
  const { value: computedProgress, basis: progressBasis } = computeProgress(input);
  const base = { computedProgress, progressBasis };
  if (input.status === "CANCELLED") return { ...base, health: "CANCELLED", reasons: ["Project was cancelled"] };
  if (input.status === "COMPLETED") return { ...base, health: "DONE", reasons: ["Project is complete"] };

  const now = input.now.getTime();
  const blocked: string[] = [];
  const offTrack: string[] = [];
  const atRisk: string[] = [];

  if (input.status === "BLOCKED") blocked.push("Status is Blocked");
  const critical = input.openBlockers.filter((b) => b.severity === "CRITICAL").length;
  const high = input.openBlockers.filter((b) => b.severity === "HIGH").length;
  if (critical > 0) blocked.push(`${critical} open critical blocker${critical > 1 ? "s" : ""}`);
  if (input.upstream.blocked > 0)
    blocked.push(`Waiting on ${input.upstream.blocked} blocked upstream dependenc${input.upstream.blocked > 1 ? "ies" : "y"}`);

  for (const m of input.milestones) {
    if (m.status === "DONE" || m.status === "CANCELLED" || !m.dueDate) continue;
    const due = m.dueDate.getTime();
    if (due < now) {
      (m.isCritical ? offTrack : atRisk).push(m.isCritical ? "Critical milestone is overdue" : "A milestone is overdue");
    } else if (m.isCritical && m.status === "PLANNED" && due - now < 14 * DAY) {
      atRisk.push("Critical milestone due within 14 days has not started");
    }
  }
  if (input.targetDate && input.targetDate.getTime() < now) offTrack.push("Target date has passed");
  if (high > 0) atRisk.push(`${high} open high-severity blocker${high > 1 ? "s" : ""}`);
  if (input.upstream.atRisk > 0) atRisk.push("An upstream dependency is at risk");

  // Schedule pressure: elapsed share of the timeline far ahead of computed progress.
  if (input.startDate && input.targetDate && computedProgress !== null) {
    const span = input.targetDate.getTime() - input.startDate.getTime();
    if (span > 0) {
      const elapsed = Math.min(1, Math.max(0, (now - input.startDate.getTime()) / span));
      if (elapsed * 100 - computedProgress > 35) atRisk.push("Progress is well behind the elapsed schedule");
    }
  }

  const dedupe = (xs: string[]) => [...new Set(xs)];
  if (blocked.length) return { ...base, health: "BLOCKED", reasons: dedupe([...blocked, ...offTrack, ...atRisk]) };
  if (offTrack.length) return { ...base, health: "OFF_TRACK", reasons: dedupe([...offTrack, ...atRisk]) };
  if (atRisk.length) return { ...base, health: "AT_RISK", reasons: dedupe(atRisk) };
  if (input.status === "PROPOSED" || input.status === "PLANNED")
    return { ...base, health: "NOT_STARTED", reasons: ["Work has not started"] };
  return { ...base, health: "ON_TRACK", reasons: ["No overdue milestones or open serious blockers"] };
}

/** Neutral freshness wording. Never implies anything about the person's productivity. */
export type Freshness = "TODAY" | "THIS_WEEK" | "EARLIER" | "NONE";

export function updateFreshness(lastUpdateAt: Date | null | undefined, now: Date): Freshness {
  if (!lastUpdateAt) return "NONE";
  const age = now.getTime() - lastUpdateAt.getTime();
  if (age < DAY && sameDay(lastUpdateAt, now)) return "TODAY";
  if (age < 7 * DAY) return "THIS_WEEK";
  return "EARLIER";
}

function sameDay(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  TODAY: "Updated today",
  THIS_WEEK: "Updated this week",
  EARLIER: "No recent update",
  NONE: "No current update",
};

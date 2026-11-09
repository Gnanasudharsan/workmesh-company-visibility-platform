import { describe, expect, it } from "vitest";
import { computeHealth, computeProgress, updateFreshness, type HealthInput } from "./health";

const now = new Date("2026-06-15T12:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);
const base: HealthInput = {
  status: "IN_PROGRESS",
  startDate: days(-30),
  targetDate: days(30),
  milestones: [],
  workItems: { total: 0, done: 0, cancelled: 0 },
  openBlockers: [],
  upstream: { unresolved: 0, blocked: 0, atRisk: 0 },
  now,
};

describe("computeProgress", () => {
  it("weights critical milestones double", () => {
    const r = computeProgress({
      milestones: [
        { status: "DONE", isCritical: false },
        { status: "PLANNED", isCritical: true },
        { status: "CANCELLED", isCritical: true },
      ],
      workItems: { total: 0, done: 0, cancelled: 0 },
    });
    expect(r).toEqual({ value: 33, basis: "milestones" }); // 1 / (1 + 2)
  });

  it("falls back to work items and then to null", () => {
    expect(computeProgress({ milestones: [], workItems: { total: 10, done: 4, cancelled: 2 } })).toEqual({
      value: 50,
      basis: "work_items",
    });
    expect(computeProgress({ milestones: [], workItems: { total: 0, done: 0, cancelled: 0 } })).toEqual({
      value: null,
      basis: "none",
    });
  });
});

describe("computeHealth", () => {
  it("does not call a project healthy because of many easy tasks when a critical milestone is overdue", () => {
    const r = computeHealth({
      ...base,
      milestones: [
        { status: "DONE", isCritical: false, dueDate: days(-20) },
        { status: "DONE", isCritical: false, dueDate: days(-10) },
        { status: "IN_PROGRESS", isCritical: true, dueDate: days(-1) },
      ],
      workItems: { total: 40, done: 39, cancelled: 0 },
    });
    expect(r.health).toBe("OFF_TRACK");
    expect(r.reasons).toContain("Critical milestone is overdue");
  });

  it("is BLOCKED for status, critical blockers or blocked upstream dependencies", () => {
    expect(computeHealth({ ...base, status: "BLOCKED" }).health).toBe("BLOCKED");
    expect(computeHealth({ ...base, openBlockers: [{ severity: "CRITICAL" }] }).health).toBe("BLOCKED");
    expect(computeHealth({ ...base, upstream: { unresolved: 1, blocked: 1, atRisk: 0 } }).health).toBe("BLOCKED");
  });

  it("is AT_RISK for high blockers, overdue normal milestones or schedule pressure", () => {
    expect(computeHealth({ ...base, openBlockers: [{ severity: "HIGH" }] }).health).toBe("AT_RISK");
    expect(
      computeHealth({ ...base, milestones: [{ status: "PLANNED", isCritical: false, dueDate: days(-2) }] }).health,
    ).toBe("AT_RISK");
    expect(
      computeHealth({
        ...base,
        startDate: days(-90),
        targetDate: days(10),
        milestones: [
          { status: "PLANNED", isCritical: false, dueDate: days(5) },
          { status: "PLANNED", isCritical: false, dueDate: days(9) },
        ],
      }).reasons,
    ).toContain("Progress is well behind the elapsed schedule");
  });

  it("is ON_TRACK, NOT_STARTED, DONE or CANCELLED in the simple cases", () => {
    expect(computeHealth(base).health).toBe("ON_TRACK");
    expect(computeHealth({ ...base, status: "PLANNED" }).health).toBe("NOT_STARTED");
    expect(computeHealth({ ...base, status: "COMPLETED" }).health).toBe("DONE");
    expect(computeHealth({ ...base, status: "CANCELLED" }).health).toBe("CANCELLED");
  });

  it("is OFF_TRACK when the target date has passed", () => {
    expect(computeHealth({ ...base, targetDate: days(-1) }).health).toBe("OFF_TRACK");
  });
});

describe("updateFreshness", () => {
  it("uses neutral buckets", () => {
    expect(updateFreshness(null, now)).toBe("NONE");
    expect(updateFreshness(new Date("2026-06-15T08:00:00Z"), now)).toBe("TODAY");
    expect(updateFreshness(days(-3), now)).toBe("THIS_WEEK");
    expect(updateFreshness(days(-12), now)).toBe("EARLIER");
  });
});

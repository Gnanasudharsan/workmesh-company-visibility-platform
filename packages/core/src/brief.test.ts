import { describe, expect, it } from "vitest";
import { buildBrief, type BriefInput } from "./brief";

const now = new Date("2026-06-15T12:00:00Z");
const since = new Date("2026-06-08T12:00:00Z");
const d = (iso: string) => new Date(iso);

const input: BriefInput = {
  since,
  now,
  horizonDays: 14,
  projects: [
    { id: "p1", name: "Checkout" },
    { id: "p2", name: "Gateway" },
  ],
  changes: [
    { entityType: "WORK_ITEM", entityId: "w1", projectId: "p1", field: "status", from: "IN_PROGRESS", to: "DONE", at: d("2026-06-10T00:00:00Z"), title: "Cart API" },
    { entityType: "WORK_ITEM", entityId: "w2", projectId: "p1", field: "status", from: "TODO", to: "DONE", at: d("2026-06-01T00:00:00Z"), title: "Old item" },
    { entityType: "PROJECT", entityId: "p2", projectId: "p2", field: "status", from: "IN_PROGRESS", to: "BLOCKED", at: d("2026-06-12T00:00:00Z"), title: "Gateway" },
  ],
  milestones: [
    { id: "m1", projectId: "p1", title: "Beta", status: "DONE", dueDate: d("2026-06-11T00:00:00Z"), completedAt: d("2026-06-11T00:00:00Z"), isCritical: true },
    { id: "m2", projectId: "p2", title: "Sandbox", status: "IN_PROGRESS", dueDate: d("2026-06-20T00:00:00Z"), completedAt: null, isCritical: false },
    { id: "m3", projectId: "p2", title: "Far away", status: "PLANNED", dueDate: d("2026-09-01T00:00:00Z"), completedAt: null, isCritical: false },
  ],
  blockers: [
    { id: "b1", projectId: "p2", title: "No sandbox creds", state: "OPEN", severity: "HIGH", createdAt: d("2026-06-12T00:00:00Z"), resolvedAt: null, ownerName: null },
    { id: "b2", projectId: "p1", title: "Legacy issue", state: "WAITING", severity: "LOW", createdAt: d("2026-05-01T00:00:00Z"), resolvedAt: null, ownerName: "Ana" },
    { id: "b3", projectId: "p1", title: "Fixed", state: "RESOLVED", severity: "MEDIUM", createdAt: d("2026-05-01T00:00:00Z"), resolvedAt: d("2026-06-09T00:00:00Z"), ownerName: "Ana" },
  ],
  updates: [
    { id: "u1", projectId: "p1", authorName: "Ana", publishedAt: d("2026-06-13T00:00:00Z"), completed: "Cart", helpNeeded: "Need design review" },
  ],
  decisions: [
    { id: "d1", projectId: "p1", title: "Choose PSP", status: "PENDING", createdAt: d("2026-06-01T00:00:00Z") },
    { id: "d2", projectId: "p1", title: "Done", status: "DECIDED", createdAt: d("2026-06-01T00:00:00Z") },
  ],
  actionItems: [
    { id: "a1", projectId: "p1", title: "Email vendor", status: "OPEN", ownerName: "Ben", dueDate: d("2026-06-18T00:00:00Z") },
    { id: "a2", projectId: "p1", title: "Closed", status: "DONE", ownerName: "Ben", dueDate: null },
  ],
  expectedReporters: [
    { id: "mem1", name: "Ana", lastPublishedAt: d("2026-06-13T00:00:00Z") },
    { id: "mem2", name: "Ben", lastPublishedAt: d("2026-05-20T00:00:00Z") },
  ],
};

describe("buildBrief", () => {
  const brief = Object.fromEntries(buildBrief(input).map((s) => [s.key, s.items]));

  it("only includes changes inside the comparison window", () => {
    expect(brief.workCompleted!.map((i) => i.ref.id)).toEqual(["w1"]);
    expect(brief.milestonesReached!.map((i) => i.ref.id)).toEqual(["m1"]);
    expect(brief.statusChanges![0]!.title).toBe("Gateway: IN_PROGRESS → BLOCKED");
  });

  it("separates new, unresolved and resolved blockers", () => {
    expect(brief.newBlockers!.map((i) => i.ref.id)).toEqual(["b1"]);
    expect(brief.unresolvedBlockers!.map((i) => i.ref.id)).toEqual(["b2"]);
    expect(brief.resolvedBlockers!.map((i) => i.ref.id)).toEqual(["b3"]);
    expect(brief.newBlockers![0]!.detail).toContain("No owner yet");
  });

  it("lists deadlines inside the horizon only", () => {
    expect(brief.upcomingDeadlines!.map((i) => i.ref.id)).toEqual(["m2"]);
  });

  it("collects pending decisions, help requests and open action items", () => {
    expect(brief.decisionsRequired!.map((i) => i.ref.id)).toEqual(["d1"]);
    expect(brief.helpRequests![0]!.title).toBe("Need design review");
    expect(brief.pendingActionItems!.map((i) => i.ref.id)).toEqual(["a1"]);
  });

  it("flags missing information neutrally", () => {
    const titles = brief.missingInformation!.map((i) => i.title);
    expect(titles).toContain("No progress update on Gateway in this period");
    expect(titles).toContain("Ben has not shared an update in this period");
    expect(titles.some((t) => t.includes("Checkout"))).toBe(false);
  });

  it("links every item to a source record", () => {
    for (const items of Object.values(brief)) for (const item of items!) expect(item.ref.id).toBeTruthy();
  });
});

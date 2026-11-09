import { describe, expect, it } from "vitest";
import {
  allowedTransitions,
  assertTransition,
  blockerStateAfterAssignment,
  canTransition,
  InvalidTransitionError,
  MACHINES,
} from "./transitions";

describe("state machines", () => {
  it("allows valid project transitions", () => {
    expect(canTransition("project", "PLANNED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("project", "IN_PROGRESS", "BLOCKED")).toBe(true);
    expect(canTransition("project", "BLOCKED", "IN_PROGRESS")).toBe(true);
  });

  it("rejects invalid project transitions", () => {
    expect(canTransition("project", "PROPOSED", "COMPLETED")).toBe(false);
    expect(canTransition("project", "CANCELLED", "IN_PROGRESS")).toBe(false);
    expect(() => assertTransition("project", "PROPOSED", "COMPLETED")).toThrow(InvalidTransitionError);
  });

  it("treats a no-op as valid", () => {
    expect(canTransition("blocker", "OPEN", "OPEN")).toBe(true);
  });

  it("only lets a resolved blocker be reopened", () => {
    expect(allowedTransitions("blocker", "RESOLVED")).toEqual(["REOPENED"]);
    expect(canTransition("blocker", "RESOLVED", "OPEN")).toBe(false);
  });

  it("moves an open blocker to ASSIGNED on owner assignment", () => {
    expect(blockerStateAfterAssignment("OPEN")).toBe("ASSIGNED");
    expect(blockerStateAfterAssignment("REOPENED")).toBe("ASSIGNED");
    expect(blockerStateAfterAssignment("INVESTIGATING")).toBe("INVESTIGATING");
  });

  it("every machine only references its own states and every state is reachable", () => {
    for (const [name, table] of Object.entries(MACHINES)) {
      const states = new Set(Object.keys(table));
      const reached = new Set<string>();
      for (const targets of Object.values(table) as string[][]) {
        for (const t of targets) {
          expect(states.has(t), `${name}: unknown state ${t}`).toBe(true);
          reached.add(t);
        }
      }
      // every state except the initial one must have an incoming edge
      const initial = Object.keys(table)[0]!;
      for (const s of states) if (s !== initial) expect(reached.has(s), `${name}: ${s} unreachable`).toBe(true);
    }
  });
});

import { describe, expect, it } from "vitest";
import { dedupeKey } from "./notifications";

describe("dedupeKey", () => {
  const at = new Date("2026-06-15T12:10:00Z");

  it("is stable for the same event (retries cannot duplicate)", () => {
    const a = dedupeKey({ type: "BLOCKER_ASSIGNED", entityId: "b1", eventId: "evt1", at });
    const b = dedupeKey({ type: "BLOCKER_ASSIGNED", entityId: "b1", eventId: "evt1", at: new Date() });
    expect(a).toBe(b);
  });

  it("distinguishes different events for non-bucketed types", () => {
    expect(dedupeKey({ type: "BLOCKER_ASSIGNED", entityId: "b1", eventId: "evt1", at })).not.toBe(
      dedupeKey({ type: "BLOCKER_ASSIGNED", entityId: "b1", eventId: "evt2", at }),
    );
  });

  it("collapses bursts of bucketed types inside the window", () => {
    const k1 = dedupeKey({ type: "BLOCKER_CHANGED", entityId: "b1", eventId: "e1", at: new Date("2026-06-15T12:01:00Z") });
    const k2 = dedupeKey({ type: "BLOCKER_CHANGED", entityId: "b1", eventId: "e2", at: new Date("2026-06-15T12:59:00Z") });
    const k3 = dedupeKey({ type: "BLOCKER_CHANGED", entityId: "b1", eventId: "e3", at: new Date("2026-06-15T13:01:00Z") });
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
  });
});

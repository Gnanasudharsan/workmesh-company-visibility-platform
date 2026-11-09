import { describe, expect, it } from "vitest";
import {
  analyzeImpact,
  dependencyWouldCreateCycle,
  downstreamReach,
  topologicalOrder,
  upstreamReach,
  type DependencyEdge,
} from "./dependencies";

// creds → gateway → checkout → launch ; analytics → launch
const e = (id: string, up: string, down: string, state: DependencyEdge["state"] = "OPEN", isCritical = false): DependencyEdge => ({
  id,
  upstreamId: up,
  downstreamId: down,
  state,
  isCritical,
});
const edges = [
  e("1", "creds", "gateway", "OPEN", true),
  e("2", "gateway", "checkout", "OPEN", true),
  e("3", "checkout", "launch"),
  e("4", "analytics", "launch"),
];

describe("dependency traversal", () => {
  it("computes downstream reach with distance and path", () => {
    const r = downstreamReach(edges, "creds");
    expect([...r.keys()].sort()).toEqual(["checkout", "gateway", "launch"]);
    expect(r.get("launch")).toEqual({ distance: 3, path: ["creds", "gateway", "checkout", "launch"], viaCritical: true });
  });

  it("computes upstream reach", () => {
    expect([...upstreamReach(edges, "launch").entries()].sort()).toEqual([
      ["analytics", 1],
      ["checkout", 1],
      ["creds", 3],
      ["gateway", 2],
    ]);
  });

  it("ignores resolved edges when asked", () => {
    const withResolved = [...edges.slice(1), e("1", "creds", "gateway", "RESOLVED")];
    expect(downstreamReach(withResolved, "creds", { unresolvedOnly: true }).size).toBe(0);
  });

  it("prevents cycles", () => {
    expect(dependencyWouldCreateCycle(edges, "launch", "creds")).toBe(true);
    expect(dependencyWouldCreateCycle(edges, "gateway", "gateway")).toBe(true);
    expect(dependencyWouldCreateCycle(edges, "analytics", "checkout")).toBe(false);
  });

  it("orders topologically or reports a cycle", () => {
    const order = topologicalOrder(["creds", "gateway", "checkout", "launch", "analytics"], edges)!;
    expect(order.indexOf("creds")).toBeLessThan(order.indexOf("gateway"));
    expect(order.indexOf("checkout")).toBeLessThan(order.indexOf("launch"));
    expect(topologicalOrder(["a", "b"], [e("x", "a", "b"), e("y", "b", "a")])).toBeNull();
  });
});

describe("impact analysis", () => {
  it("separates confirmed blockers from potential downstream impact", () => {
    const result = analyzeImpact({
      projects: [
        { id: "creds", status: "BLOCKED", hasBlockingBlocker: false },
        { id: "gateway", status: "IN_PROGRESS", hasBlockingBlocker: false },
        { id: "checkout", status: "IN_PROGRESS", hasBlockingBlocker: false },
        { id: "launch", status: "PLANNED", hasBlockingBlocker: false },
        { id: "analytics", status: "IN_PROGRESS", hasBlockingBlocker: false },
      ],
      edges,
    });
    expect([...result.confirmed.keys()]).toEqual(["creds"]);
    expect([...result.potential.keys()].sort()).toEqual(["checkout", "gateway", "launch"]);
    expect(result.potential.get("gateway")!.viaCritical).toBe(true);
    expect(result.potential.has("analytics")).toBe(false);
  });

  it("treats a BLOCKED dependency edge as a confirmed problem for its downstream", () => {
    const r = analyzeImpact({
      projects: [],
      edges: [e("1", "creds", "gateway", "BLOCKED"), e("2", "gateway", "checkout")],
    });
    expect(r.confirmed.get("gateway")).toEqual(["Waiting on a blocked dependency"]);
    expect(r.potential.get("checkout")!.sources).toEqual(["gateway"]);
  });

  it("returns nothing when no project has a confirmed problem", () => {
    const r = analyzeImpact({ projects: [{ id: "creds", status: "IN_PROGRESS", hasBlockingBlocker: false }], edges });
    expect(r.confirmed.size).toBe(0);
    expect(r.potential.size).toBe(0);
  });
});

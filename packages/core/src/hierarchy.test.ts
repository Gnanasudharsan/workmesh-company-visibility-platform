import { describe, expect, it } from "vitest";
import {
  buildIndex,
  directReports,
  findCycle,
  isInManagementLine,
  managementChain,
  reportingSubtree,
  validateReportingChange,
  wouldCreateCycle,
  type ReportingEdge,
} from "./hierarchy";

// ceo ← cto ← em ← (dev1, dev2) ; ceo ← cpo ← pm ; dev2 has dotted line to pm
const edges: ReportingEdge[] = [
  { reportId: "cto", managerId: "ceo", type: "PRIMARY" },
  { reportId: "cpo", managerId: "ceo", type: "PRIMARY" },
  { reportId: "em", managerId: "cto", type: "PRIMARY" },
  { reportId: "dev1", managerId: "em", type: "PRIMARY" },
  { reportId: "dev2", managerId: "em", type: "PRIMARY" },
  { reportId: "pm", managerId: "cpo", type: "PRIMARY" },
  { reportId: "dev2", managerId: "pm", type: "DOTTED" },
];
const idx = buildIndex(edges);

describe("hierarchy traversal", () => {
  it("finds direct reports", () => {
    expect(directReports(idx, "em").sort()).toEqual(["dev1", "dev2"]);
    expect(directReports(idx, "dev1")).toEqual([]);
  });

  it("computes the full reporting subtree with depths", () => {
    const sub = reportingSubtree(idx, "ceo");
    expect([...sub.keys()].sort()).toEqual(["cpo", "cto", "dev1", "dev2", "em", "pm"]);
    expect(sub.get("cto")).toBe(1);
    expect(sub.get("dev1")).toBe(3);
  });

  it("includes dotted-line reports unless primaryOnly", () => {
    expect(reportingSubtree(idx, "pm").has("dev2")).toBe(true);
    expect(reportingSubtree(idx, "pm", { primaryOnly: true }).has("dev2")).toBe(false);
  });

  it("respects maxDepth", () => {
    expect([...reportingSubtree(idx, "ceo", { maxDepth: 1 }).keys()].sort()).toEqual(["cpo", "cto"]);
  });

  it("walks the primary management chain to the root", () => {
    expect(managementChain(idx, "dev2")).toEqual(["em", "cto", "ceo"]);
    expect(managementChain(idx, "ceo")).toEqual([]);
  });

  it("answers management-line membership", () => {
    expect(isInManagementLine(idx, "cto", "dev1")).toBe(true);
    expect(isInManagementLine(idx, "cpo", "dev2")).toBe(true); // via dotted line through pm
    expect(isInManagementLine(idx, "dev1", "dev2")).toBe(false);
    expect(isInManagementLine(idx, "em", "em")).toBe(false);
  });

  it("terminates on corrupted cyclic data", () => {
    const bad = buildIndex([
      { reportId: "a", managerId: "b", type: "PRIMARY" },
      { reportId: "b", managerId: "a", type: "PRIMARY" },
    ]);
    expect(managementChain(bad, "a")).toEqual(["b"]);
    expect([...reportingSubtree(bad, "a").keys()]).toEqual(["b"]);
  });
});

describe("cycle detection", () => {
  it("rejects self-management", () => {
    expect(wouldCreateCycle(idx, "em", "em")).toBe(true);
  });

  it("rejects making a manager report to someone in their own subtree", () => {
    expect(wouldCreateCycle(idx, "cto", "dev1")).toBe(true);
    expect(wouldCreateCycle(idx, "ceo", "pm")).toBe(true);
  });

  it("allows valid lateral moves", () => {
    expect(wouldCreateCycle(idx, "dev1", "pm")).toBe(false);
  });

  it("finds a cycle in raw edges", () => {
    const cycle = findCycle([
      { reportId: "a", managerId: "b", type: "PRIMARY" },
      { reportId: "b", managerId: "c", type: "PRIMARY" },
      { reportId: "c", managerId: "a", type: "PRIMARY" },
    ]);
    expect(cycle).not.toBeNull();
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
    expect(findCycle(edges)).toBeNull();
  });

  it("handles deep hierarchies without recursion limits", () => {
    const chain: ReportingEdge[] = Array.from({ length: 20_000 }, (_, i) => ({
      reportId: `p${i + 1}`,
      managerId: `p${i}`,
      type: "PRIMARY",
    }));
    expect(findCycle(chain)).toBeNull();
    expect(reportingSubtree(buildIndex(chain), "p0").size).toBe(20_000);
  });
});

describe("validateReportingChange", () => {
  const person = (id: string, orgId = "org1", active = true) => ({ id, orgId, active });
  const base = { orgId: "org1", existing: edges, replacePrimary: false, type: "PRIMARY" as const };

  it("rejects unknown, cross-tenant and inactive people", () => {
    expect(validateReportingChange({ ...base, report: undefined, manager: person("em") })).toBe("UNKNOWN_PERSON");
    expect(validateReportingChange({ ...base, report: person("new"), manager: person("x", "org2") })).toBe("CROSS_TENANT");
    expect(validateReportingChange({ ...base, report: person("new"), manager: person("em", "org1", false) })).toBe(
      "INACTIVE_PERSON",
    );
  });

  it("rejects self management, duplicate primaries and cycles", () => {
    expect(validateReportingChange({ ...base, report: person("em"), manager: person("em") })).toBe("SELF_MANAGEMENT");
    expect(validateReportingChange({ ...base, report: person("dev1"), manager: person("pm") })).toBe("DUPLICATE_PRIMARY");
    expect(
      validateReportingChange({ ...base, replacePrimary: true, report: person("cto"), manager: person("dev1") }),
    ).toBe("CYCLE");
  });

  it("accepts a reorg that replaces the primary manager", () => {
    expect(validateReportingChange({ ...base, replacePrimary: true, report: person("dev1"), manager: person("pm") })).toBeNull();
  });

  it("accepts an additional dotted line", () => {
    expect(validateReportingChange({ ...base, type: "DOTTED", report: person("dev1"), manager: person("pm") })).toBeNull();
  });
});

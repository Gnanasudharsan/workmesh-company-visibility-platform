import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Graph } from "@/lib/types";
import { layout } from "./layout";
import { MapList } from "./map-list";

const graph: Graph = {
  nodes: [
    { id: "company:o", type: "company", label: "Northstar Labs", data: { memberCount: 3, departmentCount: 1 } },
    { id: "department:d", type: "department", label: "Engineering", data: { entityId: "d" } },
    { id: "team:t", type: "team", label: "Payments", data: { entityId: "t", memberCount: 2, expanded: true } },
    { id: "person:a", type: "person", label: "Daniel Okafor", data: { entityId: "a", title: "Engineering Manager", avatarHue: 10 } },
    { id: "person:b", type: "person", label: "Maya Chen", data: { entityId: "b", title: "Intern", avatarHue: 20 } },
  ],
  edges: [
    { id: "1", source: "company:o", target: "department:d", type: "contains" },
    { id: "2", source: "department:d", target: "team:t", type: "contains" },
    { id: "3", source: "team:t", target: "person:a", type: "leads" },
    { id: "4", source: "team:t", target: "person:b", type: "belongs_to" },
    { id: "5", source: "person:a", target: "person:b", type: "reports_to" },
  ],
};

describe("Company Map text alternative", () => {
  it("renders the authorized graph as an accessible tree", () => {
    render(<MapList graph={graph} mode="people" />);
    const tree = screen.getByRole("tree", { name: "Organization hierarchy" });
    expect(within(tree).getByText("Northstar Labs")).toBeInTheDocument();
    expect(within(tree).getByRole("link", { name: /Maya Chen/ })).toHaveAttribute("href", "/people/b");
    expect(within(tree).getAllByRole("treeitem").length).toBe(5);
  });
});

describe("ELK layout", () => {
  it("places parents above children in top-down mode", async () => {
    const nodes = graph.nodes.map((n) => ({ id: n.id, type: n.type, position: { x: 0, y: 0 }, data: {} }));
    const edges = graph.edges.filter((e) => e.type !== "reports_to").map((e) => ({ id: e.id, source: e.source, target: e.target }));
    const out = await layout(nodes, edges, "down");
    const y = (id: string) => out.find((n) => n.id === id)!.position.y;
    expect(y("company:o")).toBeLessThan(y("department:d"));
    expect(y("department:d")).toBeLessThan(y("team:t"));
    expect(y("team:t")).toBeLessThan(y("person:b"));
  });
});

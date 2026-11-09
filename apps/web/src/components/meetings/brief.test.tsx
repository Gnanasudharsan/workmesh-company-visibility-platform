import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BriefView, type Brief } from "./brief";

const brief: Brief = {
  meetingId: "m",
  since: "2026-11-01T00:00:00.000Z",
  generatedAt: new Date().toISOString(),
  projects: [{ id: "p", name: "Checkout" }],
  sections: [
    { key: "newBlockers", title: "New blockers", items: [{ title: "No sandbox credentials", severity: "HIGH", ref: { type: "blocker", id: "b1" }, projectId: "p" }] },
    { key: "decisionsRequired", title: "Decisions required", items: [{ title: "Confirm launch date", ref: { type: "decision", id: "d1" } }] },
    { key: "workCompleted", title: "Work completed", items: [{ title: "Cart API", ref: { type: "workItem", id: "w1" }, projectId: "p" }] },
    { key: "missingInformation", title: "Missing information", items: [] },
  ],
};

describe("meeting brief", () => {
  it("links every generated claim to its source record", () => {
    render(<BriefView brief={brief} since="2026-11-01" onSince={() => {}} />);
    expect(screen.getByRole("link", { name: /No sandbox credentials/ })).toHaveAttribute("href", "/blockers/b1");
    expect(screen.getByRole("link", { name: /Cart API/ })).toHaveAttribute("href", "/projects/p?tab=work&item=w1");
    expect(screen.getByText(/2 items need discussion/)).toBeInTheDocument();
    expect(screen.getByText("Nothing in this period.")).toBeInTheDocument();
  });

  it("can add a discussion item to the agenda", () => {
    const add = vi.fn();
    render(<BriefView brief={brief} since="2026-11-01" onSince={() => {}} onAddAgenda={add} />);
    screen.getAllByRole("button", { name: "+ Agenda" })[0]!.click();
    expect(add).toHaveBeenCalledWith("No sandbox credentials");
  });
});

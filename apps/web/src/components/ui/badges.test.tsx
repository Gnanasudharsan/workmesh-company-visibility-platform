import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AccessBadge, FreshnessBadge, HealthBadge, StatusBadge } from "./badges";

describe("status indicators", () => {
  it("never rely on color alone: status carries readable text", () => {
    render(<StatusBadge status="BLOCKED" />);
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });

  it("explains health with the server's reasons", () => {
    render(<HealthBadge health="OFF_TRACK" reasons={["Critical milestone is overdue"]} />);
    expect(screen.getByText("Off track")).toHaveAttribute("title", "Why: Critical milestone is overdue");
  });

  it("uses neutral freshness language", () => {
    render(<FreshnessBadge freshness="EARLIER" />);
    expect(screen.getByText("No recent update")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/inactive|unproductive|idle/i);
  });

  it("marks summary-only projects", () => {
    const { rerender } = render(<AccessBadge access="summary" />);
    expect(screen.getByText("Summary view")).toBeInTheDocument();
    rerender(<AccessBadge access="details" />);
    expect(screen.queryByText("Summary view")).not.toBeInTheDocument();
  });
});

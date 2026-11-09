import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useUi } from "@/lib/store";
import { GettingStarted } from "./getting-started";

describe("GettingStarted guide", () => {
  beforeEach(() => useUi.setState({ tour: {} }));

  it("marks steps done from real signals and links to working destinations", () => {
    useUi.setState({ tour: { map: true } });
    render(<GettingStarted hasUpdate />);
    expect(screen.getByText("2 of 4 done · takes about three minutes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Follow work to a company goal/ })).toHaveAttribute("href", "/map?mode=work");
  });

  it("disappears when dismissed or complete", () => {
    const { rerender } = render(<GettingStarted hasUpdate={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss getting started guide" }));
    rerender(<GettingStarted hasUpdate={false} />);
    expect(screen.queryByText("Getting started with WorkMesh")).not.toBeInTheDocument();

    useUi.setState({ tour: { map: true, work: true, search: true } });
    rerender(<GettingStarted hasUpdate />);
    expect(screen.queryByText("Getting started with WorkMesh")).not.toBeInTheDocument();
  });
});

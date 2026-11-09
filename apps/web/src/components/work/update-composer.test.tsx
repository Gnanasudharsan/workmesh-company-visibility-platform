import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useUi } from "@/lib/store";
import { mockFetch, renderWithData } from "@/test/render";
import { UpdateComposer } from "./update-composer";

const projects = [{ id: "p1", name: "Payment Gateway Integration", key: "PGW", access: "details", canEdit: true }];

describe("progress update composer", () => {
  beforeEach(() => useUi.setState({ composer: { open: true } }));

  it("requires a focus before publishing", async () => {
    const calls = mockFetch();
    renderWithData(<UpdateComposer />, { "/projects": projects, "/people": [] });
    fireEvent.click(screen.getByRole("button", { name: "Publish update" }));
    expect(await screen.findByText(/Tell your team what you're focused on/)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("publishes a quick update with a linked blocker in one request", async () => {
    const calls = mockFetch({ "/updates": { update: { id: "u1" }, blocker: { id: "b1" } } });
    renderWithData(<UpdateComposer />, { "/projects": projects, "/people": [] });
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Project"), "p1");
    await user.type(screen.getByLabelText(/What are you working on/), "Webhook tests");
    await user.click(screen.getByRole("button", { name: /I'm blocked on something/ }));
    await user.type(screen.getByLabelText("What's blocking you?"), "No sandbox credentials");
    await user.click(screen.getByRole("button", { name: "Publish update" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/updates")).toBe(true));
    const body = calls.find((c) => c.url === "/updates")!.body as Record<string, unknown>;
    expect(body).toMatchObject({ projectId: "p1", currentFocus: "Webhook tests", stage: "BLOCKED", publish: true, blocker: { title: "No sandbox credentials", severity: "MEDIUM" } });
  });

  it("keeps private updates as drafts", async () => {
    mockFetch();
    renderWithData(<UpdateComposer />, { "/projects": projects, "/people": [] });
    await userEvent.setup().selectOptions(screen.getByLabelText("Who can see this"), "PRIVATE");
    expect(screen.getByRole("button", { name: "Publish update" })).toBeDisabled();
    expect(screen.getByText(/Only you\./)).toBeInTheDocument();
  });
});

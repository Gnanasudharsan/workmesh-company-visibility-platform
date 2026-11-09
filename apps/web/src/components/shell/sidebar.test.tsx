import { screen } from "@testing-library/react";
import type { Workspace } from "@workmesh/core";
import { describe, expect, it } from "vitest";
import { renderWithData } from "@/test/render";
import { SidebarContent } from "./sidebar";

const me = (workspaces: Workspace[]) => ({
  user: { id: "u", email: "x@example.com", name: "X" },
  organizations: [{ id: "o", name: "Northstar Labs", slug: "n", role: "MEMBER", isDemo: true }],
  active: { organization: { id: "o", name: "Northstar Labs", slug: "n", isDemo: true }, membershipId: "m", role: "MEMBER", onboardedAt: null, profile: null, workspaces, relationships: {} },
  csrfToken: "c",
  demoMode: true,
});

describe("permission-adaptive navigation", () => {
  it("shows an employee only employee and company navigation", () => {
    renderWithData(<SidebarContent />, { "/auth/me": me(["employee"]), "/notifications?unread=true": { unreadCount: 3, items: [] } });
    expect(screen.getByRole("link", { name: /Home/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Company Map/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Team Pulse/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Administration/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Leadership/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Notifications/ })).toHaveTextContent("3");
  });

  it("adds the workspaces the server authorized", () => {
    renderWithData(<SidebarContent />, { "/auth/me": me(["employee", "manager", "admin"]), "/notifications?unread=true": { unreadCount: 0, items: [] } });
    expect(screen.getByRole("link", { name: /Team Pulse/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Administration/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Leadership/ })).not.toBeInTheDocument();
  });
});

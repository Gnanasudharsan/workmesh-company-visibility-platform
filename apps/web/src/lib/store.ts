"use client";

import type { Workspace } from "@workmesh/core";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;
  composer: { open: boolean; projectId?: string; workItemId?: string; milestoneId?: string };
  openComposer: (defaults?: { projectId?: string; workItemId?: string; milestoneId?: string }) => void;
  closeComposer: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (o: boolean) => void;
  realtime: "connecting" | "live" | "offline";
  setRealtime: (s: UiState["realtime"]) => void;
  recent: Array<{ href: string; label: string; kind: string }>;
  pushRecent: (r: { href: string; label: string; kind: string }) => void;
}

/** UI-only state. Authorization never depends on it: the server decides what each workspace may show. */
export const useUi = create<UiState>()(
  persist(
    (set) => ({
      workspace: "employee",
      setWorkspace: (workspace) => set({ workspace }),
      composer: { open: false },
      openComposer: (defaults) => set({ composer: { open: true, ...defaults } }),
      closeComposer: () => set({ composer: { open: false } }),
      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      mobileNavOpen: false,
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
      realtime: "connecting",
      setRealtime: (realtime) => set({ realtime }),
      recent: [],
      pushRecent: (r) => set((s) => ({ recent: [r, ...s.recent.filter((x) => x.href !== r.href)].slice(0, 8) })),
    }),
    { name: "workmesh-ui", partialize: (s) => ({ workspace: s.workspace, recent: s.recent, sidebarCollapsed: s.sidebarCollapsed }) },
  ),
);

export const WORKSPACE_HOME: Record<Workspace, string> = {
  employee: "/home",
  manager: "/team-pulse",
  lead: "/lead",
  leadership: "/leadership",
  admin: "/admin",
};

export const WORKSPACE_LABEL: Record<Workspace, string> = {
  employee: "My workspace",
  manager: "Manager",
  lead: "Project lead",
  leadership: "Leadership",
  admin: "Administration",
};

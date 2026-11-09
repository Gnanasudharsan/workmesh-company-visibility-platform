"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { Bell, CalendarPlus, ChevronRight, FolderPlus, LogOut, Menu, MessageSquarePlus, OctagonAlert, Plus, Search, Settings, ShieldCheck, Target, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api, useApi, useAction, useMe } from "@/lib/hooks";
import { useUi } from "@/lib/store";
import type { Notification } from "@/lib/types";
import { cn, relative } from "@/lib/utils";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from "../ui/overlay";
import { SidebarContent } from "./sidebar";
import { CreateDialogs, type CreateKind } from "../work/create-dialogs";

const NAMES: Record<string, string> = {
  home: "Home", "my-work": "My Work", "team-pulse": "Team Pulse", lead: "Projects I lead", leadership: "Leadership", map: "Company Map", roadmap: "Roadmaps",
  projects: "Projects", dependencies: "Dependencies", directory: "Directory", people: "People", teams: "Teams", departments: "Departments", meetings: "Meetings",
  blockers: "Blockers", notifications: "Notifications", settings: "Settings", admin: "Administration", members: "Members", invitations: "Invitations", structure: "Teams & departments",
  reporting: "Reporting lines", permissions: "Permission inspector", audit: "Audit log", updates: "Updates", goals: "Goals", initiatives: "Initiatives", milestones: "Milestones",
  decisions: "Decisions", search: "Search", privacy: "Privacy & trust", onboarding: "Welcome", new: "New",
};

function Breadcrumb() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1 text-[13px] sm:flex">
      {parts.map((p, idx) => {
        const href = "/" + parts.slice(0, idx + 1).join("/");
        const isId = /^[0-9a-f-]{36}$/i.test(p);
        const name = isId ? "Details" : (NAMES[p] ?? p);
        const last = idx === parts.length - 1;
        return (
          <span key={href} className="flex min-w-0 items-center gap-1">
            {idx > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />}
            {last || isId || ["people", "teams", "departments", "updates", "goals", "initiatives", "milestones"].includes(p) ? (
              <span className={cn("truncate", last ? "font-medium text-ink" : "text-muted")} aria-current={last ? "page" : undefined}>{name}</span>
            ) : (
              <Link href={href} className="truncate text-muted hover:text-ink">{name}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function NotificationsPopover() {
  const { data } = useApi<{ items: Notification[]; unreadCount: number }>("/notifications");
  const router = useRouter();
  const markAll = useAction(() => api.post("/notifications/read-all"), { invalidate: ["/notifications"] });
  const open = useAction((n: Notification) => api.post(`/notifications/${n.id}/read`), { invalidate: ["/notifications"] });
  const unread = data?.unreadCount ?? 0;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-bright ring-2 ring-canvas" aria-hidden />}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-[min(380px,calc(100vw-24px))] rounded-xl border border-line bg-surface shadow-raised animate-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[13.5px] font-semibold">Notifications</p>
            <button disabled={!unread} onClick={() => markAll.mutate(undefined)} className="text-[12px] font-medium text-teal-ink disabled:text-faint">Mark all read</button>
          </div>
          <ul className="max-h-[420px] overflow-y-auto py-1">
            {(data?.items ?? []).slice(0, 8).map((n) => (
              <li key={n.id}>
                <button
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-subtle/70"
                  onClick={() => {
                    if (!n.readAt) open.mutate(n);
                    if (n.link) router.push(n.link);
                  }}
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-teal")} aria-label={n.readAt ? undefined : "Unread"} />
                  <span className="min-w-0">
                    <span className="block text-[13px] leading-snug text-ink">{n.title}</span>
                    <span className="text-[11.5px] text-muted">{relative(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
            {data && data.items.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-muted">You&apos;re all caught up.</li>}
          </ul>
          <Link href="/notifications" className="block border-t border-line px-4 py-2.5 text-center text-[12.5px] font-medium text-teal-ink hover:bg-subtle/60">View all</Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function MobileNav() {
  const { mobileNavOpen, setMobileNavOpen } = useUi();
  return (
    <DialogPrimitive.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-950/50 backdrop-blur-[2px] animate-fade-in" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[min(288px,86vw)] shadow-overlay animate-slide-in-left focus:outline-none">
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Main WorkMesh navigation</DialogPrimitive.Description>
          <SidebarContent onNavigate={() => setMobileNavOpen(false)} layoutGroup="mobile-nav" />
          <DialogPrimitive.Close className="absolute right-3 top-4 rounded-md p-1.5 text-navy-muted hover:bg-white/10 hover:text-white" aria-label="Close navigation">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Topbar() {
  const { data: me } = useMe();
  const router = useRouter();
  const { setPaletteOpen, openComposer, setMobileNavOpen, realtime } = useUi();
  const [create, setCreate] = useState<CreateKind | null>(null);
  const ws = new Set(me?.active?.workspaces ?? []);
  const logout = async () => {
    await api.post("/auth/logout").catch(() => undefined);
    window.location.href = "/login";
  };
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line/80 bg-canvas/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}>
        <Menu className="h-4 w-4" />
      </Button>
      <MobileNav />
      <Breadcrumb />
      <button
        onClick={() => setPaletteOpen(true)}
        className="ml-auto hidden h-9 w-[min(340px,32vw)] items-center gap-2.5 rounded-[10px] border border-line bg-surface px-3 text-[13px] text-muted shadow-card transition-colors hover:border-line-strong hover:text-ink md:flex"
      >
        <Search className="h-4 w-4 text-faint" aria-hidden />
        <span className="flex-1 truncate text-left">Search people, projects, goals…</span>
        <kbd className="rounded border border-line bg-subtle px-1 font-mono text-[10.5px] text-faint">⌘K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1.5 md:ml-2">
        <span
          className={cn("mr-1 hidden items-center gap-1.5 rounded-full px-2 py-1 text-[11.5px] font-medium xl:flex", realtime === "live" ? "bg-success-soft text-success-ink" : "bg-subtle text-muted")}
          title={realtime === "live" ? "Live updates connected" : "Live updates reconnecting — data still saves normally"}
        >
          <span className={cn("relative flex h-1.5 w-1.5 rounded-full", realtime === "live" ? "bg-success" : "bg-faint")} aria-hidden>
            {realtime === "live" && <span className="absolute inset-0 animate-ping rounded-full bg-success/60 motion-reduce:hidden" />}
          </span>
          {realtime === "live" ? "Live" : "Offline"}
        </span>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={() => setPaletteOpen(true)}>
          <Search className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownTrigger asChild>
            <Button variant="accent" size="sm" aria-label="Create">
              <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Create</span>
            </Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem icon={<MessageSquarePlus className="h-4 w-4" />} onSelect={() => openComposer()}>Progress update</DropdownItem>
            <DropdownItem icon={<OctagonAlert className="h-4 w-4" />} onSelect={() => setCreate("blocker")}>Report a blocker</DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={<FolderPlus className="h-4 w-4" />} onSelect={() => setCreate("project")}>Project</DropdownItem>
            <DropdownItem icon={<CalendarPlus className="h-4 w-4" />} onSelect={() => setCreate("meeting")}>Meeting</DropdownItem>
            {ws.has("leadership") && <DropdownItem icon={<Target className="h-4 w-4" />} onSelect={() => setCreate("goal")}>Company goal</DropdownItem>}
          </DropdownContent>
        </DropdownMenu>
        <NotificationsPopover />
        <DropdownMenu>
          <DropdownTrigger className="ml-1 rounded-full ring-2 ring-transparent transition hover:ring-teal/40" aria-label="Account menu">
            <Avatar name={me?.active?.profile?.displayName ?? me?.user.name} hue={me?.active?.profile?.avatarHue} size="sm" />
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>{me?.user.email}</DropdownLabel>
            {me?.active && <DropdownItem icon={<UserRound className="h-4 w-4" />} onSelect={() => router.push(`/people/${me.active!.membershipId}`)}>My profile</DropdownItem>}
            <DropdownItem icon={<Settings className="h-4 w-4" />} onSelect={() => router.push("/settings")}>Settings</DropdownItem>
            <DropdownItem icon={<ShieldCheck className="h-4 w-4" />} onSelect={() => router.push("/privacy")}>Privacy & trust</DropdownItem>
            <DropdownSeparator />
            <DropdownItem icon={<LogOut className="h-4 w-4" />} onSelect={logout}>Sign out</DropdownItem>
          </DropdownContent>
        </DropdownMenu>
      </div>
      <CreateDialogs kind={create} onClose={() => setCreate(null)} />
    </header>
  );
}

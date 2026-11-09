"use client";

import type { Workspace } from "@workmesh/core";
import {
  Activity, Bell, BookUser, CalendarClock, Compass, Crown, FolderKanban, GitBranch, Home, LayoutDashboard, ListChecks, Map, OctagonAlert, Search, Settings, Shield, Target,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApi, useMe } from "@/lib/hooks";
import { useUi } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { WorkspaceSwitcher } from "./workspace-switcher";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  requires?: Workspace;
  badge?: number;
}

const i = (C: typeof Home) => <C className="h-4 w-4" aria-hidden />;

export function useNav() {
  const { data: me } = useMe();
  const { data: notif } = useApi<{ unreadCount: number }>(me?.active ? "/notifications?unread=true" : null, { refetchInterval: 60_000 });
  const ws = new Set(me?.active?.workspaces ?? []);
  const sections: Array<{ title: string; items: NavItem[] }> = [
    {
      title: "Workspace",
      items: [
        { href: "/home", label: "Home", icon: i(Home) },
        { href: "/my-work", label: "My Work", icon: i(ListChecks) },
        { href: "/team-pulse", label: "Team Pulse", icon: i(Activity), requires: "manager" },
        { href: "/lead", label: "Projects I lead", icon: i(Compass), requires: "lead" },
        { href: "/leadership", label: "Leadership", icon: i(Crown), requires: "leadership" },
      ],
    },
    {
      title: "Company",
      items: [
        { href: "/map", label: "Company Map", icon: i(Map) },
        { href: "/roadmap", label: "Roadmaps", icon: i(Target) },
        { href: "/projects", label: "Projects", icon: i(FolderKanban) },
        { href: "/dependencies", label: "Dependencies", icon: i(GitBranch) },
        { href: "/directory", label: "Directory", icon: i(BookUser) },
      ],
    },
    {
      title: "Collaborate",
      items: [
        { href: "/meetings", label: "Meetings", icon: i(CalendarClock) },
        { href: "/blockers", label: "Blockers", icon: i(OctagonAlert) },
        { href: "/notifications", label: "Notifications", icon: i(Bell), badge: notif?.unreadCount },
      ],
    },
  ];
  const footer: NavItem[] = [
    { href: "/admin", label: "Administration", icon: i(Shield), requires: "admin" },
    { href: "/settings", label: "Settings", icon: i(Settings) },
  ];
  const allowed = (n: NavItem) => !n.requires || ws.has(n.requires);
  return { sections: sections.map((s) => ({ ...s, items: s.items.filter(allowed) })), footer: footer.filter(allowed) };
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = pathname === item.href || (item.href !== "/home" && pathname.startsWith(`${item.href}/`)) || (item.href === "/admin" && pathname.startsWith("/admin"));
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
        active ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-soft hover:bg-white/60 hover:text-ink",
      )}
    >
      <span className={cn(active ? "text-brand" : "text-faint group-hover:text-muted")}>{item.icon}</span>
      <span className="flex-1 truncate">{item.label}</span>
      {!!item.badge && <span className="rounded-full bg-brand px-1.5 text-[10.5px] font-semibold leading-[18px] text-white tabular-nums">{item.badge > 99 ? "99+" : item.badge}</span>}
    </Link>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { sections, footer } = useNav();
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-4">
        <Link href="/home" onClick={onNavigate} className="inline-flex rounded-md" aria-label="WorkMesh home">
          <Logo />
        </Link>
      </div>
      <div className="px-3">
        <WorkspaceSwitcher onNavigate={onNavigate} />
        <button
          onClick={() => {
            onNavigate?.();
            setPaletteOpen(true);
          }}
          className="mt-2 flex h-8 w-full items-center gap-2.5 rounded-lg border border-line bg-surface/70 px-2.5 text-[13px] text-muted shadow-card hover:text-ink"
        >
          <Search className="h-4 w-4 text-faint" aria-hidden />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border border-line bg-subtle px-1 text-[10.5px] font-medium text-faint">⌘K</kbd>
        </button>
      </div>
      <nav className="mt-3 flex-1 space-y-4 overflow-y-auto px-3 pb-4" aria-label="Main">
        {sections.map((s) => (
          <div key={s.title}>
            <div className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-faint">{s.title}</div>
            <div className="space-y-0.5">
              {s.items.map((item) => (
                <NavLink key={item.href} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="space-y-0.5 border-t border-line px-3 py-3">
        {footer.map((item) => (
          <NavLink key={item.href} item={item} onNavigate={onNavigate} />
        ))}
        <Link href="/privacy" onClick={onNavigate} className="mt-2 flex items-center gap-2 px-2.5 text-[11.5px] text-faint hover:text-muted">
          <LayoutDashboard className="h-3 w-3" aria-hidden /> Visibility without surveillance
        </Link>
      </div>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-[248px] shrink-0 border-r border-line bg-[#f2f5fa] lg:block">
      <div className="sticky top-0 h-screen">
        <SidebarContent />
      </div>
    </aside>
  );
}

"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { Workspace } from "@workmesh/core";
import {
  Activity, Bell, BookUser, CalendarClock, ChevronsLeft, ChevronsRight, Compass, Crown, FolderKanban, Gavel, GitBranch, Home, ListChecks, Map, OctagonAlert, Search, Settings, Shield, ShieldCheck, Target, Users,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { useApi, useMe } from "@/lib/hooks";
import { SPRING } from "@/lib/motion";
import { useUi } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "./logo";
import { WorkspaceSwitcher } from "./workspace-switcher";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  requires?: Workspace;
  badge?: number;
  /** Extra path prefixes that count as "inside" this item. */
  match?: string[];
}

const i = (C: typeof Home) => <C className="h-[17px] w-[17px]" strokeWidth={1.85} aria-hidden />;

/**
 * Navigation is filtered by the workspaces the server granted this member. Hiding a link is a
 * convenience only: every page and API call is authorized again on the server.
 */
export function useNav() {
  const { data: me } = useMe();
  const { data: notif } = useApi<{ unreadCount: number }>(me?.active ? "/notifications?unread=true" : null, { refetchInterval: 60_000 });
  const ws = new Set(me?.active?.workspaces ?? []);
  const sections: Array<{ title: string; items: NavItem[] }> = [
    {
      title: "Overview",
      items: [
        { href: "/home", label: "Home", icon: i(Home) },
        { href: "/my-work", label: "My Work", icon: i(ListChecks) },
        { href: "/team-pulse", label: "Team Pulse", icon: i(Activity), requires: "manager" },
        { href: "/lead", label: "Projects I lead", icon: i(Compass), requires: "lead" },
        { href: "/leadership", label: "Leadership", icon: i(Crown), requires: "leadership" },
      ],
    },
    {
      title: "Explore",
      items: [
        { href: "/map", label: "Company Map", icon: i(Map) },
        { href: "/directory", label: "Directory", icon: i(BookUser), match: ["/people", "/departments"] },
        { href: "/directory?tab=teams", label: "Teams", icon: i(Users), match: ["/teams"] },
        { href: "/roadmap", label: "Roadmaps", icon: i(Target), match: ["/goals", "/initiatives", "/milestones"] },
      ],
    },
    {
      title: "Execution",
      items: [
        { href: "/projects", label: "Projects", icon: i(FolderKanban) },
        { href: "/dependencies", label: "Dependencies", icon: i(GitBranch) },
        { href: "/blockers", label: "Blockers", icon: i(OctagonAlert) },
        { href: "/meetings", label: "Meetings", icon: i(CalendarClock) },
        { href: "/decisions", label: "Decisions", icon: i(Gavel) },
      ],
    },
    {
      title: "Workspace",
      items: [
        { href: "/notifications", label: "Notifications", icon: i(Bell), badge: notif?.unreadCount },
        { href: "/admin", label: "Administration", icon: i(Shield), requires: "admin" },
        { href: "/settings", label: "Settings", icon: i(Settings) },
      ],
    },
  ];
  const allowed = (n: NavItem) => !n.requires || ws.has(n.requires);
  return { sections: sections.map((s) => ({ ...s, items: s.items.filter(allowed) })).filter((s) => s.items.length) };
}

function useIsActive() {
  const pathname = usePathname();
  const params = useSearchParams();
  return (item: NavItem) => {
    const [path, query] = item.href.split("?");
    if (query) {
      const [k, v] = query.split("=");
      if (pathname === path) return params.get(k) === v;
      return !!item.match?.some((m) => pathname.startsWith(m));
    }
    if (pathname === path) return path !== "/directory" || params.get("tab") !== "teams";
    if (path !== "/home" && pathname.startsWith(`${path}/`)) return true;
    return !!item.match?.some((m) => pathname === m || pathname.startsWith(`${m}/`));
  };
}

function SideTip({ show, label, children }: { show: boolean; label: string; children: ReactNode }) {
  if (!show) return <>{children}</>;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side="right" sideOffset={10} className="z-[60] rounded-md bg-navy-800 px-2 py-1 text-[12px] font-medium text-navy-text shadow-overlay ring-1 ring-navy-line animate-fade-in">
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

function NavLink({ item, active, collapsed, layoutGroup, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; layoutGroup: string; onNavigate?: () => void }) {
  const reduce = useReducedMotion();
  const badge = item.badge ? (item.badge > 99 ? "99+" : String(item.badge)) : null;
  return (
    <SideTip show={collapsed} label={badge ? `${item.label} · ${badge} unread` : item.label}>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex h-9 items-center gap-3 rounded-[10px] text-[13.5px] font-medium transition-colors duration-200",
          collapsed ? "w-10 justify-center" : "px-3",
          active ? "text-white" : "text-navy-muted hover:bg-white/[0.05] hover:text-navy-text",
        )}
      >
        {active && (
          <motion.span
            layoutId={`${layoutGroup}-active`}
            transition={reduce ? { duration: 0 } : SPRING.snappy}
            className="absolute inset-0 rounded-[10px] bg-gradient-to-r from-teal/[0.16] to-white/[0.04] ring-1 ring-inset ring-teal/25"
            aria-hidden
          >
            <span className={cn("absolute top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-teal shadow-[0_0_12px_rgba(55,213,195,0.7)]", collapsed ? "-left-3" : "-left-[13px]")} />
          </motion.span>
        )}
        <span className={cn("relative transition-colors", active ? "text-teal" : "text-navy-faint group-hover:text-navy-text")}>{item.icon}</span>
        <span className={cn("relative flex-1 truncate", collapsed && "sr-only")}>{item.label}</span>
        {badge &&
          (collapsed ? (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-bright ring-2 ring-navy-950" aria-hidden />
          ) : (
            <span className="relative rounded-full bg-amber-bright px-1.5 text-[10.5px] font-semibold leading-[18px] text-navy-950 tabular-nums">{badge}</span>
          ))}
      </Link>
    </SideTip>
  );
}

function NavSections({ sections, collapsed, layoutGroup, onNavigate }: { sections: ReturnType<typeof useNav>["sections"]; collapsed: boolean; layoutGroup: string; onNavigate?: () => void }) {
  const isActive = useIsActive();
  return (
    <nav className={cn("mt-4 flex-1 space-y-5 overflow-y-auto overflow-x-hidden pb-4", collapsed ? "px-3" : "px-4")} aria-label="Main">
      {sections.map((s) => (
        <div key={s.title} role="group" aria-label={s.title}>
          {collapsed ? (
            <div className="mx-auto mb-2 h-px w-6 bg-navy-line" aria-hidden />
          ) : (
            <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-navy-faint">{s.title}</div>
          )}
          <div className="space-y-0.5">
            {s.items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item)} collapsed={collapsed} layoutGroup={layoutGroup} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function SidebarContent({ onNavigate, collapsed = false, layoutGroup = "nav" }: { onNavigate?: () => void; collapsed?: boolean; layoutGroup?: string }) {
  const { sections } = useNav();
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <div className="on-navy flex h-full flex-col bg-navy-950 text-navy-text">
        <div className={cn("flex h-16 shrink-0 items-center", collapsed ? "justify-center" : "px-5")}>
          <Link href="/home" onClick={onNavigate} className="inline-flex rounded-md" aria-label="WorkMesh home">
            {collapsed ? <LogoMark size={30} /> : <Logo theme="dark" />}
          </Link>
        </div>
        <div className={cn("space-y-2", collapsed ? "px-3" : "px-4")}>
          {!collapsed && <WorkspaceSwitcher onNavigate={onNavigate} />}
          <SideTip show={collapsed} label="Search (⌘K)">
            <button
              onClick={() => {
                onNavigate?.();
                setPaletteOpen(true);
              }}
              aria-label={collapsed ? "Search" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-[10px] border border-navy-line bg-white/[0.04] text-[13px] text-navy-muted transition-colors hover:border-teal/30 hover:text-navy-text",
                collapsed ? "w-10 justify-center" : "w-full px-3",
              )}
            >
              <Search className="h-4 w-4" aria-hidden />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">Search</span>
                  <kbd className="rounded border border-navy-line px-1 font-mono text-[10.5px] text-navy-faint">⌘K</kbd>
                </>
              )}
            </button>
          </SideTip>
        </div>
        <Suspense fallback={<div className="flex-1" />}>
          <NavSections sections={sections} collapsed={collapsed} layoutGroup={layoutGroup} onNavigate={onNavigate} />
        </Suspense>
        <div className={cn("border-t border-navy-line py-3", collapsed ? "px-3" : "px-4")}>
          <SideTip show={collapsed} label="Visibility without surveillance">
            <Link
              href="/privacy"
              onClick={onNavigate}
              aria-label={collapsed ? "Privacy and trust" : undefined}
              className={cn("flex items-center gap-2 rounded-md py-1 text-[11.5px] text-navy-faint hover:text-navy-text", collapsed ? "justify-center" : "px-3")}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-teal/80" aria-hidden />
              {!collapsed && "Visibility without surveillance"}
            </Link>
          </SideTip>
        </div>
      </div>
    </TooltipPrimitive.Provider>
  );
}

export function Sidebar() {
  const { sidebarCollapsed: collapsed, toggleSidebar } = useUi();
  const reduce = useReducedMotion();
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 256 }}
      transition={reduce ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="relative hidden shrink-0 bg-navy-950 lg:block"
    >
      <div className="sticky top-0 h-screen">
        <SidebarContent collapsed={collapsed} layoutGroup="desktop-nav" />
        <button
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="absolute -right-3 top-[22px] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-navy-line bg-navy-900 text-navy-muted shadow-card transition-colors hover:text-teal"
        >
          {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
        </button>
      </div>
    </motion.aside>
  );
}

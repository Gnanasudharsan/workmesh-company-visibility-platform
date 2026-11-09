"use client";

import { Check, Map as MapIcon, MessageSquarePlus, Network, Search, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useUi } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Step {
  key: string;
  title: string;
  description: string;
  icon: ReactNode;
  done: boolean;
  href?: string;
  onClick?: () => void;
}

/**
 * First-run guide. Steps complete from real signals: a published update, or having opened the
 * page in question on this device. Dismissal is a local preference and hides nothing else.
 */
export function GettingStarted({ hasUpdate }: { hasUpdate: boolean }) {
  const { tour, markTour, openComposer, setPaletteOpen } = useUi();
  if (tour.dismissed) return null;
  const steps: Step[] = [
    { key: "update", title: "Share your first update", description: "What you're focused on and what's next", icon: <MessageSquarePlus />, done: hasUpdate, onClick: () => openComposer() },
    { key: "map", title: "Explore the Company Map", description: "See how teams and work connect", icon: <MapIcon />, done: !!tour.map, href: "/map" },
    { key: "work", title: "Follow work to a company goal", description: "Switch the map to Work mode", icon: <Network />, done: !!tour.work, href: "/map?mode=work" },
    { key: "search", title: "Find anything with ⌘K", description: "People, teams, projects and decisions", icon: <Search />, done: !!tour.search, onClick: () => (markTour("search"), setPaletteOpen(true)) },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <section aria-labelledby="getting-started" className="rounded-[var(--radius-card)] border border-teal/25 bg-gradient-to-br from-teal-soft/70 via-surface to-violet-soft/50 p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id="getting-started" className="text-[14.5px] font-semibold">Getting started with WorkMesh</h2>
          <p className="text-[12px] text-muted">{done} of {steps.length} done · takes about three minutes</p>
        </div>
        <button onClick={() => markTour("dismissed")} className="rounded-md p-1 text-muted hover:bg-subtle hover:text-ink" aria-label="Dismiss getting started guide"><X className="h-4 w-4" /></button>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/70" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={steps.length} aria-label="Getting started progress">
        <div className="h-full rounded-full bg-teal-ink transition-[width] duration-500" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s) => {
          const body = (
            <>
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] [&_svg]:h-4 [&_svg]:w-4", s.done ? "bg-teal-ink text-white" : "bg-surface text-teal-ink ring-1 ring-line")}>{s.done ? <Check /> : s.icon}</span>
              <span className="min-w-0">
                <span className={cn("block text-[13px] font-medium", s.done && "text-muted line-through decoration-faint")}>{s.title}</span>
                <span className="block truncate text-[11.5px] text-muted">{s.done ? "Done" : s.description}</span>
              </span>
            </>
          );
          const cls = "flex w-full items-center gap-2.5 rounded-[12px] bg-surface/80 p-2.5 text-left ring-1 ring-line/70 transition hover:ring-teal/40";
          return (
            <li key={s.key}>
              {s.href ? <Link href={s.href} className={cls}>{body}</Link> : <button type="button" onClick={s.onClick} className={cls}>{body}</button>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

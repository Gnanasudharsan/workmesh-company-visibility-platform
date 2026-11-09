"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "../motion/primitives";
import { LivingMesh } from "./living-mesh";

/** The navy command surface used at the top of signature pages. */
export function MidnightHero({ eyebrow, title, description, actions, children, aside, className, mesh = true }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode; aside?: ReactNode; className?: string; mesh?: boolean }) {
  return (
    <section className={cn("surface-midnight on-navy relative isolate overflow-hidden rounded-[var(--radius-panel)] text-navy-text shadow-raised", className)}>
      {mesh && <LivingMesh className="absolute inset-y-0 right-0 -z-10 h-full w-full opacity-70 [mask-image:linear-gradient(90deg,transparent_15%,black_70%)] sm:w-[70%]" density={18} seed={11} />}
      <div className={cn("relative grid gap-6 p-5 sm:p-7", aside && "lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end")}>
        <div className="min-w-0">
          {eyebrow && <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-teal">{eyebrow}</div>}
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-white sm:text-[32px]">{title}</h1>
          {description && <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-navy-muted">{description}</p>}
          {actions && <div className="mt-5 flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {aside}
      </div>
      {children && <div className="relative border-t border-white/[0.07] bg-navy-950/30 px-5 py-4 backdrop-blur-sm sm:px-7">{children}</div>}
    </section>
  );
}

/** A metric that sits on a navy surface. `value` must be a real count from the API. */
export function HeroMetric({ label, value, hint, href, accent = "teal" }: { label: string; value: number | string; hint?: ReactNode; href?: string; accent?: "teal" | "violet" | "amber" | "coral" }) {
  const dot = { teal: "bg-teal", violet: "bg-violet-bright", amber: "bg-amber-bright", coral: "bg-coral" }[accent];
  const body = (
    <>
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-navy-muted">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} aria-hidden />
        {label}
      </div>
      <div className="font-display mt-1 text-[24px] font-semibold leading-none tracking-[-0.03em] text-white tabular-nums">{typeof value === "number" ? <AnimatedNumber value={value} /> : value}</div>
      {hint && <div className="mt-1 truncate text-[11.5px] text-navy-faint">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="group block min-w-0 rounded-xl px-3 py-2 transition-colors hover:bg-white/[0.06]">
      {body}
    </Link>
  ) : (
    <div className="min-w-0 px-3 py-2">{body}</div>
  );
}

/** A real shortcut: every QuickAction navigates or opens a working dialog. */
export function QuickAction({ icon, title, description, href, onClick, tone = "teal" }: { icon: ReactNode; title: string; description?: string; href?: string; onClick?: () => void; tone?: "teal" | "violet" | "amber" | "navy" }) {
  const chip = { teal: "bg-teal-soft text-teal-ink", violet: "bg-violet-soft text-violet", amber: "bg-warning-soft text-warning-ink", navy: "bg-navy-950 text-teal" }[tone];
  const cls = "group flex w-full items-center gap-3 rounded-[14px] border border-line bg-surface p-3 text-left shadow-card transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised";
  const inner = (
    <>
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] [&_svg]:h-4 [&_svg]:w-4", chip)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold">{title}</span>
        {description && <span className="block truncate text-[12px] text-muted">{description}</span>}
      </span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-teal-ink" aria-hidden />
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

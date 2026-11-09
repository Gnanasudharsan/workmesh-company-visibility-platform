"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Small, dependency-free data visuals. Every one renders real values passed in by the caller,
 * pairs colour with a text label, and exposes an accessible summary.
 */

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  href?: string;
}

export function ProgressRing({ value, size = 64, stroke = 6, label, tone = "teal", children, track = "var(--color-subtle)" }: { value: number | null | undefined; size?: number; stroke?: number; label: string; tone?: "teal" | "violet" | "amber" | "danger"; children?: ReactNode; track?: string }) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const color = { teal: "var(--color-teal)", violet: "var(--color-violet-bright)", amber: "var(--color-amber-bright)", danger: "var(--color-danger)" }[tone];
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={value == null ? `${label}: not enough data` : `${label}: ${v}%`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {value != null && (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: reduce ? c * (1 - v / 100) : c }}
            animate={{ strokeDashoffset: c * (1 - v / 100) }}
            transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">{children ?? <span className="font-display text-[13px] font-semibold tabular-nums">{value == null ? "—" : `${v}%`}</span>}</span>
    </div>
  );
}

export function Donut({ segments, size = 148, stroke = 18, label, center }: { segments: Segment[]; size?: number; stroke?: number; label: string; center?: ReactNode }) {
  const reduce = useReducedMotion();
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  let offset = 0;
  const summary = segments.map((s) => `${s.label} ${s.value}`).join(", ");
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${total ? summary : "no data"}`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-subtle)" strokeWidth={stroke} />
        {total > 0 &&
          segments.map((s, i) => {
            if (!s.value) return null;
            const len = (s.value / total) * c;
            const el = (
              <motion.circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                strokeDashoffset={-offset}
                initial={{ opacity: reduce ? 1 : 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: reduce ? 0 : i * 0.06 }}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>
    </div>
  );
}

export function Legend({ segments, className, showPercent }: { segments: Segment[]; className?: string; showPercent?: boolean }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <ul className={cn("space-y-1.5", className)}>
      {segments.map((s) => {
        const body = (
          <>
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-ink-soft">{s.label}</span>
            <span className="font-semibold tabular-nums text-ink">{s.value}</span>
            {showPercent && <span className="w-9 text-right tabular-nums text-faint">{Math.round((s.value / total) * 100)}%</span>}
          </>
        );
        return (
          <li key={s.key}>
            {s.href ? (
              <Link href={s.href} className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-0.5 text-[12.5px] hover:bg-subtle">{body}</Link>
            ) : (
              <span className="flex items-center gap-2 text-[12.5px]">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** One horizontal stacked bar. Segments with value 0 are omitted. */
export function SegmentedBar({ segments, label, height = 10, className }: { segments: Segment[]; label: string; height?: number; className?: string }) {
  const reduce = useReducedMotion();
  const total = segments.reduce((a, s) => a + s.value, 0);
  return (
    <div
      className={cn("flex w-full gap-[2px] overflow-hidden rounded-full bg-subtle", className)}
      style={{ height }}
      role="img"
      aria-label={`${label}: ${total ? segments.filter((s) => s.value).map((s) => `${s.label} ${s.value}`).join(", ") : "no data"}`}
    >
      {total > 0 &&
        segments.filter((s) => s.value > 0).map((s, i) => (
          <motion.span
            key={s.key}
            title={`${s.label}: ${s.value}`}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ background: s.color, width: `${(s.value / total) * 100}%`, transformOrigin: "left" }}
            initial={{ scaleX: reduce ? 1 : 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : i * 0.05, ease: [0.22, 1, 0.36, 1] }}
          />
        ))}
    </div>
  );
}

/** A labelled horizontal bar used in ranked lists (departments, teams…). */
export function BarRow({ label, value, max, color = "var(--color-teal)", suffix = "", href, sub }: { label: ReactNode; value: number; max: number; color?: string; suffix?: string; href?: string; sub?: ReactNode }) {
  const reduce = useReducedMotion();
  const pct = max > 0 ? (value / max) * 100 : 0;
  const inner = (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <span className="truncate text-[13px] font-medium">{label}</span>
      <span className="text-[12.5px] font-semibold tabular-nums">{value}{suffix}</span>
      <div className="col-span-2 h-2 overflow-hidden rounded-full bg-subtle">
        <motion.div className="h-full rounded-full" style={{ background: color, transformOrigin: "left", width: `${Math.max(pct, 2)}%` }} initial={{ scaleX: reduce ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ duration: reduce ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }} />
      </div>
      {sub && <div className="col-span-2 text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="-mx-2 block rounded-lg px-2 py-1.5 hover:bg-subtle/70">{inner}</Link> : <div className="py-1.5">{inner}</div>;
}

export const STATUS_COLORS = {
  ON_TRACK: "var(--color-success)",
  AT_RISK: "var(--color-warning)",
  OFF_TRACK: "var(--color-danger)",
  BLOCKED: "var(--color-danger)",
  DONE: "var(--color-teal-ink)",
  NOT_STARTED: "var(--color-unknown)",
  UNKNOWN: "var(--color-unknown)",
  NEEDS_UPDATE: "var(--color-violet)",
} as const;

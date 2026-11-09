import { label } from "@workmesh/core";
import {
  AlertTriangle, CheckCircle2, CircleDashed, CircleDot, Clock3, Eye, Globe, Lock, OctagonAlert, PauseCircle, ShieldCheck, UserRound, Users, XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Status system. One meaning → one tone → one icon, everywhere in the product.
 * Every pill carries an icon and readable text; color is never the only signal.
 */
export type Tone = "neutral" | "teal" | "success" | "progress" | "waiting" | "blocked" | "violet" | "info" | "navy";

const TONES: Record<Tone, string> = {
  neutral: "bg-subtle text-ink-soft ring-line",
  teal: "bg-teal-soft text-teal-ink ring-teal/30",
  success: "bg-success-soft text-success-ink ring-success/20",
  progress: "bg-teal-soft text-teal-ink ring-teal/30",
  waiting: "bg-warning-soft text-warning-ink ring-warning/20",
  blocked: "bg-danger-soft text-danger-ink ring-danger/20",
  violet: "bg-violet-soft text-violet ring-violet/20",
  info: "bg-info-soft text-info ring-info/20",
  navy: "bg-navy-950 text-navy-text ring-navy-950",
};

export function Badge({ tone = "neutral", icon, children, className, title }: { tone?: Tone | "brand" | "warning" | "danger"; icon?: ReactNode; children: ReactNode; className?: string; title?: string }) {
  const t: Tone = tone === "brand" ? "teal" : tone === "warning" ? "waiting" : tone === "danger" ? "blocked" : tone;
  return (
    <span title={title} className={cn("inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11.5px] font-medium ring-1 ring-inset", TONES[t], className)}>
      {icon}
      {children}
    </span>
  );
}

const i = (C: typeof CheckCircle2) => <C className="h-3 w-3" aria-hidden />;

/** Semantic mapping for every lifecycle value in the product. */
const STATUS: Record<string, { tone: Tone; icon: ReactNode }> = {
  PROPOSED: { tone: "neutral", icon: i(CircleDashed) },
  PLANNED: { tone: "neutral", icon: i(CircleDashed) },
  TODO: { tone: "neutral", icon: i(CircleDashed) },
  DRAFT: { tone: "neutral", icon: i(CircleDashed) },
  SCHEDULED: { tone: "neutral", icon: i(Clock3) },
  IN_PROGRESS: { tone: "progress", icon: i(CircleDot) },
  ACTIVE: { tone: "progress", icon: i(CircleDot) },
  ASSIGNED: { tone: "progress", icon: i(CircleDot) },
  INVESTIGATING: { tone: "violet", icon: i(CircleDot) },
  IN_REVIEW: { tone: "violet", icon: i(Eye) },
  OPEN: { tone: "waiting", icon: i(AlertTriangle) },
  WAITING: { tone: "waiting", icon: i(PauseCircle) },
  PENDING: { tone: "waiting", icon: i(Clock3) },
  AT_RISK: { tone: "waiting", icon: i(AlertTriangle) },
  BLOCKED: { tone: "blocked", icon: i(OctagonAlert) },
  REOPENED: { tone: "blocked", icon: i(OctagonAlert) },
  MISSED: { tone: "blocked", icon: i(XCircle) },
  COMPLETED: { tone: "success", icon: i(CheckCircle2) },
  DONE: { tone: "success", icon: i(CheckCircle2) },
  RESOLVED: { tone: "success", icon: i(CheckCircle2) },
  ACHIEVED: { tone: "success", icon: i(CheckCircle2) },
  DECIDED: { tone: "success", icon: i(CheckCircle2) },
  PUBLISHED: { tone: "success", icon: i(CheckCircle2) },
  CANCELLED: { tone: "neutral", icon: i(XCircle) },
  ARCHIVED: { tone: "neutral", icon: i(XCircle) },
  SUPERSEDED: { tone: "neutral", icon: i(XCircle) },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { tone: "neutral" as Tone, icon: i(CircleDashed) };
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {label(status)}
    </Badge>
  );
}
export { StatusBadge as StatusPill };

const HEALTH: Record<string, { tone: Tone; icon: ReactNode }> = {
  ON_TRACK: { tone: "success", icon: i(CheckCircle2) },
  AT_RISK: { tone: "waiting", icon: i(AlertTriangle) },
  OFF_TRACK: { tone: "blocked", icon: i(AlertTriangle) },
  BLOCKED: { tone: "blocked", icon: i(OctagonAlert) },
  NOT_STARTED: { tone: "neutral", icon: i(CircleDashed) },
  DONE: { tone: "success", icon: i(CheckCircle2) },
  CANCELLED: { tone: "neutral", icon: i(XCircle) },
};

/** Solid color used for dots, chart segments and graph accents for each health value. */
export const HEALTH_COLOR: Record<string, string> = {
  ON_TRACK: "var(--color-chart-1)",
  AT_RISK: "var(--color-chart-3)",
  OFF_TRACK: "var(--color-chart-4)",
  BLOCKED: "#b8343a",
  NOT_STARTED: "var(--color-chart-6)",
  DONE: "var(--color-chart-5)",
  CANCELLED: "var(--color-chart-6)",
};

export function HealthBadge({ health, reasons }: { health: string; reasons?: string[] }) {
  const h = HEALTH[health] ?? HEALTH.NOT_STARTED!;
  return (
    <Badge tone={h.tone} icon={h.icon} title={reasons?.length ? `Why: ${reasons.join("; ")}` : undefined}>
      {label(health)}
    </Badge>
  );
}

const SEVERITY_TONE: Record<string, Tone> = { LOW: "neutral", MEDIUM: "info", HIGH: "waiting", CRITICAL: "blocked" };
export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge tone={SEVERITY_TONE[severity] ?? "neutral"} icon={severity === "CRITICAL" || severity === "HIGH" ? i(AlertTriangle) : undefined}>
      {label(severity)}
    </Badge>
  );
}

const VIS_ICON: Record<string, ReactNode> = {
  ORG: i(Globe),
  TEAM: i(Users),
  PROJECT_MEMBERS: i(Users),
  PROJECT: i(Users),
  RESTRICTED: i(Lock),
  PRIVATE: i(Lock),
  MANAGER: i(UserRound),
  PARTICIPANTS: i(Users),
};
export function VisibilityBadge({ visibility }: { visibility: string }) {
  return (
    <Badge tone={visibility === "RESTRICTED" || visibility === "PRIVATE" ? "violet" : "neutral"} icon={VIS_ICON[visibility]} title="Who can see this">
      {label(visibility)}
    </Badge>
  );
}

export function AccessBadge({ access }: { access: "summary" | "details" }) {
  return access === "summary" ? (
    <Badge tone="neutral" icon={i(Eye)} title="You can see this project's public summary only">
      Summary view
    </Badge>
  ) : null;
}

export function RoleBadge({ role }: { role: string }) {
  return role === "MEMBER" ? null : (
    <Badge tone={role === "OWNER" ? "violet" : role === "ADMIN" ? "info" : "teal"} icon={i(ShieldCheck)}>
      {label(role)}
    </Badge>
  );
}

const FRESH: Record<string, { tone: Tone; text: string }> = {
  TODAY: { tone: "success", text: "Updated today" },
  THIS_WEEK: { tone: "teal", text: "Updated this week" },
  EARLIER: { tone: "neutral", text: "No recent update" },
  NONE: { tone: "neutral", text: "No current update" },
};
/** Neutral freshness language — never implies anything about productivity. */
export function FreshnessBadge({ freshness }: { freshness: string }) {
  const f = FRESH[freshness] ?? FRESH.NONE!;
  return <Badge tone={f.tone}>{f.text}</Badge>;
}

/** Stage of a progress update (not a project status): distinct, calm palette. */
const STAGE_TONE: Record<string, Tone> = { PLANNING: "neutral", DEVELOPMENT: "teal", TESTING: "violet", REVIEW: "violet", BLOCKED: "blocked", COMPLETED: "success" };
export function StageBadge({ stage }: { stage: string }) {
  return <Badge tone={STAGE_TONE[stage] ?? "neutral"} icon={stage === "BLOCKED" ? i(OctagonAlert) : stage === "COMPLETED" ? i(CheckCircle2) : undefined}>{label(stage)}</Badge>;
}

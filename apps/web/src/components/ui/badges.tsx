import { label } from "@workmesh/core";
import { AlertTriangle, CheckCircle2, CircleDashed, CircleDot, Eye, Lock, OctagonAlert, PauseCircle, Users, XCircle, Globe, UserRound, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info" | "violet";

const TONES: Record<Tone, string> = {
  neutral: "bg-subtle text-slate-600 ring-slate-200",
  brand: "bg-brand-soft text-brand-deep ring-blue-200",
  success: "bg-success-soft text-green-700 ring-green-200",
  warning: "bg-warning-soft text-amber-700 ring-amber-200",
  danger: "bg-danger-soft text-red-700 ring-red-200",
  info: "bg-info-soft text-cyan-700 ring-cyan-200",
  violet: "bg-violet-soft text-violet-700 ring-violet-200",
};

export function Badge({ tone = "neutral", icon, children, className, title }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11.5px] font-medium ring-1 ring-inset", TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  PROPOSED: "neutral", PLANNED: "neutral", IN_PROGRESS: "brand", IN_REVIEW: "violet", BLOCKED: "danger", COMPLETED: "success", CANCELLED: "neutral",
  TODO: "neutral", DONE: "success", OPEN: "warning", ASSIGNED: "brand", INVESTIGATING: "violet", WAITING: "warning", RESOLVED: "success", REOPENED: "danger",
  ACTIVE: "brand", ACHIEVED: "success", MISSED: "danger", ARCHIVED: "neutral", DRAFT: "neutral", PENDING: "warning", DECIDED: "success", SUPERSEDED: "neutral",
  AT_RISK: "warning", SCHEDULED: "neutral", PUBLISHED: "success",
};

const STATUS_ICON: Record<string, ReactNode> = {
  BLOCKED: <OctagonAlert className="h-3 w-3" aria-hidden />,
  COMPLETED: <CheckCircle2 className="h-3 w-3" aria-hidden />,
  DONE: <CheckCircle2 className="h-3 w-3" aria-hidden />,
  RESOLVED: <CheckCircle2 className="h-3 w-3" aria-hidden />,
  IN_PROGRESS: <CircleDot className="h-3 w-3" aria-hidden />,
  CANCELLED: <XCircle className="h-3 w-3" aria-hidden />,
  WAITING: <PauseCircle className="h-3 w-3" aria-hidden />,
  PLANNED: <CircleDashed className="h-3 w-3" aria-hidden />,
  TODO: <CircleDashed className="h-3 w-3" aria-hidden />,
};

/** Status always carries an icon + text, never color alone. */
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"} icon={STATUS_ICON[status]}>
      {label(status)}
    </Badge>
  );
}

const HEALTH: Record<string, { tone: Tone; icon: ReactNode }> = {
  ON_TRACK: { tone: "success", icon: <CheckCircle2 className="h-3 w-3" aria-hidden /> },
  AT_RISK: { tone: "warning", icon: <AlertTriangle className="h-3 w-3" aria-hidden /> },
  OFF_TRACK: { tone: "danger", icon: <AlertTriangle className="h-3 w-3" aria-hidden /> },
  BLOCKED: { tone: "danger", icon: <OctagonAlert className="h-3 w-3" aria-hidden /> },
  NOT_STARTED: { tone: "neutral", icon: <CircleDashed className="h-3 w-3" aria-hidden /> },
  DONE: { tone: "success", icon: <CheckCircle2 className="h-3 w-3" aria-hidden /> },
  CANCELLED: { tone: "neutral", icon: <XCircle className="h-3 w-3" aria-hidden /> },
};

export function HealthBadge({ health, reasons }: { health: string; reasons?: string[] }) {
  const h = HEALTH[health] ?? HEALTH.NOT_STARTED!;
  return (
    <Badge tone={h.tone} icon={h.icon} title={reasons?.length ? `Why: ${reasons.join("; ")}` : undefined}>
      {label(health)}
    </Badge>
  );
}

const SEVERITY_TONE: Record<string, Tone> = { LOW: "neutral", MEDIUM: "info", HIGH: "warning", CRITICAL: "danger" };
export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <Badge tone={SEVERITY_TONE[severity] ?? "neutral"} icon={severity === "CRITICAL" || severity === "HIGH" ? <AlertTriangle className="h-3 w-3" aria-hidden /> : undefined}>
      {label(severity)}
    </Badge>
  );
}

const VIS_ICON: Record<string, ReactNode> = {
  ORG: <Globe className="h-3 w-3" aria-hidden />,
  TEAM: <Users className="h-3 w-3" aria-hidden />,
  PROJECT_MEMBERS: <Users className="h-3 w-3" aria-hidden />,
  PROJECT: <Users className="h-3 w-3" aria-hidden />,
  RESTRICTED: <Lock className="h-3 w-3" aria-hidden />,
  PRIVATE: <Lock className="h-3 w-3" aria-hidden />,
  MANAGER: <UserRound className="h-3 w-3" aria-hidden />,
  PARTICIPANTS: <Users className="h-3 w-3" aria-hidden />,
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
    <Badge tone="neutral" icon={<Eye className="h-3 w-3" aria-hidden />} title="You can see this project's public summary only">
      Summary view
    </Badge>
  ) : null;
}

export function RoleBadge({ role }: { role: string }) {
  return role === "MEMBER" ? null : (
    <Badge tone={role === "OWNER" ? "violet" : role === "ADMIN" ? "info" : "brand"} icon={<ShieldCheck className="h-3 w-3" aria-hidden />}>
      {label(role)}
    </Badge>
  );
}

const FRESH: Record<string, { tone: Tone; text: string }> = {
  TODAY: { tone: "success", text: "Updated today" },
  THIS_WEEK: { tone: "info", text: "Updated this week" },
  EARLIER: { tone: "neutral", text: "No recent update" },
  NONE: { tone: "neutral", text: "No current update" },
};
/** Neutral freshness language — never implies anything about productivity. */
export function FreshnessBadge({ freshness }: { freshness: string }) {
  const f = FRESH[freshness] ?? FRESH.NONE!;
  return <Badge tone={f.tone}>{f.text}</Badge>;
}

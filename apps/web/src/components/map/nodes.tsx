"use client";

import { label } from "@workmesh/core";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Building2, ChevronDown, ChevronRight, Diamond, Eye, Flag, FolderKanban, Layers, Target, Users } from "lucide-react";
import { memo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "../ui/avatar";

export interface MapNodeData extends Record<string, unknown> {
  label: string;
  kind: string;
  raw: Record<string, unknown>;
  dimmed?: boolean;
  highlighted?: boolean;
  selected?: boolean;
  direction?: "down" | "right";
}

const HEALTH_DOT: Record<string, string> = {
  ON_TRACK: "bg-success", AT_RISK: "bg-warning", OFF_TRACK: "bg-danger", BLOCKED: "bg-danger", NOT_STARTED: "bg-faint", DONE: "bg-success", CANCELLED: "bg-faint",
};

function Shell({ data, children, accent, className }: { data: MapNodeData; children: ReactNode; accent?: string; className?: string }) {
  const vertical = data.direction !== "right";
  return (
    <div
      className={cn(
        "group relative h-full w-full rounded-xl border bg-surface shadow-card transition-all duration-200",
        data.selected ? "border-brand shadow-raised ring-[3px] ring-teal-soft" : data.highlighted ? "border-teal/50 shadow-raised" : "border-line hover:border-line-strong hover:shadow-raised",
        data.dimmed && "opacity-30",
        className,
      )}
    >
      {accent && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ background: accent }} aria-hidden />}
      <Handle type="target" position={vertical ? Position.Top : Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-line-strong" />
      {children}
      <Handle type="source" position={vertical ? Position.Bottom : Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-line-strong" />
    </div>
  );
}

const Icon = ({ children, tone = "bg-subtle text-muted" }: { children: ReactNode; tone?: string }) => <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tone)}>{children}</span>;

export const CompanyNode = memo(({ data }: NodeProps) => {
  const d = data as MapNodeData;
  return (
    <Shell data={d} className="bg-gradient-to-br from-white to-teal-soft/60">
      <div className="flex h-full items-center gap-3 px-4">
        <Icon tone="bg-ink text-white"><Building2 className="h-4 w-4" aria-hidden /></Icon>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-semibold">{d.label}</p>
          <p className="text-[11.5px] text-muted">{String(d.raw.memberCount ?? "")} people · {String(d.raw.departmentCount ?? "")} departments</p>
        </div>
      </div>
    </Shell>
  );
});
CompanyNode.displayName = "CompanyNode";

export const DepartmentNode = memo(({ data }: NodeProps) => {
  const d = data as MapNodeData;
  const head = d.raw.head as { name: string } | null;
  return (
    <Shell data={d} accent={String(d.raw.color ?? "#2563EB")}>
      <div className="flex h-full items-center gap-3 px-4">
        <Icon><Layers className="h-4 w-4" aria-hidden /></Icon>
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold">{d.label}</p>
          <p className="truncate text-[11.5px] text-muted">{head ? `Head: ${head.name}` : "Department"} · {String(d.raw.memberCount ?? 0)} people</p>
        </div>
        <span className="ml-auto flex items-center gap-0.5 rounded-md bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-muted">
          {d.raw.open ? <ChevronDown className="h-3 w-3" aria-hidden /> : <ChevronRight className="h-3 w-3" aria-hidden />}
          {String(d.raw.teamCount ?? 0)}
        </span>
      </div>
    </Shell>
  );
});
DepartmentNode.displayName = "DepartmentNode";

export const TeamNode = memo(({ data }: NodeProps) => {
  const d = data as MapNodeData;
  const lead = d.raw.lead as { name: string; avatarHue: number } | null;
  return (
    <Shell data={d} accent={String(d.raw.color ?? "#94A3B8")}>
      <div className="flex h-full flex-col justify-center gap-1 px-4">
        <div className="flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-muted" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{d.label}</p>
          {d.raw.memberCount !== undefined && (
            <span className="flex items-center gap-0.5 rounded-md bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-muted" title={d.raw.expanded ? "Collapse team" : "Expand team"}>
              {d.raw.expanded ? <ChevronDown className="h-3 w-3" aria-hidden /> : <ChevronRight className="h-3 w-3" aria-hidden />}
              {String(d.raw.memberCount)}
            </span>
          )}
        </div>
        {lead && (
          <div className="flex items-center gap-1.5 text-[11.5px] text-muted">
            <Avatar name={lead.name} hue={lead.avatarHue} size="xs" className="ring-1" /> {lead.name} · lead
          </div>
        )}
      </div>
    </Shell>
  );
});
TeamNode.displayName = "TeamNode";

export const PersonNode = memo(({ data }: NodeProps) => {
  const d = data as MapNodeData;
  return (
    <Shell data={d}>
      <div className="flex h-full items-center gap-2.5 px-3">
        <Avatar name={d.label} hue={Number(d.raw.avatarHue ?? 210)} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{d.label}</p>
          <p className="truncate text-[11.5px] text-muted">{String(d.raw.title ?? "")}</p>
        </div>
        {Number(d.raw.directReports ?? 0) > 0 && <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-deep" title="Direct reports">{String(d.raw.directReports)}</span>}
      </div>
    </Shell>
  );
});
PersonNode.displayName = "PersonNode";

export const GoalNode = memo(({ data }: NodeProps) => {
  const d = data as MapNodeData;
  const progress = d.raw.progress as number | null;
  return (
    <Shell data={d} className="border-violet/25 bg-gradient-to-br from-white to-violet-soft/70">
      <div className="flex h-full flex-col justify-center gap-1.5 px-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-violet" aria-hidden />
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug">{d.label}</p>
        </div>
        <div className="flex items-center gap-2 text-[11.5px] text-muted">
          <span>{String(d.raw.period ?? "Company goal")}</span>·<span>{String(d.raw.projectCount ?? 0)} projects</span>
          {Number(d.raw.atRisk ?? 0) > 0 && <span className="font-medium text-warning">· {String(d.raw.atRisk)} at risk</span>}
          {progress !== null && progress !== undefined && <span className="ml-auto tabular-nums">{progress}%</span>}
        </div>
      </div>
    </Shell>
  );
});
GoalNode.displayName = "GoalNode";

export const InitiativeNode = memo(({ data }: NodeProps) => {
  const d = data as MapNodeData;
  return (
    <Shell data={d}>
      <div className="flex h-full flex-col justify-center gap-1 px-4">
        <div className="flex items-center gap-2">
          <Flag className="h-3.5 w-3.5 text-brand" aria-hidden />
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug">{d.label}</p>
        </div>
        <p className="text-[11.5px] text-muted">Initiative · {String(d.raw.projectCount ?? 0)} projects{d.raw.progress !== null && d.raw.progress !== undefined ? ` · ${String(d.raw.progress)}%` : ""}</p>
      </div>
    </Shell>
  );
});
InitiativeNode.displayName = "InitiativeNode";

export const ProjectNode = memo(({ data }: NodeProps) => {
  const d = data as MapNodeData;
  const health = String(d.raw.health ?? "NOT_STARTED");
  const progress = d.raw.computedProgress as number | null;
  return (
    <Shell data={d}>
      <div className="flex h-full flex-col justify-center gap-1.5 px-3.5">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-3.5 w-3.5 text-muted" aria-hidden />
          <span className="font-mono text-[10.5px] text-muted">{String(d.raw.key ?? "")}</span>
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{d.label}</p>
          {d.raw.access === "summary" && <span title="Summary view only"><Eye className="h-3.5 w-3.5 text-faint" aria-label="Summary view only" /></span>}
        </div>
        <div className="flex items-center gap-2 text-[11.5px]">
          <span className={cn("h-2 w-2 rounded-full", HEALTH_DOT[health])} aria-hidden />
          <span className="font-medium">{label(health)}</span>
          <span className="text-muted">· {label(String(d.raw.status ?? ""))}</span>
          {Number(d.raw.openBlockers ?? 0) > 0 && <span className="ml-auto rounded bg-danger-soft px-1 text-[10.5px] font-semibold text-danger">{String(d.raw.openBlockers)} blocker{Number(d.raw.openBlockers) > 1 ? "s" : ""}</span>}
        </div>
        {progress !== null && progress !== undefined && (
          <div className="h-1 overflow-hidden rounded-full bg-subtle" aria-hidden>
            <div className={cn("h-full rounded-full", HEALTH_DOT[health])} style={{ width: `${Math.max(3, progress)}%` }} />
          </div>
        )}
      </div>
    </Shell>
  );
});
ProjectNode.displayName = "ProjectNode";

export const MilestoneNode = memo(({ data }: NodeProps) => {
  const d = data as MapNodeData;
  const done = d.raw.status === "DONE";
  return (
    <Shell data={d} className={done ? "bg-success-soft/40" : undefined}>
      <div className="flex h-full items-center gap-2 px-3">
        <Diamond className={cn("h-3.5 w-3.5 shrink-0", done ? "text-success" : d.raw.isCritical ? "text-danger" : "text-brand")} aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium">{d.label}</p>
          <p className="text-[11px] text-muted">{label(String(d.raw.status))}{d.raw.dueDate ? ` · ${new Date(String(d.raw.dueDate)).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}{d.raw.isCritical ? " · critical" : ""}</p>
        </div>
      </div>
    </Shell>
  );
});
MilestoneNode.displayName = "MilestoneNode";

export const NODE_TYPES = {
  company: CompanyNode,
  department: DepartmentNode,
  team: TeamNode,
  person: PersonNode,
  goal: GoalNode,
  initiative: InitiativeNode,
  project: ProjectNode,
  milestone: MilestoneNode,
};

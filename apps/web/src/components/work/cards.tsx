"use client";

import { label } from "@workmesh/core";
import { CheckCheck, HelpCircle, MessageSquare, OctagonAlert, Pencil } from "lucide-react";
import Link from "next/link";
import { api, useAction } from "@/lib/hooks";
import type { Blocker, ProjectSummary, Update } from "@/lib/types";
import { cn, day, relative } from "@/lib/utils";
import { Avatar, PersonChip } from "../ui/avatar";
import { AccessBadge, Badge, HealthBadge, SeverityBadge, StatusBadge, VisibilityBadge } from "../ui/badges";
import { Button } from "../ui/button";
import { healthTone, ProgressBar } from "../ui/feedback";

export function ProjectRow({ p, compact }: { p: ProjectSummary; compact?: boolean }) {
  return (
    <Link href={`/projects/${p.id}`} className="group grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-subtle/70 sm:grid-cols-[minmax(0,1fr)_120px_140px_auto]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-muted">{p.key}</span>
          <span className="truncate text-[13.5px] font-medium text-ink group-hover:text-brand-deep">{p.name}</span>
          <AccessBadge access={p.access} />
        </div>
        {!compact && <p className="mt-0.5 truncate text-[12px] text-muted">{p.owningTeam?.name ?? "No team"} · {p.lead?.name ?? "No lead"}{p.targetDate ? ` · target ${day(p.targetDate)}` : ""}</p>}
      </div>
      <div className="hidden sm:block"><ProgressBar value={p.computedProgress} tone={healthTone(p.health)} label={`${p.name} computed progress`} /></div>
      <div className="hidden justify-end sm:flex"><HealthBadge health={p.health} reasons={p.healthReasons} /></div>
      <div className="flex justify-end"><StatusBadge status={p.status} /></div>
    </Link>
  );
}

export function UpdateCard({ u, showProject = true }: { u: Update; showProject?: boolean }) {
  const ack = useAction(() => api.post(`/updates/${u.id}/acknowledge`), { success: "Acknowledged", invalidate: ["/updates", "/dashboard"] });
  return (
    <article className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <header className="flex items-start gap-3">
        <Avatar name={u.author?.name} hue={u.author?.avatarHue} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {u.author && <Link href={`/people/${u.author.id}`} className="text-[13.5px] font-semibold hover:underline">{u.author.name}</Link>}
            <span className="text-[12px] text-muted">{u.status === "DRAFT" ? "Draft" : relative(u.publishedAt)}{u.editedAt ? " · edited" : ""}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={u.stage === "BLOCKED" ? "danger" : u.stage === "COMPLETED" ? "success" : u.stage === "TESTING" || u.stage === "REVIEW" ? "violet" : "brand"}>{label(u.stage)}</Badge>
            {showProject && u.project && <Link href={`/projects/${u.project.id}`}><Badge tone="neutral">{u.project.name}</Badge></Link>}
            {u.milestone && <Badge tone="neutral">◆ {u.milestone.title}</Badge>}
            <VisibilityBadge visibility={u.visibility} />
          </div>
        </div>
      </header>
      <Link href={`/updates/${u.id}`} className="mt-3 block space-y-1.5 text-[13.5px]">
        <p className="font-medium text-ink">{u.currentFocus}</p>
        {u.completed && <p className="text-ink-soft"><span className="font-medium text-muted">Done: </span>{u.completed}</p>}
        {u.nextSteps && <p className="text-ink-soft"><span className="font-medium text-muted">Next: </span>{u.nextSteps}</p>}
      </Link>
      {u.helpNeeded && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-ink">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span><strong className="font-medium">Help needed{u.helpFrom ? ` from ${u.helpFrom.name}` : ""}:</strong> {u.helpNeeded}</span>
        </p>
      )}
      <footer className="mt-3 flex items-center gap-3 text-[12px] text-muted">
        {u.confidence && <span title="Self-reported confidence in the next milestone">Confidence {u.confidence}/5</span>}
        <Link href={`/updates/${u.id}`} className="flex items-center gap-1 hover:text-ink"><MessageSquare className="h-3.5 w-3.5" aria-hidden /> {u.commentCount}</Link>
        <span className="flex items-center gap-1"><CheckCheck className="h-3.5 w-3.5" aria-hidden /> {u.ackCount}</span>
        <span className="ml-auto flex gap-1">
          {u.isMine ? (
            <Link href={`/updates/${u.id}?edit=1`} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-subtle hover:text-ink"><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</Link>
          ) : (
            u.status === "PUBLISHED" && (
              <Button size="xs" variant={u.acknowledgedByMe ? "ghost" : "secondary"} disabled={u.acknowledgedByMe} loading={ack.isPending} onClick={() => ack.mutate(undefined)}>
                <CheckCheck className="h-3.5 w-3.5" /> {u.acknowledgedByMe ? "Acknowledged" : "Acknowledge"}
              </Button>
            )
          )}
        </span>
      </footer>
    </article>
  );
}

export function BlockerRow({ b, showReporter = true }: { b: Blocker; showReporter?: boolean }) {
  return (
    <Link href={`/blockers/${b.id}`} className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-subtle/70">
      <OctagonAlert className={cn("mt-0.5 h-4 w-4 shrink-0", b.state === "RESOLVED" ? "text-success" : b.severity === "CRITICAL" || b.severity === "HIGH" ? "text-danger" : "text-warning")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium">{b.title}</p>
        <p className="mt-0.5 truncate text-[12px] text-muted">
          {b.project?.name ?? "No project"}
          {showReporter && b.reporter ? ` · reported by ${b.reporter.name}` : ""} · {b.owner ? `owner ${b.owner.name}` : "no owner yet"} · {b.ageDays === 0 ? "today" : `${b.ageDays}d`}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
        <SeverityBadge severity={b.severity} />
        <StatusBadge status={b.state} />
      </div>
    </Link>
  );
}

export { PersonChip };

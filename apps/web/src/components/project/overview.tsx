"use client";

import { allowedTransitions, label, type ProjectStatus } from "@workmesh/core";
import { Info, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, useAction } from "@/lib/hooks";
import type { ProjectDetail } from "@/lib/types";
import { day, relative } from "@/lib/utils";
import { PersonChip } from "../ui/avatar";
import { Badge, HealthBadge, StatusBadge, VisibilityBadge } from "../ui/badges";
import { Button } from "../ui/button";
import { Card, CardBody, CardHeader } from "../ui/card";
import { healthTone, ProgressBar } from "../ui/feedback";
import { Field, Input, Select, Textarea } from "../ui/form";
import { Dialog } from "../ui/overlay";
import { isoDate, nn, PersonSelect, TeamSelect } from "../work/pickers";

export function ProjectOverview({ p }: { p: ProjectDetail }) {
  const [editing, setEditing] = useState(false);
  const [progress, setProgress] = useState(String(p.reportedProgress ?? ""));
  const transition = useAction((to: ProjectStatus) => api.post(`/projects/${p.id}/status`, { status: to, version: p.version }), { success: "Status updated", invalidate: ["/projects", "/roadmap", "/dashboard", "/goals", "/graph"] });
  const report = useAction(() => api.post(`/projects/${p.id}/progress`, { reportedProgress: Number(progress) }), { success: "Progress estimate recorded", invalidate: ["/projects"] });
  const next = allowedTransitions("project", p.status) as ProjectStatus[];
  const basis = { milestones: "weighted share of completed milestones (critical milestones count double)", work_items: "share of completed work items (this project has no milestones)", none: "not enough data yet" }[p.progressBasis];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="Health & progress" description="Derived from milestones, blockers, dates and dependencies — never from activity." />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><HealthBadge health={p.health} /><StatusBadge status={p.status} /></div>
            <ul className="space-y-1 text-[13px] text-slate-600">
              {p.healthReasons.map((r) => <li key={r} className="flex gap-2"><span className="text-faint">•</span>{r}</li>)}
            </ul>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 flex items-center gap-1 text-[12px] font-medium text-muted">Computed progress <span title={`Computed as the ${basis}.`}><Info className="h-3 w-3" aria-label={`Computed as the ${basis}.`} /></span></p>
                <ProgressBar value={p.computedProgress} tone={healthTone(p.health)} label="Computed progress" />
                <p className="mt-1 text-[11.5px] text-muted">{basis}</p>
              </div>
              <div>
                <p className="mb-1 text-[12px] font-medium text-muted">Owner-reported estimate</p>
                {p.reportedProgress !== null ? <ProgressBar value={p.reportedProgress} tone="brand" label="Reported progress" /> : <p className="text-[12.5px] text-faint">Not reported</p>}
                {p.reportedAt && <p className="mt-1 text-[11.5px] text-muted">Reported {relative(p.reportedAt)}</p>}
                {p.canEdit && (
                  <div className="mt-2 flex gap-2">
                    <Input type="number" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} className="h-8 w-20" aria-label="Reported progress percent" />
                    <Button size="sm" disabled={progress === "" || Number(progress) < 0 || Number(progress) > 100} loading={report.isPending} onClick={() => report.mutate(undefined)}>Record estimate</Button>
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13px] sm:grid-cols-4">
              <div><p className="text-[12px] text-muted">Milestones</p><p className="font-medium tabular-nums">{p.milestones?.done ?? 0} / {p.milestones?.total ?? 0}</p></div>
              <div><p className="text-[12px] text-muted">Work items done</p><p className="font-medium tabular-nums">{p.workItems ? `${p.workItems.done} / ${p.workItems.total - p.workItems.cancelled}` : "—"}</p></div>
              <div><p className="text-[12px] text-muted">Open blockers</p><p className="font-medium tabular-nums">{p.openBlockers}</p></div>
              <div><p className="text-[12px] text-muted">Next milestone</p><p className="truncate font-medium">{p.milestones?.nextDue ? `${p.milestones.nextDue.title} · ${day(p.milestones.nextDue.dueDate)}` : "—"}</p></div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="About" action={p.canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>} />
          <CardBody>
            <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-slate-700">{p.description || p.summary || "No description yet."}</p>
          </CardBody>
        </Card>
      </div>
      <aside className="space-y-5">
        <Card>
          <CardBody className="space-y-3 pt-4 text-[13px]">
            <div><p className="mb-1 text-[12px] text-muted">Lead</p><PersonChip person={p.lead} /></div>
            <div><p className="text-[12px] text-muted">Owning team</p>{p.owningTeam ? <Link className="font-medium hover:text-brand-deep" href={`/teams/${p.owningTeam.id}`}>{p.owningTeam.name}</Link> : "—"}</div>
            <div><p className="text-[12px] text-muted">Supports</p>{p.initiative ? <Link className="font-medium hover:text-brand-deep" href={`/initiatives/${p.initiative.id}`}>{p.initiative.title}</Link> : <span className="text-muted">Not aligned to a goal</span>}</div>
            <div className="grid grid-cols-2 gap-2"><div><p className="text-[12px] text-muted">Start</p><p className="font-medium">{day(p.startDate, true)}</p></div><div><p className="text-[12px] text-muted">Target</p><p className="font-medium">{day(p.targetDate, true)}</p></div></div>
            <div className="flex flex-wrap gap-1.5"><VisibilityBadge visibility={p.visibility} /><Badge>{label(p.priority)} priority</Badge></div>
          </CardBody>
        </Card>
        {p.canEdit && (
          <Card>
            <CardHeader title="Move status" description="Only valid transitions are offered." />
            <CardBody className="flex flex-wrap gap-2">
              {next.length === 0 ? <p className="text-[13px] text-muted">No transitions available.</p> : next.map((s) => (
                <Button key={s} size="sm" variant={s === "BLOCKED" || s === "CANCELLED" ? "secondary" : "soft"} loading={transition.isPending && transition.variables === s} onClick={() => transition.mutate(s)}>→ {label(s)}</Button>
              ))}
            </CardBody>
          </Card>
        )}
      </aside>
      <EditProject p={p} open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}

function EditProject({ p, open, onClose }: { p: ProjectDetail; open: boolean; onClose: () => void }) {
  const [v, setV] = useState({ name: p.name, summary: p.summary ?? "", description: p.description ?? "", targetDate: p.targetDate?.slice(0, 10) ?? "", startDate: p.startDate?.slice(0, 10) ?? "", leadId: p.lead?.id ?? "", owningTeamId: p.owningTeam?.id ?? "", visibility: p.visibility, discoverable: String(p.discoverable) });
  const save = useAction(
    () => {
      const body: Record<string, unknown> = { version: p.version, name: v.name, summary: nn(v.summary), description: nn(v.description), targetDate: isoDate(v.targetDate), startDate: isoDate(v.startDate) };
      if (p.canManage) Object.assign(body, { leadId: nn(v.leadId), owningTeamId: nn(v.owningTeamId), visibility: v.visibility, discoverable: v.discoverable === "true" });
      return api.patch(`/projects/${p.id}`, body);
    },
    { success: "Project saved", invalidate: ["/projects", "/roadmap", "/graph"], onSuccess: onClose },
  );
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Edit project" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name" htmlFor="ep-name"><Input id="ep-name" value={v.name} onChange={set("name")} /></Field>
        <Field label="Summary" htmlFor="ep-sum" hint="Visible to anyone who can see the project summary."><Input id="ep-sum" value={v.summary} onChange={set("summary")} /></Field>
        <Field label="Description" htmlFor="ep-desc"><Textarea id="ep-desc" rows={4} value={v.description} onChange={set("description")} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Start" htmlFor="ep-start"><Input id="ep-start" type="date" value={v.startDate} onChange={set("startDate")} /></Field>
          <Field label="Target" htmlFor="ep-target"><Input id="ep-target" type="date" value={v.targetDate} onChange={set("targetDate")} /></Field>
        </div>
        {p.canManage ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Lead" htmlFor="ep-lead"><PersonSelect id="ep-lead" value={v.leadId} onChange={set("leadId")} /></Field>
            <Field label="Owning team" htmlFor="ep-team"><TeamSelect id="ep-team" value={v.owningTeamId} onChange={set("owningTeamId")} /></Field>
            <Field label="Visibility" htmlFor="ep-vis"><Select id="ep-vis" value={v.visibility} onChange={set("visibility")}>{["ORG", "TEAM", "PROJECT_MEMBERS", "RESTRICTED"].map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select></Field>
            <Field label="Discoverable summary" htmlFor="ep-disc"><Select id="ep-disc" value={v.discoverable} onChange={set("discoverable")}><option value="true">Yes</option><option value="false">No</option></Select></Field>
          </div>
        ) : <p className="text-[12.5px] text-muted">Only the project lead can change ownership and visibility.</p>}
      </div>
    </Dialog>
  );
}

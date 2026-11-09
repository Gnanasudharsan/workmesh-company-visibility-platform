"use client";

import { allowedTransitions, label, PRIORITIES, WORK_ITEM_STATUSES, type WorkItemStatus } from "@workmesh/core";
import { Diamond, Plus } from "lucide-react";
import { useState } from "react";
import { api, useAction, useApi } from "@/lib/hooks";
import type { Milestone, ProjectDetail, WorkItem } from "@/lib/types";
import { cn, day, daysUntil, relative } from "@/lib/utils";
import { Avatar, PersonChip } from "../ui/avatar";
import { Badge, StatusBadge } from "../ui/badges";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { EmptyState, ErrorState, LoadingCards } from "../ui/feedback";
import { Field, Input, Select, Textarea } from "../ui/form";
import { Dialog, Sheet } from "../ui/overlay";
import { isoDate, nn, PersonSelect } from "../work/pickers";

const COLUMNS: WorkItemStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"];

export function WorkTab({ p, openItemId, onOpenItem }: { p: ProjectDetail; openItemId: string | null; onOpenItem: (id: string | null) => void }) {
  const { data, error, isLoading, refetch } = useApi<WorkItem[]>(`/projects/${p.id}/work-items`);
  const [adding, setAdding] = useState(false);
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !data) return <LoadingCards count={2} />;
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] text-muted">{data.length} work items · {data.filter((w) => w.status === "DONE").length} done</p>
        {p.canEdit && <Button size="sm" variant="primary" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add work item</Button>}
      </div>
      <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-5">
        {COLUMNS.map((col) => {
          const items = data.filter((w) => w.status === col);
          return (
            <section key={col} aria-label={label(col)} className="min-w-[220px] rounded-xl bg-subtle/60 p-2">
              <h3 className="flex items-center justify-between px-1.5 pb-2 text-[12px] font-semibold text-muted">{label(col)} <span className="tabular-nums">{items.length}</span></h3>
              <div className="space-y-2">
                {items.map((w) => {
                  const due = daysUntil(w.dueDate);
                  return (
                    <button key={w.id} onClick={() => onOpenItem(w.id)} className="w-full rounded-lg border border-line bg-surface p-2.5 text-left shadow-card hover:border-line-strong">
                      <p className="text-[13px] font-medium leading-snug">{w.title}</p>
                      <div className="mt-2 flex items-center gap-2">
                        {w.assignee ? <Avatar name={w.assignee.name} hue={w.assignee.avatarHue} size="xs" /> : <span className="h-5 w-5 rounded-full border border-dashed border-line-strong" aria-label="Unassigned" />}
                        {w.priority === "HIGH" || w.priority === "URGENT" ? <Badge tone="warning">{label(w.priority)}</Badge> : null}
                        {w.dueDate && w.status !== "DONE" && <span className={cn("ml-auto text-[11px]", due !== null && due < 0 ? "font-medium text-danger" : "text-muted")}>{day(w.dueDate)}</span>}
                      </div>
                    </button>
                  );
                })}
                {items.length === 0 && <p className="px-1.5 py-3 text-center text-[12px] text-faint">Empty</p>}
              </div>
            </section>
          );
        })}
      </div>
      <WorkItemSheet id={openItemId} project={p} onClose={() => onOpenItem(null)} />
      <AddWorkItem open={adding} onClose={() => setAdding(false)} p={p} />
    </>
  );
}

function WorkItemSheet({ id, project, onClose }: { id: string | null; project: ProjectDetail; onClose: () => void }) {
  const { data: w } = useApi<WorkItem & { history: Array<{ id: string; field: string; fromValue: string | null; toValue: string | null; createdAt: string }> }>(id ? `/work-items/${id}` : null);
  const update = useAction((body: Record<string, unknown>) => api.patch(`/work-items/${id}`, { ...body, version: w!.version }), { success: "Saved", invalidate: ["/work-items", "/projects", "/dashboard", "/roadmap"] });
  const del = useAction(() => api.del(`/work-items/${id}`), { success: "Work item deleted", invalidate: ["/projects", "/work-items"], onSuccess: onClose });
  const next = w ? (allowedTransitions("workItem", w.status) as WorkItemStatus[]) : [];
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()} title={w?.title ?? "Work item"} description={w ? `${project.name} · ${w.milestone ? `◆ ${w.milestone.title}` : "No milestone"}` : undefined}>
      {w && (
        <div className="space-y-5 text-[13px]">
          <div className="flex items-center gap-2"><StatusBadge status={w.status} /><Badge>{label(w.priority)}</Badge></div>
          {w.description && <p className="whitespace-pre-line text-slate-700">{w.description}</p>}
          <div>
            <p className="mb-1.5 text-[12px] font-medium text-muted">Move to</p>
            <div className="flex flex-wrap gap-1.5">{next.map((s) => <Button key={s} size="xs" variant="soft" loading={update.isPending} onClick={() => update.mutate({ status: s })}>{label(s)}</Button>)}</div>
          </div>
          <div className="grid gap-3">
            <Field label="Assignee" htmlFor="wi-assignee"><PersonSelect id="wi-assignee" value={w.assignee?.id ?? ""} onChange={(e) => update.mutate({ assigneeId: nn(e.target.value) })} disabled={!project.canEdit} /></Field>
            <Field label="Milestone" htmlFor="wi-ms">
              <Select id="wi-ms" value={w.milestoneId ?? ""} onChange={(e) => update.mutate({ milestoneId: nn(e.target.value) })} disabled={!project.canEdit}>
                <option value="">No milestone</option>{project.milestoneList.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Due" htmlFor="wi-due"><Input id="wi-due" type="date" defaultValue={w.dueDate?.slice(0, 10) ?? ""} onBlur={(e) => e.target.value !== (w.dueDate?.slice(0, 10) ?? "") && update.mutate({ dueDate: isoDate(e.target.value) })} disabled={!project.canEdit} /></Field>
              <Field label="Priority" htmlFor="wi-pri"><Select id="wi-pri" value={w.priority} onChange={(e) => update.mutate({ priority: e.target.value })} disabled={!project.canEdit}>{PRIORITIES.map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select></Field>
            </div>
          </div>
          <div>
            <p className="mb-2 text-[12px] font-medium text-muted">History</p>
            <ol className="space-y-1.5 border-l border-line pl-3">
              {w.history.map((h) => <li key={h.id} className="text-[12px] text-slate-600"><span className="font-medium">{label(h.field)}</span>: {h.fromValue ? label(h.fromValue) : "—"} → {h.toValue ? label(h.toValue) : "—"} <span className="text-faint">· {relative(h.createdAt)}</span></li>)}
              {w.history.length === 0 && <li className="text-[12px] text-faint">No changes recorded yet.</li>}
            </ol>
          </div>
          {project.canEdit && <Button variant="ghost" size="sm" className="text-danger" onClick={() => confirm("Delete this work item? This cannot be undone.") && del.mutate(undefined)}>Delete work item</Button>}
        </div>
      )}
    </Sheet>
  );
}

function AddWorkItem({ open, onClose, p }: { open: boolean; onClose: () => void; p: ProjectDetail }) {
  const [v, setV] = useState({ title: "", description: "", assigneeId: "", milestoneId: "", priority: "MEDIUM", dueDate: "" });
  const create = useAction(() => api.post(`/projects/${p.id}/work-items`, { title: v.title, description: nn(v.description), assigneeId: nn(v.assigneeId), milestoneId: nn(v.milestoneId), priority: v.priority, dueDate: isoDate(v.dueDate) }), {
    success: "Work item added",
    invalidate: ["/projects", "/work-items", "/dashboard"],
    onSuccess: () => (setV({ title: "", description: "", assigneeId: "", milestoneId: "", priority: "MEDIUM", dueDate: "" }), onClose()),
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Add work item" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={v.title.trim().length < 2} loading={create.isPending} onClick={() => create.mutate(undefined)}>Add</Button></>}>
      <div className="space-y-3">
        <Field label="Title" htmlFor="aw-title" required><Input id="aw-title" value={v.title} onChange={set("title")} autoFocus /></Field>
        <Field label="Description" htmlFor="aw-desc"><Textarea id="aw-desc" value={v.description} onChange={set("description")} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Assignee" htmlFor="aw-as"><PersonSelect id="aw-as" value={v.assigneeId} onChange={set("assigneeId")} /></Field>
          <Field label="Milestone" htmlFor="aw-ms"><Select id="aw-ms" value={v.milestoneId} onChange={set("milestoneId")}><option value="">None</option>{p.milestoneList.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</Select></Field>
          <Field label="Priority" htmlFor="aw-pri"><Select id="aw-pri" value={v.priority} onChange={set("priority")}>{PRIORITIES.map((x) => <option key={x} value={x}>{label(x)}</option>)}</Select></Field>
          <Field label="Due" htmlFor="aw-due"><Input id="aw-due" type="date" value={v.dueDate} onChange={set("dueDate")} /></Field>
        </div>
      </div>
    </Dialog>
  );
}

export function MilestonesTab({ p }: { p: ProjectDetail }) {
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState({ title: "", dueDate: "", ownerId: "", isCritical: false });
  const create = useAction(() => api.post(`/projects/${p.id}/milestones`, { title: v.title, dueDate: isoDate(v.dueDate), ownerId: nn(v.ownerId), isCritical: v.isCritical }), { success: "Milestone added", invalidate: ["/projects", "/roadmap"], onSuccess: () => (setAdding(false), setV({ title: "", dueDate: "", ownerId: "", isCritical: false })) });
  const move = useAction(({ m, status }: { m: Milestone; status: string }) => api.patch(`/milestones/${m.id}`, { status, version: m.version }), { success: "Milestone updated", invalidate: ["/projects", "/roadmap", "/dashboard", "/graph"] });
  return (
    <Card className="p-2">
      <div className="flex items-center justify-between px-3 py-2">
        <p className="text-[13px] text-muted">Critical milestones dominate project health.</p>
        {p.canEdit && <Button size="sm" variant="primary" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add milestone</Button>}
      </div>
      {p.milestoneList.length === 0 ? <EmptyState title="No milestones yet" description="Milestones make progress measurable." /> : (
        <ol>
          {p.milestoneList.map((m) => {
            const d = daysUntil(m.dueDate);
            const next = allowedTransitions("milestone", m.status);
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-subtle/60">
                <Diamond className={cn("h-4 w-4", m.status === "DONE" ? "text-success" : m.isCritical ? "text-danger" : "text-brand")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <a href={`/milestones/${m.id}`} className="text-[13.5px] font-medium hover:text-brand-deep">{m.title}</a>
                  <p className="text-[12px] text-muted">{m.dueDate ? (m.status !== "DONE" && d !== null && d < 0 ? <span className="font-medium text-danger">{-d} days overdue</span> : `Due ${day(m.dueDate, true)}`) : "No date"}{m.isCritical ? " · critical" : ""}{m.completedAt ? ` · completed ${day(m.completedAt)}` : ""}</p>
                </div>
                {m.owner && <PersonChip person={m.owner} sub={null} size="xs" />}
                <StatusBadge status={m.status} />
                {p.canEdit && (
                  <Select aria-label={`Move ${m.title}`} className="h-8 w-auto text-[12.5px]" value="" onChange={(e) => e.target.value && move.mutate({ m, status: e.target.value })}>
                    <option value="">Move…</option>{next.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                  </Select>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <Dialog open={adding} onOpenChange={setAdding} title="Add milestone" footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" disabled={v.title.trim().length < 2} loading={create.isPending} onClick={() => create.mutate(undefined)}>Add</Button></>}>
        <div className="space-y-3">
          <Field label="Title" htmlFor="am-title" required><Input id="am-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} autoFocus /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Due" htmlFor="am-due"><Input id="am-due" type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} /></Field>
            <Field label="Owner" htmlFor="am-owner"><PersonSelect id="am-owner" value={v.ownerId} onChange={(e) => setV({ ...v, ownerId: e.target.value })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-[var(--color-brand)]" checked={v.isCritical} onChange={(e) => setV({ ...v, isCritical: e.target.checked })} /> Critical milestone (an overdue critical milestone makes the project off track)</label>
        </div>
      </Dialog>
    </Card>
  );
}

export const STATUS_OPTIONS = WORK_ITEM_STATUSES;

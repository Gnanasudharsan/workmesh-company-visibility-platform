"use client";

import { PRIORITIES, RESOURCE_VISIBILITIES, label } from "@workmesh/core";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { api, useAction, useApi } from "@/lib/hooks";
import { Button } from "../ui/button";
import { Field, Input, Select, Textarea } from "../ui/form";
import { Dialog } from "../ui/overlay";
import { isoDate, nn, PersonSelect, ProjectSelect, TeamSelect, usePeople } from "./pickers";

export type CreateKind = "blocker" | "project" | "meeting" | "goal" | "initiative";

export function CreateDialogs({ kind, onClose, defaults }: { kind: CreateKind | null; onClose: () => void; defaults?: Record<string, string> }) {
  return (
    <>
      <BlockerDialog open={kind === "blocker"} onClose={onClose} projectId={defaults?.projectId} />
      <ProjectDialog open={kind === "project"} onClose={onClose} initiativeId={defaults?.initiativeId} />
      <MeetingDialog open={kind === "meeting"} onClose={onClose} />
      <GoalDialog open={kind === "goal" || kind === "initiative"} kind={kind === "initiative" ? "initiative" : "goal"} goalId={defaults?.goalId} onClose={onClose} />
    </>
  );
}

function BlockerDialog({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId?: string }) {
  const router = useRouter();
  const { register, handleSubmit, reset, formState } = useForm({ defaultValues: { title: "", description: "", projectId: projectId ?? "", severity: "MEDIUM", ownerId: "", targetDate: "", visibility: "PROJECT" } });
  useEffect(() => {
    if (open) reset({ title: "", description: "", projectId: projectId ?? "", severity: "MEDIUM", ownerId: "", targetDate: "", visibility: projectId ? "PROJECT" : "MANAGER" });
  }, [open, projectId, reset]);
  const create = useAction(
    (v: Record<string, string>) =>
      api.post<{ id: string }>("/blockers", { title: v.title, description: nn(v.description), projectId: nn(v.projectId), severity: v.severity, ownerId: nn(v.ownerId), targetDate: isoDate(v.targetDate), visibility: v.projectId ? v.visibility : v.visibility === "PROJECT" ? "MANAGER" : v.visibility }),
    { success: "Blocker reported — your manager can see it now", invalidate: ["/blockers", "/dashboard", "/projects"], onSuccess: (r) => (onClose(), router.push(`/blockers/${r.id}`)) },
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Report a blocker" description="Make it visible so the right person can help." footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={handleSubmit((v) => create.mutate(v))}>Report blocker</Button></>}>
      <form className="space-y-3" onSubmit={handleSubmit((v) => create.mutate(v))}>
        <Field label="What's blocking progress?" htmlFor="b-title" required error={formState.errors.title && "Give the blocker a short title"}>
          <Input id="b-title" placeholder="e.g. Sandbox credentials not provided" {...register("title", { required: true, minLength: 3 })} autoFocus />
        </Field>
        <Field label="Details" htmlFor="b-desc"><Textarea id="b-desc" rows={3} {...register("description")} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Project" htmlFor="b-project"><ProjectSelect id="b-project" {...register("projectId")} /></Field>
          <Field label="Severity" htmlFor="b-sev">
            <Select id="b-sev" {...register("severity")}>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
          </Field>
          <Field label="Owner (optional)" htmlFor="b-owner" hint="Who can resolve it?"><PersonSelect id="b-owner" {...register("ownerId")} /></Field>
          <Field label="Needed by" htmlFor="b-date"><Input id="b-date" type="date" {...register("targetDate")} /></Field>
        </div>
        <Field label="Who can see this" htmlFor="b-vis">
          <Select id="b-vis" {...register("visibility")}>{["PROJECT", "MANAGER", "TEAM", "ORG"].map((v) => <option key={v} value={v}>{label(v)}</option>)}</Select>
        </Field>
      </form>
    </Dialog>
  );
}

function ProjectDialog({ open, onClose, initiativeId }: { open: boolean; onClose: () => void; initiativeId?: string }) {
  const router = useRouter();
  const { data: goals } = useApi<{ goals: Array<{ title: string; initiatives: Array<{ id: string; title: string }> }>; unalignedInitiatives: Array<{ id: string; title: string }> }>(open ? "/goals" : null);
  const { register, handleSubmit, reset, formState } = useForm({ defaultValues: { name: "", summary: "", initiativeId: initiativeId ?? "", owningTeamId: "", priority: "MEDIUM", startDate: "", targetDate: "", visibility: "ORG", discoverable: "true" } });
  useEffect(() => {
    if (open) reset({ name: "", summary: "", initiativeId: initiativeId ?? "", owningTeamId: "", priority: "MEDIUM", startDate: "", targetDate: "", visibility: "ORG", discoverable: "true" });
  }, [open, initiativeId, reset]);
  const create = useAction(
    (v: Record<string, string>) =>
      api.post<{ id: string }>("/projects", { name: v.name, summary: nn(v.summary), initiativeId: nn(v.initiativeId), owningTeamId: nn(v.owningTeamId), priority: v.priority, startDate: isoDate(v.startDate), targetDate: isoDate(v.targetDate), visibility: v.visibility, discoverable: v.discoverable === "true" }),
    { success: "Project created", invalidate: ["/projects", "/goals", "/roadmap", "/graph"], onSuccess: (r) => (onClose(), router.push(`/projects/${r.id}`)) },
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="New project" description="You'll be the lead. Connect it to a company goal so everyone sees why it matters." footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={handleSubmit((v) => create.mutate(v))}>Create project</Button></>}>
      <form className="space-y-3" onSubmit={handleSubmit((v) => create.mutate(v))}>
        <Field label="Name" htmlFor="p-name" required error={formState.errors.name && "Name is required"}><Input id="p-name" {...register("name", { required: true, minLength: 2 })} autoFocus /></Field>
        <Field label="One-line summary" htmlFor="p-sum" hint="Shown to people who can only see the project's summary."><Input id="p-sum" {...register("summary")} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Supports initiative" htmlFor="p-init">
            <Select id="p-init" {...register("initiativeId")}>
              <option value="">Not aligned yet</option>
              {goals?.goals.map((g) => (
                <optgroup key={g.title} label={g.title}>{g.initiatives.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}</optgroup>
              ))}
              {goals?.unalignedInitiatives.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
            </Select>
          </Field>
          <Field label="Owning team" htmlFor="p-team"><TeamSelect id="p-team" {...register("owningTeamId")} /></Field>
          <Field label="Start" htmlFor="p-start"><Input id="p-start" type="date" {...register("startDate")} /></Field>
          <Field label="Target" htmlFor="p-target"><Input id="p-target" type="date" {...register("targetDate")} /></Field>
          <Field label="Priority" htmlFor="p-pri"><Select id="p-pri" {...register("priority")}>{PRIORITIES.map((p) => <option key={p} value={p}>{label(p)}</option>)}</Select></Field>
          <Field label="Visibility" htmlFor="p-vis"><Select id="p-vis" {...register("visibility")}>{RESOURCE_VISIBILITIES.map((v) => <option key={v} value={v}>{label(v)}</option>)}</Select></Field>
        </div>
        <Field label="Discoverable summary" htmlFor="p-disc" hint="For team/members-only projects: may others see the name, status and owner?">
          <Select id="p-disc" {...register("discoverable")}><option value="true">Yes — show a limited summary</option><option value="false">No — invisible to non-members</option></Select>
        </Field>
      </form>
    </Dialog>
  );
}

function MeetingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { data: people } = usePeople();
  const { register, handleSubmit, reset, watch, setValue } = useForm<{ title: string; date: string; time: string; duration: string; recurrence: string; projectId: string; teamId: string; participants: string[]; agenda: string; visibility: string }>({
    defaultValues: { title: "", date: "", time: "10:00", duration: "30", recurrence: "NONE", projectId: "", teamId: "", participants: [], agenda: "", visibility: "PARTICIPANTS" },
  });
  useEffect(() => {
    if (open) reset({ title: "", date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), time: "10:00", duration: "30", recurrence: "NONE", projectId: "", teamId: "", participants: [], agenda: "", visibility: "PARTICIPANTS" });
  }, [open, reset]);
  const participants = watch("participants");
  const create = useAction(
    (v: { title: string; date: string; time: string; duration: string; recurrence: string; projectId: string; teamId: string; participants: string[]; agenda: string; visibility: string }) =>
      api.post<{ id: string }>("/meetings", {
        title: v.title,
        scheduledAt: new Date(`${v.date}T${v.time}:00`).toISOString(),
        durationMinutes: Number(v.duration),
        recurrence: v.recurrence,
        visibility: v.visibility,
        teamId: nn(v.teamId),
        projectIds: v.projectId ? [v.projectId] : [],
        participantIds: v.participants,
        agenda: v.agenda.split("\n").map((s) => s.trim()).filter(Boolean),
      }),
    { success: "Meeting scheduled", invalidate: ["/meetings", "/dashboard"], onSuccess: (r) => (onClose(), router.push(`/meetings/${r.id}`)) },
  );
  return (
    <Dialog size="lg" open={open} onOpenChange={(o) => !o && onClose()} title="Schedule a meeting" description="WorkMesh prepares a brief from what changed since the last one. Nothing is recorded or transcribed." footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={handleSubmit((v) => create.mutate(v))}>Schedule</Button></>}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit((v) => create.mutate(v))}>
        <Field className="sm:col-span-2" label="Title" htmlFor="m-title" required><Input id="m-title" {...register("title", { required: true })} placeholder="e.g. Payments weekly sync" autoFocus /></Field>
        <Field label="Date" htmlFor="m-date"><Input id="m-date" type="date" {...register("date", { required: true })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Time" htmlFor="m-time"><Input id="m-time" type="time" {...register("time")} /></Field>
          <Field label="Minutes" htmlFor="m-dur"><Select id="m-dur" {...register("duration")}>{[15, 30, 45, 60, 90].map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field>
        </div>
        <Field label="Repeats" htmlFor="m-rec"><Select id="m-rec" {...register("recurrence")}><option value="NONE">Does not repeat</option><option value="WEEKLY">Weekly</option><option value="BIWEEKLY">Every two weeks</option><option value="MONTHLY">Monthly</option></Select></Field>
        <Field label="Visible to" htmlFor="m-vis"><Select id="m-vis" {...register("visibility")}><option value="PARTICIPANTS">Participants</option><option value="TEAM">Team</option><option value="ORG">Organization</option></Select></Field>
        <Field label="Related project" htmlFor="m-proj"><ProjectSelect id="m-proj" {...register("projectId")} /></Field>
        <Field label="Team" htmlFor="m-team"><TeamSelect id="m-team" {...register("teamId")} /></Field>
        <Field className="sm:col-span-2" label={`Participants (${participants.length})`}>
          <div className="max-h-40 overflow-y-auto rounded-lg border border-line p-1">
            {(people ?? []).map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-subtle">
                <input type="checkbox" className="accent-[var(--color-brand)]" checked={participants.includes(p.id)} onChange={(e) => setValue("participants", e.target.checked ? [...participants, p.id] : participants.filter((x) => x !== p.id))} />
                {p.name} <span className="text-muted">· {p.title}</span>
              </label>
            ))}
          </div>
        </Field>
        <Field className="sm:col-span-2" label="Agenda" htmlFor="m-agenda" hint="One item per line"><Textarea id="m-agenda" rows={3} {...register("agenda")} /></Field>
      </form>
    </Dialog>
  );
}

function GoalDialog({ open, onClose, kind, goalId }: { open: boolean; onClose: () => void; kind: "goal" | "initiative"; goalId?: string }) {
  const { register, handleSubmit, reset } = useForm({ defaultValues: { title: "", description: "", period: "", targetDate: "", visibility: "ORG", ownerId: "", goalId: goalId ?? "" } });
  const { data: goals } = useApi<{ goals: Array<{ id: string; title: string }> }>(open && kind === "initiative" ? "/goals" : null);
  useEffect(() => {
    if (open) reset({ title: "", description: "", period: "", targetDate: "", visibility: "ORG", ownerId: "", goalId: goalId ?? "" });
  }, [open, goalId, reset]);
  const create = useAction(
    (v: Record<string, string>) =>
      api.post(kind === "goal" ? "/goals" : "/initiatives", { title: v.title, description: nn(v.description), period: kind === "goal" ? nn(v.period) : undefined, targetDate: isoDate(v.targetDate), visibility: v.visibility, ownerId: nn(v.ownerId), goalId: kind === "initiative" ? nn(v.goalId) : undefined }),
    { success: kind === "goal" ? "Company goal created" : "Initiative created", invalidate: ["/goals", "/graph", "/dashboard"], onSuccess: onClose },
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={kind === "goal" ? "New company goal" : "New initiative"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={handleSubmit((v) => create.mutate(v))}>Create</Button></>}>
      <form className="space-y-3" onSubmit={handleSubmit((v) => create.mutate(v))}>
        <Field label="Title" htmlFor="g-title" required><Input id="g-title" {...register("title", { required: true })} autoFocus /></Field>
        <Field label="Description" htmlFor="g-desc"><Textarea id="g-desc" {...register("description")} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {kind === "initiative" ? (
            <Field label="Company goal" htmlFor="g-goal"><Select id="g-goal" {...register("goalId")}><option value="">None</option>{goals?.goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</Select></Field>
          ) : (
            <Field label="Period" htmlFor="g-period"><Input id="g-period" placeholder="e.g. H1 2027" {...register("period")} /></Field>
          )}
          <Field label="Target date" htmlFor="g-date"><Input id="g-date" type="date" {...register("targetDate")} /></Field>
          <Field label="Owner" htmlFor="g-owner"><PersonSelect id="g-owner" placeholder="Me" {...register("ownerId")} /></Field>
          <Field label="Visibility" htmlFor="g-vis"><Select id="g-vis" {...register("visibility")}><option value="ORG">Organization</option><option value="RESTRICTED">Restricted</option></Select></Field>
        </div>
      </form>
    </Dialog>
  );
}

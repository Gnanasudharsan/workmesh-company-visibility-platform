"use client";

import { label } from "@workmesh/core";
import { CheckCircle2, Download, Flag, ListTodo, Printer, Repeat, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { BriefView, type Brief } from "@/components/meetings/brief";
import { AvatarStack, PersonChip } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Input, Select, Textarea } from "@/components/ui/form";
import { TabPanel, Tabs } from "@/components/ui/overlay";
import { isoDate, nn, PersonSelect } from "@/components/work/pickers";
import { download } from "@/lib/api";
import { api, useAction, useApi } from "@/lib/hooks";
import { toast } from "@/lib/toast";
import type { PersonLite } from "@/lib/types";
import { cn, dateTime, day } from "@/lib/utils";

interface Meeting {
  id: string;
  title: string;
  description: string | null;
  scheduledAt: string;
  durationMinutes: number;
  recurrence: string;
  status: string;
  visibility: string;
  notes: string | null;
  organizer: PersonLite | null;
  participants: PersonLite[];
  projects: Array<{ id: string; name: string; key: string; status: string }>;
  agenda: Array<{ id: string; title: string; discussed: boolean; notes: string | null }>;
  decisions: Array<{ id: string; title: string; rationale: string | null; status: string; owner: PersonLite | null; projectName: string | null; projectId: string | null }>;
  actionItems: Array<{ id: string; title: string; status: string; dueDate: string | null; owner: PersonLite | null }>;
  canEdit: boolean;
}

export default function MeetingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState("brief");
  const [since, setSince] = useState("");
  const { data: m, error, isLoading, refetch } = useApi<Meeting>(`/meetings/${id}`);
  const { data: brief, isFetching: briefLoading } = useApi<Brief>(`/meetings/${id}/brief${since ? `?since=${new Date(`${since}T00:00:00`).toISOString()}` : ""}`);
  const inv = ["/meetings", "/decisions", "/action-items", "/dashboard"];
  const share = useAction(() => api.post(`/meetings/${id}/brief/share`), { success: "Participants notified that the brief is ready", invalidate: inv });
  const complete = useAction(() => api.post<{ nextMeetingId: string | null }>(`/meetings/${id}/complete`), {
    success: (r) => (r.nextMeetingId ? "Meeting completed — next occurrence scheduled with open agenda items" : "Meeting completed"),
    invalidate: inv,
    onSuccess: (r) => r.nextMeetingId && router.push(`/meetings/${r.nextMeetingId}`),
  });
  const addAgenda = useAction((title: string) => api.post(`/meetings/${id}/agenda`, { title }), { success: "Added to agenda", invalidate: ["/meetings"] });

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !m) return <LoadingCards />;
  const open = m.actionItems.filter((a) => a.status === "OPEN").length;
  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5">{dateTime(m.scheduledAt)} · {m.durationMinutes} min{m.recurrence !== "NONE" && <><Repeat className="h-3 w-3" aria-hidden /> {label(m.recurrence)}</>}</span>}
        title={m.title}
        description={m.description ?? undefined}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button onClick={() => download(`/meetings/${id}/summary.md`, `${m.title.toLowerCase().replace(/\W+/g, "-")}-summary.md`).catch((e) => toast.error(e.message))}><Download className="h-4 w-4" /> Markdown</Button>
            <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> PDF</Button>
            {m.canEdit && m.status !== "COMPLETED" && <Button onClick={() => share.mutate(undefined)} loading={share.isPending}><Send className="h-4 w-4" /> Share brief</Button>}
            {m.canEdit && m.status !== "COMPLETED" && <Button variant="primary" loading={complete.isPending} onClick={() => complete.mutate(undefined)}><CheckCircle2 className="h-4 w-4" /> Complete meeting</Button>}
          </div>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3 text-[13px]">
        <StatusBadge status={m.status} />
        <span className="flex items-center gap-2 text-muted">Organizer <PersonChip person={m.organizer} sub={null} size="xs" /></span>
        <AvatarStack people={m.participants} max={8} />
        {m.projects.map((p) => <Link key={p.id} href={`/projects/${p.id}`}><Badge>{p.name}</Badge></Link>)}
      </div>
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: "brief", label: "Brief" }, { value: "agenda", label: "Agenda", count: m.agenda.length }, { value: "decisions", label: "Decisions", count: m.decisions.length }, { value: "actions", label: "Action items", count: open }, { value: "summary", label: "Summary" }]}>
        <TabPanel value="brief">{brief ? <div className={cn(briefLoading && "opacity-60")}><BriefView brief={brief} since={since || brief.since.slice(0, 10)} onSince={setSince} onAddAgenda={m.canEdit ? (t) => addAgenda.mutate(t) : undefined} /></div> : <LoadingCards count={2} />}</TabPanel>
        <TabPanel value="agenda"><Agenda m={m} /></TabPanel>
        <TabPanel value="decisions"><Decisions m={m} /></TabPanel>
        <TabPanel value="actions"><Actions m={m} /></TabPanel>
        <TabPanel value="summary"><Summary m={m} /></TabPanel>
      </Tabs>
    </>
  );
}

function Agenda({ m }: { m: Meeting }) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState(m.notes ?? "");
  const add = useAction(() => api.post(`/meetings/${m.id}/agenda`, { title }), { invalidate: ["/meetings"], onSuccess: () => setTitle("") });
  const toggle = useAction((a: Meeting["agenda"][number]) => api.patch(`/agenda/${a.id}`, { discussed: !a.discussed }), { invalidate: ["/meetings"] });
  const del = useAction((aid: string) => api.del(`/agenda/${aid}`), { invalidate: ["/meetings"] });
  const saveNotes = useAction(() => api.patch(`/meetings/${m.id}`, { notes: notes || null }), { success: "Notes saved", invalidate: ["/meetings"] });
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Agenda" description="Tick items off as you discuss them. Undiscussed items roll into the next occurrence." />
        <CardBody className="space-y-1">
          {m.agenda.map((a) => (
            <div key={a.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-subtle/60">
              <input type="checkbox" checked={a.discussed} disabled={!m.canEdit} onChange={() => toggle.mutate(a)} className="h-4 w-4 accent-[var(--color-brand)]" aria-label={`Mark "${a.title}" discussed`} />
              <span className={cn("flex-1 text-[13.5px]", a.discussed && "text-muted line-through")}>{a.title}</span>
              {m.canEdit && <button onClick={() => del.mutate(a.id)} className="rounded p-1 text-faint opacity-0 hover:text-danger group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${a.title}`}><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
          {m.canEdit && (
            <form className="flex gap-2 pt-2" onSubmit={(e) => (e.preventDefault(), title.trim() && add.mutate(undefined))}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add an agenda item" aria-label="New agenda item" />
              <Button type="submit" disabled={!title.trim()} loading={add.isPending}>Add</Button>
            </form>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Notes" description="Written by participants. Nothing is recorded automatically." />
        <CardBody className="space-y-2">
          <Textarea rows={10} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!m.canEdit} aria-label="Meeting notes" />
          {m.canEdit && <Button size="sm" disabled={notes === (m.notes ?? "")} loading={saveNotes.isPending} onClick={() => saveNotes.mutate(undefined)}>Save notes</Button>}
        </CardBody>
      </Card>
    </div>
  );
}

function Decisions({ m }: { m: Meeting }) {
  const [v, setV] = useState({ title: "", rationale: "", ownerId: "", projectId: "", status: "DECIDED" });
  const add = useAction(() => api.post(`/meetings/${m.id}/decisions`, { title: v.title, rationale: nn(v.rationale), ownerId: nn(v.ownerId), projectId: nn(v.projectId), status: v.status }), { success: "Decision recorded", invalidate: ["/meetings", "/decisions", "/dashboard"], onSuccess: () => setV({ title: "", rationale: "", ownerId: "", projectId: "", status: "DECIDED" }) });
  const decide = useAction((did: string) => api.patch(`/decisions/${did}`, { status: "DECIDED" }), { success: "Marked decided", invalidate: ["/meetings", "/decisions"] });
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardBody className="space-y-3 pt-4">
          {m.decisions.length === 0 && <p className="text-[13px] text-muted">No decisions yet.</p>}
          {m.decisions.map((d) => (
            <div key={d.id} className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center gap-2"><Flag className="h-4 w-4 text-violet" aria-hidden /><span className="flex-1 text-[13.5px] font-medium">{d.title}</span><StatusBadge status={d.status} />{m.canEdit && d.status === "PENDING" && <Button size="xs" onClick={() => decide.mutate(d.id)}>Mark decided</Button>}</div>
              {d.rationale && <p className="mt-1 text-[13px] text-slate-600">{d.rationale}</p>}
              <p className="mt-1 text-[12px] text-muted">{d.owner ? `Owner: ${d.owner.name}` : "No owner"}{d.projectName ? ` · ${d.projectName}` : ""}</p>
            </div>
          ))}
        </CardBody>
      </Card>
      {m.canEdit && (
        <Card>
          <CardHeader title="Record a decision" />
          <CardBody className="space-y-2">
            <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="What was decided?" aria-label="Decision" />
            <Textarea rows={2} value={v.rationale} onChange={(e) => setV({ ...v, rationale: e.target.value })} placeholder="Why (optional)" aria-label="Rationale" />
            <PersonSelect value={v.ownerId} onChange={(e) => setV({ ...v, ownerId: e.target.value })} placeholder="Owner" aria-label="Owner" />
            <Select value={v.projectId} onChange={(e) => setV({ ...v, projectId: e.target.value })} aria-label="Project"><option value="">No project</option>{m.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select value={v.status} onChange={(e) => setV({ ...v, status: e.target.value })} aria-label="Status"><option value="DECIDED">Decided</option><option value="PENDING">Needs a decision</option></Select>
            <Button variant="primary" className="w-full" disabled={v.title.trim().length < 2} loading={add.isPending} onClick={() => add.mutate(undefined)}>Record decision</Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Actions({ m }: { m: Meeting }) {
  const [v, setV] = useState({ title: "", ownerId: "", dueDate: "", decisionId: "" });
  const add = useAction(() => api.post(`/meetings/${m.id}/action-items`, { title: v.title, ownerId: v.ownerId, dueDate: isoDate(v.dueDate), decisionId: nn(v.decisionId), projectId: m.decisions.find((d) => d.id === v.decisionId)?.projectId ?? (m.projects[0]?.id ?? null) }), { success: "Action item assigned", invalidate: ["/meetings", "/action-items", "/dashboard"], onSuccess: () => setV({ title: "", ownerId: "", dueDate: "", decisionId: "" }) });
  const toggle = useAction((a: Meeting["actionItems"][number]) => api.patch(`/action-items/${a.id}`, { status: a.status === "DONE" ? "OPEN" : "DONE" }), { invalidate: ["/meetings", "/action-items"] });
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardBody className="space-y-1 pt-4">
          {m.actionItems.length === 0 && <p className="text-[13px] text-muted">No action items yet.</p>}
          {m.actionItems.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-subtle/60">
              <input type="checkbox" checked={a.status === "DONE"} onChange={() => toggle.mutate(a)} className="h-4 w-4 accent-[var(--color-brand)]" aria-label={`Mark "${a.title}" done`} />
              <span className={cn("flex-1 text-[13.5px]", a.status === "DONE" && "text-muted line-through")}>{a.title}</span>
              <PersonChip person={a.owner} sub={null} size="xs" />
              <span className="w-20 text-right text-[12px] text-muted">{a.dueDate ? day(a.dueDate) : ""}</span>
            </div>
          ))}
        </CardBody>
      </Card>
      {m.canEdit && (
        <Card>
          <CardHeader icon={<ListTodo className="h-4 w-4" />} title="Assign a follow-up" />
          <CardBody className="space-y-2">
            <Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="What needs to happen?" aria-label="Action item" />
            <PersonSelect value={v.ownerId} onChange={(e) => setV({ ...v, ownerId: e.target.value })} placeholder="Owner (required)" aria-label="Owner" />
            <Input type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} aria-label="Due date" />
            <Select value={v.decisionId} onChange={(e) => setV({ ...v, decisionId: e.target.value })} aria-label="Linked decision"><option value="">Not linked to a decision</option>{m.decisions.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</Select>
            <Button variant="primary" className="w-full" disabled={v.title.trim().length < 2 || !v.ownerId} loading={add.isPending} onClick={() => add.mutate(undefined)}>Assign</Button>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Summary({ m }: { m: Meeting }) {
  const followUps = m.agenda.filter((a) => !a.discussed);
  return (
    <Card className="print-area mx-auto max-w-3xl">
      <CardBody className="space-y-5 pt-5 text-[13.5px]">
        <div><h2 className="text-[17px] font-semibold">{m.title}</h2><p className="text-muted">{dateTime(m.scheduledAt)} · {m.participants.map((p) => p.name).join(", ")}</p></div>
        <section><h3 className="mb-1.5 font-semibold">Decisions</h3>{m.decisions.length ? <ul className="list-disc space-y-1 pl-5">{m.decisions.map((d) => <li key={d.id}><strong className="font-medium">{d.title}</strong> — {label(d.status)}{d.owner ? `, owner ${d.owner.name}` : ""}{d.projectName ? ` (${d.projectName})` : ""}</li>)}</ul> : <p className="text-muted">None recorded.</p>}</section>
        <section><h3 className="mb-1.5 font-semibold">Action items</h3>{m.actionItems.length ? <ul className="list-disc space-y-1 pl-5">{m.actionItems.map((a) => <li key={a.id}>{a.title} — <strong className="font-medium">{a.owner?.name}</strong>{a.dueDate ? `, due ${day(a.dueDate, true)}` : ""}{a.status === "DONE" ? " ✓" : ""}</li>)}</ul> : <p className="text-muted">None.</p>}</section>
        <section><h3 className="mb-1.5 font-semibold">Follow-ups</h3>{followUps.length ? <ul className="list-disc space-y-1 pl-5">{followUps.map((a) => <li key={a.id}>{a.title}</li>)}</ul> : <p className="text-muted">All agenda items were discussed.</p>}</section>
        {m.projects.length > 0 && <section><h3 className="mb-1.5 font-semibold">Projects referenced</h3><p>{m.projects.map((p) => `${p.name} (${p.key})`).join(", ")}</p></section>}
        {m.notes && <section><h3 className="mb-1.5 font-semibold">Notes</h3><p className="whitespace-pre-line">{m.notes}</p></section>}
        <p className="text-[12px] text-muted">Generated from records you are authorized to see. Export as Markdown or print to PDF above.</p>
      </CardBody>
    </Card>
  );
}

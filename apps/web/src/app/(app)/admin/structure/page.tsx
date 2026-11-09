"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { PersonChip } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { nn, PersonSelect } from "@/components/work/pickers";
import { api, useAction, useApi } from "@/lib/hooks";
import type { PersonLite } from "@/lib/types";

interface Dept { id: string; name: string; description: string | null; color: string; head: PersonLite | null; teams: Array<{ id: string; name: string }>; memberCount: number }
interface TeamDetail { id: string; name: string; mission: string | null; responsibilities: string[]; contact: string | null; department: { id: string; name: string } | null; members: Array<PersonLite & { role: string }> }

const INV = ["/departments", "/teams", "/org", "/graph", "/people", "/dashboard"];

export default function StructurePage() {
  const { data: depts, error, refetch } = useApi<Dept[]>("/departments");
  const [team, setTeam] = useState<string | null>(null);
  const [editDept, setEditDept] = useState<Dept | "new" | null>(null);
  const [newTeam, setNewTeam] = useState(false);
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!depts) return <LoadingCards />;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="flex gap-2"><Button variant="primary" size="sm" onClick={() => setEditDept("new")}><Plus className="h-3.5 w-3.5" /> Department</Button><Button size="sm" onClick={() => setNewTeam(true)}><Plus className="h-3.5 w-3.5" /> Team</Button></div>
        {depts.map((d) => (
          <Card key={d.id}>
            <CardHeader title={<span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} aria-hidden />{d.name}</span>} description={`${d.memberCount} people · head ${d.head?.name ?? "not set"}`} action={<Button size="xs" variant="ghost" onClick={() => setEditDept(d)}>Edit</Button>} />
            <CardBody className="flex flex-wrap gap-2">
              {d.teams.map((t) => <button key={t.id} onClick={() => setTeam(t.id)} className={`rounded-lg border px-2.5 py-1 text-[13px] ${team === t.id ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong"}`}>{t.name}</button>)}
              {d.teams.length === 0 && <span className="text-[13px] text-muted">No teams</span>}
            </CardBody>
          </Card>
        ))}
      </div>
      <div>{team ? <TeamEditor id={team} depts={depts} onDeleted={() => setTeam(null)} /> : <Card><CardBody className="pt-5 text-[13.5px] text-muted">Select a team to manage its mission, responsibilities and members.</CardBody></Card>}</div>
      <DeptDialog dept={editDept} onClose={() => setEditDept(null)} />
      <NewTeamDialog open={newTeam} depts={depts} onClose={(id) => (setNewTeam(false), id && setTeam(id))} />
    </div>
  );
}

function DeptDialog({ dept, onClose }: { dept: Dept | "new" | null; onClose: () => void }) {
  const isNew = dept === "new";
  const d = dept && dept !== "new" ? dept : null;
  const [v, setV] = useState({ name: "", description: "", headId: "", color: "#2563EB" });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = isNew ? "new" : (d?.id ?? null);
  if (key !== loadedFor) {
    setLoadedFor(key);
    setV({ name: d?.name ?? "", description: d?.description ?? "", headId: d?.head?.id ?? "", color: d?.color ?? "#2563EB" });
  }
  const save = useAction(() => (isNew ? api.post("/departments", { ...v, description: nn(v.description), headId: nn(v.headId) }) : api.patch(`/departments/${d!.id}`, { ...v, description: nn(v.description), headId: nn(v.headId) })), { success: "Department saved", invalidate: INV, onSuccess: onClose });
  const del = useAction(() => api.del(`/departments/${d!.id}`), { success: "Department deleted", invalidate: INV, onSuccess: onClose });
  return (
    <Dialog open={!!dept} onOpenChange={(o) => !o && onClose()} title={isNew ? "New department" : `Edit ${d?.name}`} footer={<>{d && <Button variant="ghost" className="mr-auto text-danger" onClick={() => confirm("Delete this department?") && del.mutate(undefined)}>Delete</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={v.name.trim().length < 2} loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name" htmlFor="d-name"><Input id="d-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Description" htmlFor="d-desc"><Textarea id="d-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <Field label="Department head" htmlFor="d-head"><PersonSelect id="d-head" value={v.headId} onChange={(e) => setV({ ...v, headId: e.target.value })} placeholder="None" /></Field>
          <Field label="Color" htmlFor="d-color"><Input id="d-color" type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className="p-1" /></Field>
        </div>
      </div>
    </Dialog>
  );
}

function NewTeamDialog({ open, depts, onClose }: { open: boolean; depts: Dept[]; onClose: (id?: string) => void }) {
  const [v, setV] = useState({ name: "", departmentId: "", mission: "" });
  const create = useAction(() => api.post<{ id: string }>("/teams", { name: v.name, departmentId: nn(v.departmentId), mission: nn(v.mission) }), { success: "Team created", invalidate: INV, onSuccess: (r) => (setV({ name: "", departmentId: "", mission: "" }), onClose(r.id)) });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="New team" footer={<><Button variant="ghost" onClick={() => onClose()}>Cancel</Button><Button variant="primary" disabled={v.name.trim().length < 2} loading={create.isPending} onClick={() => create.mutate(undefined)}>Create</Button></>}>
      <div className="space-y-3">
        <Field label="Name" htmlFor="t-name"><Input id="t-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Department" htmlFor="t-dept"><Select id="t-dept" value={v.departmentId} onChange={(e) => setV({ ...v, departmentId: e.target.value })}><option value="">None</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        <Field label="Mission" htmlFor="t-mission"><Textarea id="t-mission" value={v.mission} onChange={(e) => setV({ ...v, mission: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

function TeamEditor({ id, depts, onDeleted }: { id: string; depts: Dept[]; onDeleted: () => void }) {
  const { data: t } = useApi<TeamDetail>(`/teams/${id}`);
  const [draft, setDraft] = useState<{ id: string; name: string; mission: string; responsibilities: string; departmentId: string; contact: string } | null>(null);
  const [add, setAdd] = useState("");
  const v = draft?.id === id ? draft : t ? { id, name: t.name, mission: t.mission ?? "", responsibilities: t.responsibilities.join(", "), departmentId: t.department?.id ?? "", contact: t.contact ?? "" } : null;
  const save = useAction(() => api.patch(`/teams/${id}`, { name: v!.name, mission: nn(v!.mission), departmentId: nn(v!.departmentId), contact: nn(v!.contact), responsibilities: v!.responsibilities.split(",").map((s) => s.trim()).filter(Boolean) }), { success: "Team saved", invalidate: INV });
  const member = useAction(({ memberId, role }: { memberId: string; role: string }) => api.put(`/teams/${id}/members/${memberId}`, { role }), { success: "Membership updated", invalidate: INV, onSuccess: () => setAdd("") });
  const remove = useAction((memberId: string) => api.del(`/teams/${id}/members/${memberId}`), { success: "Removed from team (history kept)", invalidate: INV });
  const del = useAction(() => api.del(`/teams/${id}`), { success: "Team deleted", invalidate: INV, onSuccess: onDeleted });
  if (!t || !v) return <LoadingCards count={1} />;
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setDraft({ ...v, [k]: e.target.value });
  return (
    <Card>
      <CardHeader title={t.name} action={<Button size="xs" variant="ghost" className="text-danger" onClick={() => confirm("Delete this team?") && del.mutate(undefined)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>} />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" htmlFor="te-name"><Input id="te-name" value={v.name} onChange={set("name")} /></Field>
          <Field label="Department" htmlFor="te-dept"><Select id="te-dept" value={v.departmentId} onChange={set("departmentId")}><option value="">None</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
        </div>
        <Field label="Mission" htmlFor="te-mission"><Textarea id="te-mission" rows={2} value={v.mission} onChange={set("mission")} /></Field>
        <Field label="Responsibilities" htmlFor="te-resp" hint="Comma-separated; searchable in the directory"><Input id="te-resp" value={v.responsibilities} onChange={set("responsibilities")} /></Field>
        <Field label="Contact channel" htmlFor="te-contact"><Input id="te-contact" value={v.contact} onChange={set("contact")} /></Field>
        <Button variant="primary" size="sm" loading={save.isPending} onClick={() => save.mutate(undefined)}>Save team</Button>
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-[12.5px] font-semibold">Members ({t.members.length})</p>
          <div className="space-y-2">
            {t.members.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2">
                <PersonChip person={m} />
                <div className="flex items-center gap-1.5">
                  {m.role === "LEAD" ? <Badge tone="brand">Lead</Badge> : <Button size="xs" variant="ghost" onClick={() => member.mutate({ memberId: m.id, role: "LEAD" })}>Make lead</Button>}
                  {m.role === "LEAD" && <Button size="xs" variant="ghost" onClick={() => member.mutate({ memberId: m.id, role: "MEMBER" })}>Unset lead</Button>}
                  <Button size="icon" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => remove.mutate(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <PersonSelect value={add} onChange={(e) => setAdd(e.target.value)} exclude={t.members.map((m) => m.id)} placeholder="Add a member…" aria-label="Add member" />
            <Button disabled={!add} loading={member.isPending} onClick={() => member.mutate({ memberId: add, role: "MEMBER" })}>Add</Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

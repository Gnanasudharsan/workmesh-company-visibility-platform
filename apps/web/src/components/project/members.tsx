"use client";

import { label } from "@workmesh/core";
import { ArrowDownRight, ArrowUpRight, Lock, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api, useAction, useApi } from "@/lib/hooks";
import type { PersonLite, ProjectDetail } from "@/lib/types";
import { day } from "@/lib/utils";
import { PersonChip } from "../ui/avatar";
import { Badge, StatusBadge, VisibilityBadge } from "../ui/badges";
import { Button, ButtonLink } from "../ui/button";
import { Card, CardBody, CardHeader } from "../ui/card";
import { EmptyState } from "../ui/feedback";
import { Field, Input, Select } from "../ui/form";
import { Dialog } from "../ui/overlay";
import { isoDate, nn, PersonSelect, ProjectSelect } from "../work/pickers";

export function MembersTab({ p }: { p: ProjectDetail }) {
  const [who, setWho] = useState("");
  const [role, setRole] = useState("CONTRIBUTOR");
  const add = useAction(() => api.put(`/projects/${p.id}/members/${who}`, { role }), { success: "Member added — they can see this project now", invalidate: ["/projects"], onSuccess: () => setWho("") });
  const remove = useAction((id: string) => api.del(`/projects/${p.id}/members/${id}`), { success: "Removed — access ended immediately", invalidate: ["/projects"] });
  const { data: grants } = useApi<Array<{ id: string; level: string; reason: string | null; expiresAt: string | null; grantee: PersonLite | null }>>(p.canManage ? `/projects/${p.id}/grants` : null);
  const [grantee, setGrantee] = useState("");
  const [level, setLevel] = useState("SUMMARY");
  const [expires, setExpires] = useState("");
  const grant = useAction(() => api.post(`/projects/${p.id}/grants`, { granteeId: grantee, level, expiresAt: isoDate(expires) }), { success: "Access granted", invalidate: ["/projects"], onSuccess: () => setGrantee("") });
  const revoke = useAction((id: string) => api.del(`/projects/${p.id}/grants/${id}`), { success: "Access revoked", invalidate: ["/projects"] });
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Members" description="Project members can see all project details." />
        <CardBody className="space-y-2">
          {p.members.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2">
              <PersonChip person={m} />
              <div className="flex items-center gap-2">
                <Badge tone={m.role === "LEAD" ? "brand" : "neutral"}>{label(m.role)}</Badge>
                {p.canManage && m.role !== "LEAD" && <Button size="icon" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => remove.mutate(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div>
            </div>
          ))}
          {p.canManage && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <PersonSelect value={who} onChange={(e) => setWho(e.target.value)} exclude={p.members.map((m) => m.id)} placeholder="Add a person…" className="min-w-0 flex-1" aria-label="Person to add" />
              <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-auto" aria-label="Role"><option value="CONTRIBUTOR">Contributor</option><option value="VIEWER">Viewer</option><option value="LEAD">Lead</option></Select>
              <Button variant="primary" disabled={!who} loading={add.isPending} onClick={() => add.mutate(undefined)}><Plus className="h-3.5 w-3.5" /> Add</Button>
            </div>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Visibility & access" icon={<Lock className="h-4 w-4" />} />
        <CardBody className="space-y-3 text-[13px]">
          <div className="flex items-center gap-2"><VisibilityBadge visibility={p.visibility} />{p.visibility !== "ORG" && <Badge>{p.discoverable ? "Summary discoverable" : "Hidden from non-members"}</Badge>}</div>
          <p className="text-muted">
            {p.visibility === "ORG" && "Everyone in the organization can see details."}
            {p.visibility === "TEAM" && "Members of the owning team (and the department head) see details."}
            {p.visibility === "PROJECT_MEMBERS" && "Only project members and explicit grants see details."}
            {p.visibility === "RESTRICTED" && "Invisible to everyone except members and explicit grants — no name, count or relationship is shown elsewhere."}
            {" "}Administrators and executives don&apos;t get details just because of their role.
          </p>
          {p.canManage && (
            <>
              <p className="pt-2 text-[12px] font-semibold uppercase tracking-wider text-faint">Explicit grants</p>
              {(grants ?? []).length === 0 && <p className="text-muted">No explicit grants.</p>}
              {(grants ?? []).map((g) => (
                <div key={g.id} className="flex items-center justify-between gap-2">
                  <PersonChip person={g.grantee} sub={`${label(g.level)}${g.expiresAt ? ` · until ${day(g.expiresAt)}` : ""}`} />
                  <Button size="sm" variant="ghost" onClick={() => revoke.mutate(g.id)}>Revoke</Button>
                </div>
              ))}
              <div className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_auto_auto_auto]">
                <PersonSelect value={grantee} onChange={(e) => setGrantee(e.target.value)} placeholder="Grant access to…" aria-label="Grantee" />
                <Select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Level"><option value="SUMMARY">Summary</option><option value="DETAILS">Details</option></Select>
                <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} aria-label="Expires" />
                <Button disabled={!grantee} loading={grant.isPending} onClick={() => grant.mutate(undefined)}>Grant</Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

interface Explorer {
  nodes: Array<{ id: string; name: string; key: string; status: string; health: string }>;
  edges: Array<{ id: string; upstreamId: string; downstreamId: string; description: string; state: string; isCritical: boolean; needBy: string | null; slackDays: number | null; canEdit: boolean; owner: PersonLite | null }>;
  impact: { confirmed: Array<{ id: string; reasons: string[] }>; potential: Array<{ id: string; distance: number; viaCritical: boolean }> };
}

export function DependenciesTab({ p }: { p: ProjectDetail }) {
  const { data } = useApi<Explorer>(`/dependencies?projectId=${p.id}`);
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState({ upstreamProjectId: "", description: "", isCritical: false, needBy: "", ownerId: "" });
  const create = useAction(() => api.post("/dependencies", { upstreamProjectId: v.upstreamProjectId, downstreamProjectId: p.id, description: v.description, isCritical: v.isCritical, needBy: isoDate(v.needBy), ownerId: nn(v.ownerId) }), { success: "Dependency added", invalidate: ["/dependencies", "/projects", "/graph"], onSuccess: () => setAdding(false) });
  const setState = useAction(({ id, state }: { id: string; state: string }) => api.patch(`/dependencies/${id}`, { state }), { success: "Dependency updated", invalidate: ["/dependencies", "/projects", "/graph"] });
  const name = new Map((data?.nodes ?? []).map((n) => [n.id, n]));
  const up = (data?.edges ?? []).filter((e) => e.downstreamId === p.id);
  const down = (data?.edges ?? []).filter((e) => e.upstreamId === p.id);
  const Row = ({ e, dir }: { e: Explorer["edges"][number]; dir: "up" | "down" }) => {
    const other = name.get(dir === "up" ? e.upstreamId : e.downstreamId);
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2.5">
        {dir === "up" ? <ArrowUpRight className="h-4 w-4 text-muted" aria-hidden /> : <ArrowDownRight className="h-4 w-4 text-muted" aria-hidden />}
        <div className="min-w-0 flex-1">
          <Link href={`/projects/${other?.id}`} className="text-[13.5px] font-medium hover:text-brand-deep">{other?.name}</Link>
          <p className="text-[12px] text-muted">{e.description}{e.needBy ? ` · needed by ${day(e.needBy)}` : ""}{e.slackDays !== null ? ` · ${e.slackDays >= 0 ? `${e.slackDays}d slack` : `${-e.slackDays}d past upstream target`}` : ""}</p>
        </div>
        {e.isCritical && <Badge tone="danger">Critical</Badge>}
        <StatusBadge status={e.state} />
        {e.canEdit && (
          <Select aria-label="Dependency state" className="h-8 w-auto text-[12.5px]" value={e.state} onChange={(ev) => setState.mutate({ id: e.id, state: ev.target.value })}>
            {["OPEN", "AT_RISK", "BLOCKED", "RESOLVED"].map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </Select>
        )}
      </div>
    );
  };
  const potential = data?.impact.potential.find((x) => x.id === p.id);
  const confirmed = data?.impact.confirmed.find((x) => x.id === p.id);
  return (
    <div className="space-y-5">
      {(confirmed || potential) && (
        <div className={`rounded-xl border p-4 text-[13px] ${confirmed ? "border-red-200 bg-danger-soft text-red-900" : "border-amber-200 bg-warning-soft text-amber-900"}`}>
          <p className="font-medium">{confirmed ? "Confirmed problem" : "Potential downstream impact"}</p>
          <p className="mt-0.5">{confirmed ? confirmed.reasons.join("; ") : `An upstream project ${potential!.distance} step${potential!.distance > 1 ? "s" : ""} away has a confirmed problem${potential!.viaCritical ? " along a critical path" : ""}. This doesn't mean this project will be late — check the slack below.`}</p>
        </div>
      )}
      <Card>
        <CardHeader title="This project depends on" action={p.canEdit && <Button size="sm" variant="primary" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add dependency</Button>} />
        <CardBody className="space-y-2">{up.length ? up.map((e) => <Row key={e.id} e={e} dir="up" />) : <EmptyState compact title="No upstream dependencies" />}</CardBody>
      </Card>
      <Card>
        <CardHeader title="Projects waiting on this one" />
        <CardBody className="space-y-2">{down.length ? down.map((e) => <Row key={e.id} e={e} dir="down" />) : <EmptyState compact title="Nothing depends on this project" />}</CardBody>
      </Card>
      <ButtonLink href={`/dependencies?projectId=${p.id}`} size="sm">Open the dependency explorer</ButtonLink>
      <Dialog open={adding} onOpenChange={setAdding} title={`${p.name} depends on…`} description="Circular dependencies are rejected." footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" disabled={!v.upstreamProjectId || v.description.trim().length < 3} loading={create.isPending} onClick={() => create.mutate(undefined)}>Add</Button></>}>
        <div className="space-y-3">
          <Field label="Upstream project" htmlFor="dep-up"><DepProjectSelect id="dep-up" exclude={p.id} value={v.upstreamProjectId} onChange={(e) => setV({ ...v, upstreamProjectId: e.target.value })} /></Field>
          <Field label="What do you need from it?" htmlFor="dep-desc"><Input id="dep-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Needed by" htmlFor="dep-need"><Input id="dep-need" type="date" value={v.needBy} onChange={(e) => setV({ ...v, needBy: e.target.value })} /></Field>
            <Field label="Owner" htmlFor="dep-owner"><PersonSelect id="dep-owner" value={v.ownerId} onChange={(e) => setV({ ...v, ownerId: e.target.value })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="accent-[var(--color-brand)]" checked={v.isCritical} onChange={(e) => setV({ ...v, isCritical: e.target.checked })} /> Critical dependency</label>
        </div>
      </Dialog>
    </div>
  );
}

function DepProjectSelect({ exclude, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { exclude: string }) {
  const { data } = useApi<Array<{ id: string; name: string; key: string }>>("/projects");
  return (
    <Select {...props}>
      <option value="">Choose a project</option>
      {(data ?? []).filter((x) => x.id !== exclude).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.key})</option>)}
    </Select>
  );
}

export { ProjectSelect };

"use client";

import { label } from "@workmesh/core";
import { GitFork, Lock, MapPin, MessageSquare, Pencil } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar, PersonChip } from "@/components/ui/avatar";
import { Badge, HealthBadge, RoleBadge, StatusBadge } from "@/components/ui/badges";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { UpdateCard } from "@/components/work/cards";
import { api, useAction, useApi } from "@/lib/hooks";
import { useUi } from "@/lib/store";
import type { PersonLite, Update } from "@/lib/types";
import { day } from "@/lib/utils";

interface Person {
  id: string;
  name: string;
  title: string;
  email: string;
  avatarHue: number;
  role: string;
  location: string | null;
  bio: string | null;
  timezone: string | null;
  contact: string | null;
  responsibilities: string[];
  teams: Array<{ id: string; name: string; role: string }>;
  manager: PersonLite | null;
  chain: PersonLite[];
  directReports: Array<PersonLite & { dotted: boolean }>;
  projects: Array<{ id: string; name: string; key: string; status: string; health: string; access: string; role?: string }>;
  recentUpdates: Update[];
  assignments: Array<{ id: string; title: string; status: string; dueDate: string | null; project: { id: string; name: string } }>;
  canSeeWork: boolean;
  isMe: boolean;
}

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const { data: p, error, isLoading, refetch } = useApi<Person>(`/people/${id}`);
  const pushRecent = useUi((s) => s.pushRecent);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (p) pushRecent({ href: `/people/${p.id}`, label: p.name, kind: "Person" });
  }, [p, pushRecent]);
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !p) return <LoadingCards />;
  return (
    <>
      <Card className="mb-5 overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-blue-50 via-white to-violet-50" aria-hidden />
        <div className="-mt-10 flex flex-wrap items-end gap-4 px-6 pb-5">
          <Avatar name={p.name} hue={p.avatarHue} size="xl" className="ring-4" />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-[22px] font-semibold">{p.name}<RoleBadge role={p.role} /></h1>
            <p className="text-[13.5px] text-muted">{p.title}{p.teams.length ? ` · ${p.teams.map((t) => t.name).join(", ")}` : ""}</p>
            <p className="mt-1 flex flex-wrap gap-3 text-[12.5px] text-muted">
              {p.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" aria-hidden />{p.location}</span>}
              <span>{p.email}</span>{p.contact && <span className="flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" aria-hidden />{p.contact}</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <ButtonLink href={`/map?focus=${p.id}`} size="sm"><GitFork className="h-3.5 w-3.5" /> Show on map</ButtonLink>
            {p.isMe && <Button size="sm" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" /> Edit profile</Button>}
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {(p.bio || p.responsibilities.length > 0) && (
            <Card>
              <CardHeader title="About & responsibilities" />
              <CardBody className="space-y-3 text-[13.5px]">
                {p.bio && <p className="text-slate-700">{p.bio}</p>}
                <div className="flex flex-wrap gap-1.5">{p.responsibilities.map((r) => <Badge key={r} tone="brand">{r}</Badge>)}</div>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Projects" description="Projects you can see that this person contributes to" />
            <CardBody className="px-2 pb-2">
              {p.projects.length === 0 ? <EmptyState compact title="No visible projects" /> : p.projects.map((pr) => (
                <Link key={pr.id} href={`/projects/${pr.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-subtle/70">
                  <span className="font-mono text-[10.5px] text-muted">{pr.key}</span><span className="flex-1 truncate text-[13.5px] font-medium">{pr.name}</span>
                  {pr.role && <Badge>{label(pr.role)}</Badge>}<HealthBadge health={pr.health} /><StatusBadge status={pr.status} />
                </Link>
              ))}
            </CardBody>
          </Card>
          {p.canSeeWork ? (
            <Card>
              <CardHeader title="Current assignments" description={p.isMe ? "Your open work" : "Visible because this person is in your reporting line"} />
              <CardBody className="px-2 pb-2">
                {p.assignments.length === 0 ? <EmptyState compact title="No open assignments" /> : p.assignments.map((a) => (
                  <Link key={a.id} href={`/projects/${a.project.id}?tab=work&item=${a.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-subtle/70"><StatusBadge status={a.status} /><span className="min-w-0 flex-1 truncate text-[13px] font-medium">{a.title}</span><span className="text-[12px] text-muted">{a.project.name}{a.dueDate ? ` · ${day(a.dueDate)}` : ""}</span></Link>
                ))}
              </CardBody>
            </Card>
          ) : (
            <p className="flex items-center gap-1.5 px-1 text-[12.5px] text-muted"><Lock className="h-3.5 w-3.5" aria-hidden /> Detailed work assignments are visible to this person and their management line.</p>
          )}
          <section>
            <h2 className="mb-2 text-[14px] font-semibold">Recent updates shared with you</h2>
            {p.recentUpdates.length ? <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{p.recentUpdates.map((u) => <UpdateCard key={u.id} u={u} />)}</div> : <Card><EmptyState compact title="Nothing shared with you yet" /></Card>}
          </section>
        </div>
        <aside className="space-y-5">
          <Card>
            <CardHeader title="Reporting" />
            <CardBody className="space-y-3 text-[13px]">
              <div><p className="mb-1 text-[12px] text-muted">Manager</p>{p.manager ? <PersonChip person={p.manager} /> : <span className="text-muted">None</span>}</div>
              {p.chain.length > 1 && <div><p className="mb-1 text-[12px] text-muted">Management chain</p><p className="text-[12.5px]">{p.chain.map((c) => c.name).join(" → ")}</p></div>}
              {p.directReports.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[12px] text-muted">Direct reports ({p.directReports.length})</p>
                  <div className="space-y-2">{p.directReports.map((r) => <PersonChip key={r.id} person={r} sub={r.dotted ? `${r.title} · dotted line` : undefined} />)}</div>
                </div>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Teams" />
            <CardBody className="space-y-1.5">{p.teams.map((t) => <Link key={t.id} href={`/teams/${t.id}`} className="flex items-center justify-between text-[13px] hover:text-brand-deep"><span className="font-medium">{t.name}</span>{t.role === "LEAD" && <Badge tone="brand">Lead</Badge>}</Link>)}</CardBody>
          </Card>
        </aside>
      </div>
      {p.isMe && <EditProfile p={p} open={editing} onClose={() => setEditing(false)} />}
    </>
  );
}

function EditProfile({ p, open, onClose }: { p: Person; open: boolean; onClose: () => void }) {
  const [v, setV] = useState({ bio: p.bio ?? "", location: p.location ?? "", timezone: p.timezone ?? "", contact: p.contact ?? "", responsibilities: p.responsibilities.join(", ") });
  const save = useAction(() => api.patch(`/people/${p.id}/profile`, { bio: v.bio || null, location: v.location || null, timezone: v.timezone || null, contact: v.contact || null, responsibilities: v.responsibilities.split(",").map((s) => s.trim()).filter(Boolean) }), { success: "Profile updated", invalidate: ["/people", "/directory"], onSuccess: onClose });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Edit your profile" description="Your profile is visible to everyone in the organization." footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="About you" htmlFor="pf-bio"><Textarea id="pf-bio" value={v.bio} onChange={set("bio")} /></Field>
        <Field label="Responsibilities" htmlFor="pf-resp" hint="Comma-separated — helps colleagues find the right person."><Input id="pf-resp" value={v.responsibilities} onChange={set("responsibilities")} /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Location" htmlFor="pf-loc"><Input id="pf-loc" value={v.location} onChange={set("location")} /></Field>
          <Field label="Timezone" htmlFor="pf-tz"><Input id="pf-tz" value={v.timezone} onChange={set("timezone")} /></Field>
          <Field label="Contact" htmlFor="pf-contact"><Input id="pf-contact" value={v.contact} onChange={set("contact")} /></Field>
        </div>
      </div>
    </Dialog>
  );
}

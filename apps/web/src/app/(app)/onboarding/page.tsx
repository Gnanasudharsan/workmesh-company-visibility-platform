"use client";

import { ArrowRight, Building2, Check, Flag, Mail, Map, Target, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PersonChip } from "@/components/ui/avatar";
import { HealthBadge } from "@/components/ui/badges";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { api, useAction, useApi } from "@/lib/hooks";
import type { PersonLite } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Onboarding {
  organization: { name: string };
  me: { name: string; title: string; role: string; responsibilities: string[] };
  manager: PersonLite | null;
  team: { id: string; name: string; mission: string | null; members: PersonLite[]; lead: PersonLite | null } | null;
  directReports: PersonLite[];
  projects: Array<{ id: string; name: string; health: string; role?: string }>;
  assignments: Array<{ id: string; title: string; project: { id: string; name: string } }>;
  departmentWork: Array<{ id: string; name: string; health: string }>;
  goals: Array<{ id: string; title: string; period: string | null }>;
  peopleCount: number;
}

function EmployeeWelcome() {
  const router = useRouter();
  const { data, error, isLoading, refetch } = useApi<Onboarding>("/onboarding");
  const done = useAction(() => api.post("/onboarding/complete"), { invalidate: ["/auth/me"], onSuccess: () => router.push("/home") });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !data) return <LoadingCards />;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="rounded-2xl border border-line bg-gradient-to-br from-brand-soft via-white to-violet-soft p-6">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-brand">Welcome to {data.organization.name}</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Hi {data.me.name.split(" ")[0]} — here&apos;s where you fit.</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-soft">WorkMesh connects people, teams, goals and projects so you always know who&apos;s building what. Share a short progress update when something changes — that&apos;s it. No activity tracking, ever.</p>
      </div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card><CardHeader icon={<Users className="h-4 w-4" />} title="You" /><CardBody className="text-[13.5px]"><p className="font-medium">{data.me.title}</p>{data.me.responsibilities.length > 0 && <p className="mt-1 text-muted">Responsible for {data.me.responsibilities.join(", ")}</p>}<div className="mt-3"><p className="mb-1 text-[12px] text-muted">Your manager</p>{data.manager ? <PersonChip person={data.manager} /> : <p className="text-muted">Not assigned yet</p>}</div></CardBody></Card>
        <Card>
          <CardHeader icon={<Building2 className="h-4 w-4" />} title={data.team ? `Your team: ${data.team.name}` : "Your team"} />
          <CardBody className="text-[13.5px]">{data.team ? <><p className="text-ink-soft">{data.team.mission}</p><div className="mt-3 flex flex-wrap gap-2">{data.team.members.slice(0, 8).map((m) => <PersonChip key={m.id} person={m} sub={null} size="xs" />)}</div></> : <p className="text-muted">You haven&apos;t been added to a team yet.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader icon={<Flag className="h-4 w-4" />} title="Your projects & assignments" />
          <CardBody className="space-y-2 text-[13.5px]">
            {data.projects.length === 0 && <p className="text-muted">No projects yet.</p>}
            {data.projects.map((p) => <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center justify-between hover:text-brand-deep"><span className="font-medium">{p.name}</span><HealthBadge health={p.health} /></Link>)}
            {data.assignments.slice(0, 4).map((a) => <p key={a.id} className="text-[12.5px] text-muted">• {a.title} ({a.project.name})</p>)}
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={<Target className="h-4 w-4" />} title="What the company is working toward" />
          <CardBody className="space-y-1.5 text-[13.5px]">{data.goals.map((g) => <Link key={g.id} href={`/goals/${g.id}`} className="block hover:text-brand-deep">{g.title} <span className="text-[12px] text-muted">{g.period}</span></Link>)}</CardBody>
        </Card>
      </div>
      {data.departmentWork.length > 0 && <Card><CardHeader title="Also happening in your department" /><CardBody className="flex flex-wrap gap-2">{data.departmentWork.map((p) => <Link key={p.id} href={`/projects/${p.id}`} className="rounded-lg border border-line px-2.5 py-1.5 text-[13px] hover:border-brand">{p.name}</Link>)}</CardBody></Card>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
        <p className="text-[13.5px]">Next: explore the {data.peopleCount} people on the Company Map, then share your first update.</p>
        <div className="flex gap-2"><ButtonLink href="/map"><Map className="h-4 w-4" /> Company Map</ButtonLink><Button variant="primary" loading={done.isPending} onClick={() => done.mutate(undefined)}>Go to my home <ArrowRight className="h-4 w-4" /></Button></div>
      </div>
    </div>
  );
}

function CompanySetup() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [depts, setDepts] = useState<Array<{ id: string; name: string }>>([]);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [invites, setInvites] = useState<Array<{ email: string; link?: string }>>([]);
  const [dName, setDName] = useState("");
  const [tName, setTName] = useState("");
  const [tDept, setTDept] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MEMBER");
  const [inviteTeam, setInviteTeam] = useState("");
  const [goal, setGoal] = useState("");
  const addDept = useAction(() => api.post<{ id: string; name: string }>("/departments", { name: dName }), { onSuccess: (d) => (setDepts((x) => [...x, d]), setDName("")) });
  const addTeam = useAction(() => api.post<{ id: string; name: string }>("/teams", { name: tName, departmentId: tDept || null }), { onSuccess: (t) => (setTeams((x) => [...x, t]), setTName("")) });
  const invite = useAction(() => api.post<{ email: string; devLink?: string }>("/admin/invitations", { email, role, teamId: inviteTeam || null }), { success: "Invitation sent", onSuccess: (r) => (setInvites((x) => [...x, { email: r.email, link: r.devLink }]), setEmail("")) });
  const createGoal = useAction(() => api.post("/goals", { title: goal }), { success: "Your first company goal is set", invalidate: ["/goals"], onSuccess: () => router.push("/roadmap?view=goals") });
  const steps = ["Departments", "Teams", "Invite people", "First goal"];
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-[24px] font-semibold tracking-tight">Set up your company</h1>
      <p className="mt-1 text-[13.5px] text-muted">A few minutes now gives everyone a map of who does what. You can change all of it later in Administration.</p>
      <ol className="my-6 flex gap-2" aria-label="Setup steps">
        {steps.map((s, i) => (
          <li key={s} className={cn("flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px]", i === step ? "border-brand bg-brand-soft text-brand-deep" : i < step ? "border-line text-success" : "border-line text-muted")} aria-current={i === step ? "step" : undefined}>
            {i < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span className="tabular-nums">{i + 1}</span>} {s}
          </li>
        ))}
      </ol>
      <Card>
        <CardBody className="space-y-4 pt-5">
          {step === 0 && (<>
            <p className="text-[13.5px]">Add the departments your company is organized into (e.g. Engineering, Sales).</p>
            <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), dName.trim().length > 1 && addDept.mutate(undefined))}><Input value={dName} onChange={(e) => setDName(e.target.value)} placeholder="Department name" aria-label="Department name" /><Button type="submit" loading={addDept.isPending}>Add</Button></form>
            <ul className="flex flex-wrap gap-2">{depts.map((d) => <li key={d.id} className="rounded-md bg-subtle px-2 py-1 text-[13px]">{d.name}</li>)}</ul>
          </>)}
          {step === 1 && (<>
            <p className="text-[13.5px]">Create teams inside your departments.</p>
            <form className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px_auto]" onSubmit={(e) => (e.preventDefault(), tName.trim().length > 1 && addTeam.mutate(undefined))}>
              <Input value={tName} onChange={(e) => setTName(e.target.value)} placeholder="Team name" aria-label="Team name" />
              <Select value={tDept} onChange={(e) => setTDept(e.target.value)} aria-label="Department"><option value="">No department</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
              <Button type="submit" loading={addTeam.isPending}>Add</Button>
            </form>
            <ul className="flex flex-wrap gap-2">{teams.map((t) => <li key={t.id} className="rounded-md bg-subtle px-2 py-1 text-[13px]">{t.name}</li>)}</ul>
          </>)}
          {step === 2 && (<>
            <p className="text-[13.5px]">Invite colleagues. Each gets a single-use link that expires in 7 days.</p>
            <form className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_130px_150px_auto]" onSubmit={(e) => (e.preventDefault(), email && invite.mutate(undefined))}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" aria-label="Email" />
              <Select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role"><option value="MEMBER">Member</option><option value="ADMIN">Admin</option><option value="EXECUTIVE">Executive</option></Select>
              <Select value={inviteTeam} onChange={(e) => setInviteTeam(e.target.value)} aria-label="Team"><option value="">No team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
              <Button type="submit" loading={invite.isPending}><Mail className="h-4 w-4" /> Invite</Button>
            </form>
            <ul className="space-y-1 text-[13px]">{invites.map((i) => <li key={i.email}>✓ {i.email}{i.link && <> · <Link className="text-brand" href={new URL(i.link).pathname}>dev invite link</Link></>}</li>)}</ul>
            <p className="text-[12px] text-muted">Running locally? Invitation emails appear in the <Link href="/dev/mailbox" className="text-brand">developer mailbox</Link>.</p>
          </>)}
          {step === 3 && (<>
            <p className="text-[13.5px]">What&apos;s the most important outcome for the company right now?</p>
            <Field label="Company goal" htmlFor="setup-goal"><Input id="setup-goal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Reach 100 paying customers" /></Field>
          </>)}
          <div className="flex justify-between border-t border-line pt-4">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
            {step < 3 ? <Button variant="primary" onClick={() => setStep((s) => s + 1)}>Continue <ArrowRight className="h-4 w-4" /></Button> : <Button variant="primary" disabled={goal.trim().length < 2} loading={createGoal.isPending} onClick={() => createGoal.mutate(undefined)}>Finish setup</Button>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function OnboardingInner() {
  const params = useSearchParams();
  return params.get("setup") === "1" ? <CompanySetup /> : <EmployeeWelcome />;
}

export default function OnboardingPage() {
  return <Suspense><OnboardingInner /></Suspense>;
}

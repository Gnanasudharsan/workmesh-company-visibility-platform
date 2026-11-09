"use client";

import { label } from "@workmesh/core";
import { AlertTriangle, ArrowRight, Diamond, GitBranch, History, Target, UserX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PersonChip } from "@/components/ui/avatar";
import { AccessBadge, Badge, HealthBadge, StatusBadge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, PageHeader, Stat } from "@/components/ui/card";
import { ErrorState, LoadingCards, ProgressBar } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { useApi } from "@/lib/hooks";
import type { PersonLite } from "@/lib/types";
import { day, relative } from "@/lib/utils";

type Health = { total: number; onTrack: number; atRisk: number; offTrack: number; blocked: number; notStarted: number; done: number };
interface Leadership {
  goals: Array<{ id: string; title: string; status: string; period: string | null; progress: number | null; projectCount: number; atRisk: number; blocked: number; owner: PersonLite | null; initiatives: Array<{ id: string; title: string; progress: number | null; projectCount: number; atRisk: number }> }>;
  portfolioHealth: Health;
  departments: Array<{ id: string; name: string; color: string } & Health>;
  risks: Array<{ id: string; name: string; health: string; reasons: string[]; team: { name: string } | null; lead: PersonLite | null; targetDate: string | null; access: "summary" | "details" }>;
  criticalMilestones: Array<{ id: string; title: string; dueDate: string | null; status: string; project: { id: string; name: string } }>;
  pendingDecisions: Array<{ id: string; title: string; meetingId: string | null; owner: PersonLite | null }>;
  ownershipGaps: { projectsWithoutLead: Array<{ id: string; name: string }>; teamsWithoutLead: Array<{ id: string; name: string }>; unownedSeriousBlockers: Array<{ id: string; title: string; severity: string; ageDays: number; project: { name: string } | null }>; initiativesWithoutProjects: Array<{ id: string; title: string }> };
  crossInitiativeDependencies: Array<{ id: string; state: string; isCritical: boolean; upstream: { id: string; name: string; initiative: string | null }; downstream: { id: string; name: string; initiative: string | null } }>;
  changesSinceReview: { since: string; statusChanges: Array<{ projectId: string; name?: string; from: string | null; to: string | null; at: string }> };
}

export default function LeadershipPage() {
  const [since, setSince] = useState("14");
  const { data, error, isLoading, refetch } = useApi<Leadership>(`/dashboard/leadership?sinceDays=${since}`);
  return (
    <>
      <PageHeader
        title="Leadership overview"
        description="Company goals, portfolio health and risk — summaries only. Restricted work stays invisible unless you have been granted access."
        actions={<Select value={since} onChange={(e) => setSince(e.target.value)} className="w-auto" aria-label="Compare with"><option value="7">Changes in the last 7 days</option><option value="14">Since last review (14 days)</option><option value="30">Last 30 days</option></Select>}
      />
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading || !data ? <LoadingCards count={4} /> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Active projects" value={data.portfolioHealth.total} />
            <Stat label="On track" value={data.portfolioHealth.onTrack} tone="success" />
            <Stat label="At risk" value={data.portfolioHealth.atRisk} tone="warning" />
            <Stat label="Off track" value={data.portfolioHealth.offTrack} tone="danger" />
            <Stat label="Blocked" value={data.portfolioHealth.blocked} tone="danger" />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader icon={<Target className="h-4 w-4" />} title="Company goals" action={<Link href="/roadmap?view=goals" className="text-[12.5px] font-medium text-brand">Goal hierarchy</Link>} />
              <CardBody className="space-y-4">
                {data.goals.map((g) => (
                  <div key={g.id}>
                    <div className="flex items-center gap-3">
                      <Link href={`/goals/${g.id}`} className="min-w-0 flex-1 truncate text-[13.5px] font-semibold hover:text-brand-deep">{g.title}</Link>
                      {g.atRisk > 0 && <Badge tone="warning" icon={<AlertTriangle className="h-3 w-3" aria-hidden />}>{g.atRisk} need attention</Badge>}
                      <div className="w-36"><ProgressBar value={g.progress} label={`${g.title} progress`} /></div>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted">{g.period} · {g.projectCount} projects · owner {g.owner?.name ?? "—"}</p>
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Department health" description="Active projects by computed health" />
              <CardBody>
                <div className="h-[260px]" role="img" aria-label={`Department health chart. ${data.departments.map((d) => `${d.name}: ${d.onTrack} on track, ${d.atRisk} at risk, ${d.offTrack + d.blocked} off track or blocked`).join(". ")}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.departments.filter((d) => d.total > 0)} layout="vertical" margin={{ left: 8, right: 8 }}>
                      <CartesianGrid horizontal={false} stroke="#E2E8F0" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11.5, fill: "#0F172A" }} />
                      <Tooltip cursor={{ fill: "#F1F5F9" }} contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11.5 }} />
                      <Bar dataKey="onTrack" name="On track" isAnimationActive={false} stackId="h" fill="#16A34A" />
                      <Bar dataKey="notStarted" name="Not started" isAnimationActive={false} stackId="h" fill="#CBD5E1" />
                      <Bar dataKey="atRisk" name="At risk" isAnimationActive={false} stackId="h" fill="#D97706" />
                      <Bar dataKey="offTrack" name="Off track" isAnimationActive={false} stackId="h" fill="#DC2626" />
                      <Bar dataKey="blocked" name="Blocked" isAnimationActive={false} stackId="h" fill="#991B1B" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardBody>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader icon={<AlertTriangle className="h-4 w-4" />} title="Delivery risks" description="Why each project needs attention" />
              <CardBody className="space-y-3">
                {data.risks.length === 0 && <p className="text-[13px] text-muted">No projects at risk.</p>}
                {data.risks.map((r) => (
                  <Link key={r.id} href={`/projects/${r.id}`} className="block rounded-lg border border-line p-3 hover:border-line-strong">
                    <div className="flex flex-wrap items-center gap-2"><span className="text-[13.5px] font-medium">{r.name}</span><HealthBadge health={r.health} /><AccessBadge access={r.access} /><span className="ml-auto text-[12px] text-muted">target {day(r.targetDate)}</span></div>
                    <p className="mt-1 text-[12.5px] text-slate-600">{r.reasons.join(" · ")}</p>
                    <p className="mt-1 text-[12px] text-muted">{r.team?.name} · lead {r.lead?.name ?? "—"}</p>
                  </Link>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<History className="h-4 w-4" />} title="What changed since the last review" description={`Since ${day(data.changesSinceReview.since, true)}`} />
              <CardBody className="space-y-2">
                {data.changesSinceReview.statusChanges.length === 0 && <p className="text-[13px] text-muted">No project status changes in this period.</p>}
                {data.changesSinceReview.statusChanges.map((c, i) => (
                  <Link key={i} href={`/projects/${c.projectId}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-subtle/70">
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    {c.from && <StatusBadge status={c.from} />}<ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden />{c.to && <StatusBadge status={c.to} />}
                    <span className="w-20 text-right text-[11.5px] text-muted">{relative(c.at)}</span>
                  </Link>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<Diamond className="h-4 w-4" />} title="Strategic milestones" description="Critical milestones still open" />
              <CardBody className="space-y-1.5">
                {data.criticalMilestones.map((m) => (
                  <Link key={m.id} href={`/milestones/${m.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-subtle/70"><span className="min-w-0"><span className="block truncate font-medium">{m.title}</span><span className="block text-[12px] text-muted">{m.project.name}</span></span><span className="shrink-0 text-[12px] text-muted">{day(m.dueDate)}</span></Link>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<GitBranch className="h-4 w-4" />} title="Dependencies between initiatives" />
              <CardBody className="space-y-2">
                {data.crossInitiativeDependencies.length === 0 && <p className="text-[13px] text-muted">None unresolved.</p>}
                {data.crossInitiativeDependencies.map((d) => (
                  <Link key={d.id} href={`/dependencies?projectId=${d.downstream.id}`} className="block rounded-lg border border-line px-3 py-2 text-[13px] hover:border-line-strong">
                    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate"><strong className="font-medium">{d.downstream.name}</strong> ← {d.upstream.name}</span>{d.isCritical && <Badge tone="danger">Critical</Badge>}<StatusBadge status={d.state} /></div>
                    <p className="text-[12px] text-muted">{d.downstream.initiative ?? "—"} depends on {d.upstream.initiative ?? "—"}</p>
                  </Link>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<UserX className="h-4 w-4" />} title="Ownership gaps" />
              <CardBody className="space-y-3 text-[13px]">
                <Gap title="Serious blockers without an owner" items={data.ownershipGaps.unownedSeriousBlockers.map((b) => ({ id: b.id, href: `/blockers/${b.id}`, text: `${b.title} · ${label(b.severity)} · ${b.ageDays}d` }))} />
                <Gap title="Teams without a lead" items={data.ownershipGaps.teamsWithoutLead.map((t) => ({ id: t.id, href: `/teams/${t.id}`, text: t.name }))} />
                <Gap title="Projects without a lead" items={data.ownershipGaps.projectsWithoutLead.map((p) => ({ id: p.id, href: `/projects/${p.id}`, text: p.name }))} />
                <Gap title="Initiatives without visible projects" items={data.ownershipGaps.initiativesWithoutProjects.map((i) => ({ id: i.id, href: `/initiatives/${i.id}`, text: i.title }))} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Decisions waiting" />
              <CardBody className="space-y-2">
                {data.pendingDecisions.length === 0 && <p className="text-[13px] text-muted">Nothing pending.</p>}
                {data.pendingDecisions.map((d) => (
                  <Link key={d.id} href={d.meetingId ? `/meetings/${d.meetingId}` : "/decisions"} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-subtle/70"><span className="text-[13px] font-medium">{d.title}</span>{d.owner && <PersonChip person={d.owner} sub={null} size="xs" link={false} />}</Link>
                ))}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

function Gap({ title, items }: { title: string; items: Array<{ id: string; href: string; text: string }> }) {
  return (
    <div>
      <p className="mb-1 text-[12px] font-medium text-muted">{title} ({items.length})</p>
      {items.length === 0 ? <p className="text-[12.5px] text-faint">None</p> : <ul className="space-y-1">{items.map((i) => <li key={i.id}><Link href={i.href} className="text-[13px] hover:text-brand-deep">{i.text}</Link></li>)}</ul>}
    </div>
  );
}

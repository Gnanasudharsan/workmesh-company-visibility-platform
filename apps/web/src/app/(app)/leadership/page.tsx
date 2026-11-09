"use client";

import { label } from "@workmesh/core";
import { AlertTriangle, ArrowRight, Building2, Diamond, Gavel, GitBranch, History, Map as MapIcon, PieChart, Target, UserX } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { HeroMetric, MidnightHero } from "@/components/midnight/hero";
import { LivingMesh } from "@/components/midnight/living-mesh";
import { Donut, Legend, ProgressRing, SegmentedBar, type Segment } from "@/components/midnight/viz";
import { Reveal } from "@/components/motion/primitives";
import { ButtonLink } from "@/components/ui/button";
import { PersonChip } from "@/components/ui/avatar";
import { AccessBadge, Badge, HealthBadge, StatusBadge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorState, LoadingCards, ProgressBar } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { useApi } from "@/lib/hooks";
import type { PersonLite } from "@/lib/types";
import { cn, day, relative } from "@/lib/utils";

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

const HEALTH_SEGMENTS: Array<{ key: keyof Omit<Health, "total">; label: string; color: string }> = [
  { key: "onTrack", label: "On track", color: "var(--color-success)" },
  { key: "notStarted", label: "Not started", color: "var(--color-unknown)" },
  { key: "atRisk", label: "At risk", color: "var(--color-warning)" },
  { key: "offTrack", label: "Off track", color: "var(--color-danger)" },
  { key: "blocked", label: "Blocked", color: "var(--color-danger-ink)" },
  { key: "done", label: "Done", color: "var(--color-teal-ink)" },
];
const segmentsOf = (h: Health, hrefBase?: string): Segment[] => HEALTH_SEGMENTS.map((s) => ({ key: s.key, label: s.label, value: h[s.key] ?? 0, color: s.color, href: hrefBase }));

export default function LeadershipPage() {
  const [since, setSince] = useState("14");
  const { data, error, isLoading, refetch } = useApi<Leadership>(`/dashboard/leadership?sinceDays=${since}`);
  const portfolio = useMemo(() => (data ? segmentsOf(data.portfolioHealth).filter((s) => s.value > 0 || s.key !== "done") : []), [data]);
  return (
    <>
      <MidnightHero
        eyebrow="Leadership"
        title="Company command center"
        description="Goals, portfolio health and risk — summaries only. Restricted work stays invisible unless you have been granted access."
        actions={
          <>
            <ButtonLink href="/map" variant="accent"><MapIcon className="h-4 w-4" /> Open Company Map</ButtonLink>
            <Select value={since} onChange={(e) => setSince(e.target.value)} className="w-auto max-w-[240px] border-navy-line bg-white/[0.06] text-white [&>option]:text-ink" aria-label="Compare with"><option value="7">Changes in the last 7 days</option><option value="14">Since last review (14 days)</option><option value="30">Last 30 days</option></Select>
          </>
        }
      >
        {data && (
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-5">
            <HeroMetric label="Active projects" value={data.portfolioHealth.total} href="/projects" accent="teal" />
            <HeroMetric label="On track" value={data.portfolioHealth.onTrack} accent="teal" hint={data.portfolioHealth.total ? `${Math.round((data.portfolioHealth.onTrack / data.portfolioHealth.total) * 100)}% of portfolio` : undefined} />
            <HeroMetric label="At risk" value={data.portfolioHealth.atRisk} accent="amber" />
            <HeroMetric label="Off track or blocked" value={data.portfolioHealth.offTrack + data.portfolioHealth.blocked} accent="coral" />
            <HeroMetric label="Decisions waiting" value={data.pendingDecisions.length} href="/decisions" accent="violet" />
          </div>
        )}
      </MidnightHero>
      <div className="mt-5">
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading || !data ? <LoadingCards count={4} /> : (
        <Reveal className="space-y-5">
          <Reveal.Item className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader icon={<Target />} title="Company goals" description="Progress is computed from the milestones of linked projects" action={<ButtonLink href="/roadmap?view=goals" size="sm" variant="ghost">Goal hierarchy <ArrowRight className="h-3.5 w-3.5" /></ButtonLink>} />
              <CardBody className="space-y-4">
                {data.goals.map((g) => (
                  <div key={g.id} className="flex gap-4 rounded-[12px] border border-line p-3">
                    <ProgressRing value={g.progress} size={56} stroke={5.5} label={`${g.title} progress`} tone={g.blocked ? "danger" : g.atRisk ? "amber" : "teal"} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <Link href={`/goals/${g.id}`} className="min-w-0 flex-1 text-[14px] font-semibold leading-snug hover:text-teal-ink">{g.title}</Link>
                        {g.atRisk > 0 && <Badge tone="warning" icon={<AlertTriangle className="h-3 w-3" aria-hidden />}>{g.atRisk} need attention</Badge>}
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted">{g.period} · {g.projectCount} projects · owner {g.owner?.name ?? "—"}</p>
                      {g.initiatives.length > 0 && (
                        <ul className="mt-2.5 grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
                          {g.initiatives.map((i) => (
                            <li key={i.id}>
                              <Link href={`/initiatives/${i.id}`} className="block truncate text-[12px] text-ink-soft hover:text-teal-ink">{i.title}</Link>
                              <ProgressBar value={i.progress} label={`${i.title} progress`} tone={i.atRisk ? "warning" : "brand"} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
              </CardBody>
            </Card>
            <div className="space-y-5">
              <Card>
                <CardHeader icon={<PieChart />} title="Portfolio health" description="Active projects by computed health" />
                <CardBody className="flex flex-col items-center gap-5 sm:flex-row">
                  <Donut segments={portfolio} label="Portfolio health" center={<><span className="font-display text-[28px] font-semibold leading-none tabular-nums">{data.portfolioHealth.total}</span><span className="mt-1 text-[11px] text-muted">projects</span></>} />
                  <Legend segments={portfolio} showPercent className="w-full flex-1" />
                </CardBody>
              </Card>
              <Link href="/map" className="surface-midnight on-navy group relative isolate block overflow-hidden rounded-[var(--radius-card)] p-5 text-navy-text shadow-card">
                <LivingMesh className="absolute inset-0 -z-10 h-full w-full opacity-80" density={16} seed={5} />
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal">Company Map</p>
                <p className="mt-1 max-w-[260px] text-[16px] font-semibold text-white">See how goals, initiatives, teams and projects connect</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-teal">Open the map <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden /></span>
              </Link>
            </div>
          </Reveal.Item>

          <Reveal.Item>
            <Card>
              <CardHeader icon={<Building2 />} title="Department health" description="Active projects per department, by computed health" />
              <CardBody className="space-y-3">
                <div className="flex flex-wrap gap-x-4 gap-y-1">{HEALTH_SEGMENTS.filter((s) => s.key !== "done").map((s) => <span key={s.key} className="flex items-center gap-1.5 text-[11.5px] text-muted"><span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />{s.label}</span>)}</div>
                <div className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
                  {data.departments.filter((d) => d.total > 0).map((d) => (
                    <Link key={d.id} href={`/departments/${d.id}`} className="-mx-2 block rounded-[10px] px-2 py-1.5 hover:bg-subtle/70">
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-[13px]">
                        <span className="flex min-w-0 items-center gap-2 font-medium"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.color }} aria-hidden /><span className="truncate">{d.name}</span></span>
                        <span className="shrink-0 text-[12px] text-muted tabular-nums">{d.total} active{d.atRisk + d.offTrack + d.blocked > 0 ? ` · ${d.atRisk + d.offTrack + d.blocked} need attention` : ""}</span>
                      </div>
                      <SegmentedBar segments={segmentsOf(d).filter((s) => s.key !== "done")} label={`${d.name} health`} />
                    </Link>
                  ))}
                </div>
              </CardBody>
            </Card>
          </Reveal.Item>

          <Reveal.Item>
            <Card>
              <CardHeader icon={<Diamond />} title="Strategic milestone timeline" description="Critical milestones still open, placed by due date" />
              <CardBody><MilestoneTimeline items={data.criticalMilestones} /></CardBody>
            </Card>
          </Reveal.Item>

          <Reveal.Item className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader icon={<AlertTriangle />} title="Delivery risks" description="Why each project needs attention" />
              <CardBody className="space-y-3">
                {data.risks.length === 0 && <p className="text-[13px] text-muted">No projects at risk.</p>}
                {data.risks.map((r) => (
                  <Link key={r.id} href={`/projects/${r.id}`} className={cn("block rounded-[12px] border border-l-[3px] border-line p-3 transition-colors hover:border-line-strong", r.health === "AT_RISK" ? "border-l-warning" : "border-l-danger")}>
                    <div className="flex flex-wrap items-center gap-2"><span className="text-[13.5px] font-medium">{r.name}</span><HealthBadge health={r.health} /><AccessBadge access={r.access} /><span className="ml-auto text-[12px] text-muted">target {day(r.targetDate)}</span></div>
                    <p className="mt-1 text-[12.5px] text-ink-soft">{r.reasons.join(" · ")}</p>
                    <p className="mt-1 text-[12px] text-muted">{r.team?.name} · lead {r.lead?.name ?? "—"}</p>
                  </Link>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<History />} title="What changed since the last review" description={`Since ${day(data.changesSinceReview.since, true)}`} />
              <CardBody className="space-y-2">
                {data.changesSinceReview.statusChanges.length === 0 && <p className="text-[13px] text-muted">No project status changes in this period.</p>}
                {data.changesSinceReview.statusChanges.map((c, i) => (
                  <Link key={i} href={`/projects/${c.projectId}`} className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-[13px] hover:bg-subtle/70">
                    <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                    {c.from && <StatusBadge status={c.from} />}<ArrowRight className="h-3.5 w-3.5 text-faint" aria-hidden />{c.to && <StatusBadge status={c.to} />}
                    <span className="w-20 text-right text-[11.5px] text-muted">{relative(c.at)}</span>
                  </Link>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<GitBranch />} title="Dependencies between initiatives" />
              <CardBody className="space-y-2">
                {data.crossInitiativeDependencies.length === 0 && <p className="text-[13px] text-muted">None unresolved.</p>}
                {data.crossInitiativeDependencies.map((d) => (
                  <Link key={d.id} href={`/dependencies?projectId=${d.downstream.id}`} className="block rounded-[10px] border border-line px-3 py-2 text-[13px] transition-colors hover:border-line-strong">
                    <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate"><strong className="font-medium">{d.downstream.name}</strong> ← {d.upstream.name}</span>{d.isCritical && <Badge tone="danger">Critical</Badge>}<StatusBadge status={d.state} /></div>
                    <p className="text-[12px] text-muted">{d.downstream.initiative ?? "—"} depends on {d.upstream.initiative ?? "—"}</p>
                  </Link>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<Gavel />} title="Decision center" description="Decisions waiting on an owner" action={<ButtonLink href="/decisions" size="xs" variant="ghost">All</ButtonLink>} />
              <CardBody className="space-y-2">
                {data.pendingDecisions.length === 0 && <p className="text-[13px] text-muted">Nothing pending.</p>}
                {data.pendingDecisions.map((d) => (
                  <Link key={d.id} href={d.meetingId ? `/meetings/${d.meetingId}` : "/decisions"} className="flex items-center justify-between gap-2 rounded-[10px] px-2 py-1.5 hover:bg-subtle/70"><span className="flex min-w-0 items-center gap-2"><Badge tone="violet">Pending</Badge><span className="truncate text-[13px] font-medium">{d.title}</span></span>{d.owner && <PersonChip person={d.owner} sub={null} size="xs" link={false} />}</Link>
                ))}
              </CardBody>
            </Card>
            <Card className="xl:col-span-2">
              <CardHeader icon={<UserX />} title="Ownership gaps" description="Work that nobody is clearly accountable for" />
              <CardBody className="grid gap-5 text-[13px] sm:grid-cols-2 xl:grid-cols-4">
                <Gap title="Serious blockers without an owner" items={data.ownershipGaps.unownedSeriousBlockers.map((b) => ({ id: b.id, href: `/blockers/${b.id}`, text: `${b.title} · ${label(b.severity)} · ${b.ageDays}d` }))} />
                <Gap title="Teams without a lead" items={data.ownershipGaps.teamsWithoutLead.map((t) => ({ id: t.id, href: `/teams/${t.id}`, text: t.name }))} />
                <Gap title="Projects without a lead" items={data.ownershipGaps.projectsWithoutLead.map((p) => ({ id: p.id, href: `/projects/${p.id}`, text: p.name }))} />
                <Gap title="Initiatives without visible projects" items={data.ownershipGaps.initiativesWithoutProjects.map((i) => ({ id: i.id, href: `/initiatives/${i.id}`, text: i.title }))} />
              </CardBody>
            </Card>
          </Reveal.Item>
        </Reveal>
      )}
      </div>
    </>
  );
}

/** Places real milestone due dates on a time axis from today; overdue items pin to the left edge. */
function MilestoneTimeline({ items }: { items: Leadership["criticalMilestones"] }) {
  const [now] = useState(() => Date.now());
  const dated = items.filter((m) => m.dueDate).sort((a, b) => +new Date(a.dueDate!) - +new Date(b.dueDate!));
  if (dated.length === 0) return <p className="text-[13px] text-muted">No open critical milestones with a due date.</p>;
  const last = Math.max(+new Date(dated[dated.length - 1]!.dueDate!), now + 14 * 864e5);
  const span = last - now;
  const pct = (d: string) => Math.max(0, Math.min(100, ((+new Date(d) - now) / span) * 100));
  const weeks = Math.ceil(span / (7 * 864e5));
  const step = Math.max(1, Math.ceil(weeks / 6));
  return (
    <div className="overflow-x-auto pb-1">
      <div className="relative min-w-[640px] pt-2">
        <div className="relative h-7 border-b border-line">
          {Array.from({ length: Math.floor(weeks / step) + 1 }).map((_, i) => {
            const t = now + i * step * 7 * 864e5;
            const left = ((t - now) / span) * 100;
            return left <= 100 ? <span key={i} className="absolute bottom-1 -translate-x-1/2 text-[11px] text-faint tabular-nums first:translate-x-0" style={{ left: `${left}%` }}>{i === 0 ? "Today" : day(new Date(t).toISOString())}</span> : null;
          })}
        </div>
        <ol className="relative mt-1">
          {dated.map((m) => {
            const overdue = +new Date(m.dueDate!) < now;
            const left = pct(m.dueDate!);
            return (
              <li key={m.id} className="relative h-9">
                <span className="absolute inset-x-0 top-1/2 h-px bg-subtle" aria-hidden />
                <Link href={`/milestones/${m.id}`} className={cn("group absolute top-1/2 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap", left > 62 && "flex-row-reverse")} style={left > 62 ? { right: `${100 - left}%` } : { left: `${left}%` }}>
                  <span className={cn("h-3 w-3 shrink-0 rotate-45 rounded-[2px] ring-2 ring-surface", overdue ? "bg-danger" : "bg-amber-bright")} aria-hidden />
                  <span className="rounded-md bg-surface px-1 text-[12.5px] font-medium group-hover:text-teal-ink">{m.title}</span>
                  <span className="text-[11.5px] text-muted">{m.project.name} · {overdue ? <span className="font-medium text-danger-ink">overdue</span> : day(m.dueDate)}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function Gap({ title, items }: { title: string; items: Array<{ id: string; href: string; text: string }> }) {
  return (
    <div>
      <p className="mb-1 text-[12px] font-medium text-muted">{title} ({items.length})</p>
      {items.length === 0 ? <p className="text-[12.5px] text-faint">None</p> : <ul className="space-y-1">{items.map((i) => <li key={i.id}><Link href={i.href} className="text-[13px] hover:text-teal-ink">{i.text}</Link></li>)}</ul>}
    </div>
  );
}

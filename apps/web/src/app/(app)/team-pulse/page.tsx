"use client";

import { label } from "@workmesh/core";
import { CalendarClock, ClipboardCheck, Flag, GitBranch, HandHelping, LayoutGrid, List, MessageCircleQuestion, OctagonAlert, Radar, Scale, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Donut, Legend, SegmentedBar, type Segment } from "@/components/midnight/viz";
import { Reveal } from "@/components/motion/primitives";
import { Avatar, PersonChip } from "@/components/ui/avatar";
import { Badge, FreshnessBadge, SeverityBadge, StageBadge, StatusBadge } from "@/components/ui/badges";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader, Stat } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Field, Input, Segmented, Select } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { BlockerRow, ProjectRow } from "@/components/work/cards";
import { isoDate, ProjectSelect, TeamSelect } from "@/components/work/pickers";
import { api, useAction, useApi } from "@/lib/hooks";
import type { Blocker, MeetingSummary, PersonLite, ProjectSummary } from "@/lib/types";
import { cn, day, dateTime, relative } from "@/lib/utils";

interface Report {
  person: PersonLite & { teams: Array<{ id: string; name: string }>; isDirect: boolean };
  primaryAssignment: { id: string; title: string; status: string; project: { id: string; name: string } } | null;
  openAssignments: number;
  latestUpdate: { id: string; stage: string; currentFocus: string; nextSteps: string | null; helpNeeded: string | null; publishedAt: string } | null;
  freshness: string;
  nextMilestone: { id: string; title: string; dueDate: string } | null;
  blockers: Array<{ id: string; title: string; severity: string; state: string; ownerId: string | null }>;
  helpRequested: boolean;
}

interface Pulse {
  summary: { people: number; direct: number; openBlockers: number; helpRequests: number; noRecentUpdate: number; staleAfterDays: number };
  reports: Report[];
  blockerQueue: Blocker[];
  activeProjects: ProjectSummary[];
  upcomingDeadlines: Array<{ id: string; title: string; dueDate: string; isCritical: boolean; project: { id: string; name: string } }>;
  dependencies: Array<{ id: string; state: string; isCritical: boolean; description: string; upstream: { id: string; name?: string }; downstream: { id: string; name?: string } }>;
  pendingDecisions: Array<{ id: string; title: string; meetingId: string | null; owner: PersonLite | null }>;
  upcomingMeetings: MeetingSummary[];
  waitingForReview: Array<{ id: string; title: string; project: { id: string; name: string }; assignee: PersonLite | null }>;
}

type PulseState = "blocked" | "help" | "stale" | "steady";
const STATE_META: Record<PulseState, { label: string; color: string; tone: string }> = {
  blocked: { label: "Has a blocker", color: "var(--color-danger)", tone: "border-l-danger" },
  help: { label: "Asked for help", color: "var(--color-warning)", tone: "border-l-warning" },
  stale: { label: "No recent update", color: "var(--color-unknown)", tone: "border-l-line-strong" },
  steady: { label: "Sharing, no blockers", color: "var(--color-teal)", tone: "border-l-teal" },
};
/** Classifies what a report has chosen to share. It describes information, never performance. */
const pulseState = (r: Report): PulseState => (r.blockers.length ? "blocked" : r.helpRequested ? "help" : r.freshness === "EARLIER" || r.freshness === "NONE" ? "stale" : "steady");
const SEVERITY_COLOR: Record<string, string> = { CRITICAL: "var(--color-danger)", HIGH: "var(--color-coral)", MEDIUM: "var(--color-warning)", LOW: "var(--color-unknown)" };

export default function TeamPulsePage() {
  const [status, setStatus] = useState("");
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sinceDays, setSinceDays] = useState("30");
  const [scope, setScope] = useState<"direct" | "all">("direct");
  const [view, setView] = useState<"cards" | "list">("cards");
  const [ask, setAsk] = useState<Report | null>(null);
  const [assign, setAssign] = useState<Report | null>(null);
  const qs = new URLSearchParams({ ...(status && { status }), ...(teamId && { teamId }), ...(projectId && { projectId }), sinceDays });
  const { data, error, isLoading, refetch } = useApi<Pulse>(`/dashboard/manager?${qs.toString()}`);
  const rows = useMemo(() => (data?.reports ?? []).filter((r) => scope === "all" || r.person.isDirect), [data, scope]);
  const stateSegments: Segment[] = useMemo(() => {
    const counts: Record<PulseState, number> = { blocked: 0, help: 0, stale: 0, steady: 0 };
    rows.forEach((r) => counts[pulseState(r)]++);
    return (Object.keys(counts) as PulseState[]).map((k) => ({ key: k, label: STATE_META[k].label, value: counts[k], color: STATE_META[k].color }));
  }, [rows]);
  const severitySegments: Segment[] = useMemo(() => {
    const c: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    (data?.blockerQueue ?? []).forEach((b) => (c[b.severity] = (c[b.severity] ?? 0) + 1));
    return Object.entries(c).map(([k, v]) => ({ key: k, label: label(k), value: v, color: SEVERITY_COLOR[k] ?? "var(--color-unknown)" }));
  }, [data]);

  return (
    <>
      <PageHeader eyebrow="Team Pulse" title="Your Team, At a Glance" description="What your people are working on, what's blocking them and where they need help — from what they've chosen to share." actions={<ButtonLink href="/meetings" variant="secondary"><CalendarClock className="h-4 w-4" /> Prepare a meeting</ButtonLink>} />
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading || !data ? <LoadingCards count={4} /> : (
        <Reveal>
          <Reveal.Item className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Card className="p-5">
              <div className="flex flex-col items-center gap-5 sm:flex-row">
                <Donut
                  segments={stateSegments}
                  label="Team status overview"
                  center={<><span className="font-display text-[28px] font-semibold leading-none tabular-nums">{rows.length}</span><span className="mt-1 text-[11px] text-muted">{scope === "direct" ? "direct reports" : "people"}</span></>}
                />
                <div className="w-full min-w-0 flex-1">
                  <h2 className="text-[14.5px] font-semibold">Team status overview</h2>
                  <p className="mb-3 mt-0.5 text-[12px] text-muted">Based on blockers, help requests and update freshness</p>
                  <Legend segments={stateSegments} showPercent />
                </div>
              </div>
            </Card>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              <Stat label="People in your line" value={data.summary.people} hint={`${data.summary.direct} direct`} icon={<Users />} />
              <Stat label="Open blockers" value={data.summary.openBlockers} tone={data.summary.openBlockers ? "danger" : "default"} icon={<OctagonAlert />} href="/blockers?scope=queue" />
              <Stat label="Help requested" value={data.summary.helpRequests} tone={data.summary.helpRequests ? "warning" : "default"} icon={<HandHelping />} />
              <Stat label="No recent update" value={data.summary.noRecentUpdate} hint={`> ${data.summary.staleAfterDays} days`} icon={<Scale />} />
              <Stat label="Waiting for review" value={data.waitingForReview.length} tone="info" icon={<ClipboardCheck />} />
              <Stat label="Due in 3 weeks" value={data.upcomingDeadlines.length} hint={`${data.upcomingDeadlines.filter((m) => m.isCritical).length} critical`} icon={<Flag />} />
            </div>
          </Reveal.Item>

          <Reveal.Item className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented label="People" value={scope} onChange={setScope} options={[{ value: "direct", label: "Direct reports" }, { value: "all", label: "Whole reporting line" }]} />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto max-w-[210px]" aria-label="Status filter">
              <option value="">Everyone</option><option value="blocked">Has a blocker</option><option value="help">Asked for help</option><option value="stale">No recent update</option>
            </Select>
            <TeamSelect value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="Any team" className="w-auto max-w-[210px]" aria-label="Team filter" />
            <ProjectSelect value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Any project" className="w-auto max-w-[210px]" aria-label="Project filter" />
            <Select value={sinceDays} onChange={(e) => setSinceDays(e.target.value)} className="w-auto max-w-[210px]" aria-label="Time period"><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></Select>
            <div className="ml-auto">
              <Segmented label="Layout" value={view} onChange={setView} options={[{ value: "cards", label: "Cards", icon: <LayoutGrid className="h-3.5 w-3.5" aria-hidden /> }, { value: "list", label: "List", icon: <List className="h-3.5 w-3.5" aria-hidden /> }]} />
            </div>
          </Reveal.Item>

          <Reveal.Item>
            {rows.length === 0 ? <Card><EmptyState title="Nobody matches these filters" /></Card> : view === "cards" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {rows.map((r) => <ReportCard key={r.person.id} r={r} onAsk={() => setAsk(r)} onAssign={() => setAssign(r)} />)}
              </div>
            ) : <ReportTable rows={rows} onAsk={setAsk} onAssign={setAssign} />}
            <p className="mb-6 mt-3 flex items-center gap-1.5 text-[12px] text-muted"><Scale className="h-3.5 w-3.5" aria-hidden /> Freshness describes information, not people. WorkMesh never measures online time or activity volume.</p>
          </Reveal.Item>

          <Reveal.Item className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader icon={<Radar />} title="Blocker radar" description="Unresolved blockers you can act on, by severity" action={<ButtonLink href="/blockers?scope=queue" size="xs" variant="ghost">All</ButtonLink>} />
              <CardBody className="px-2 pb-2">
                {data.blockerQueue.length ? (
                  <>
                    <div className="px-3 pb-3">
                      <SegmentedBar segments={severitySegments} label="Blockers by severity" />
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        {severitySegments.filter((s) => s.value).map((s) => <span key={s.key} className="flex items-center gap-1.5 text-[11.5px] text-muted"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />{s.label} <strong className="font-semibold text-ink tabular-nums">{s.value}</strong></span>)}
                      </div>
                    </div>
                    {data.blockerQueue.slice(0, 8).map((b) => <BlockerRow key={b.id} b={b} />)}
                  </>
                ) : <EmptyState compact title="No unresolved blockers" />}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<ClipboardCheck />} title="Action queue" description="Work waiting for review and decisions waiting on an owner" />
              <CardBody className="space-y-1.5">
                {data.waitingForReview.map((w) => (
                  <Link key={w.id} href={`/projects/${w.project.id}?tab=work&item=${w.id}`} className="flex items-center gap-3 rounded-[10px] px-2 py-1.5 hover:bg-subtle/70">
                    <Badge tone="info">Review</Badge>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{w.title}</span><span className="block truncate text-[12px] text-muted">{w.project.name}{w.assignee ? ` · ${w.assignee.name}` : ""}</span></span>
                  </Link>
                ))}
                {data.pendingDecisions.map((d) => (
                  <Link key={d.id} href={d.meetingId ? `/meetings/${d.meetingId}` : "/decisions"} className="flex items-center gap-3 rounded-[10px] px-2 py-1.5 hover:bg-subtle/70">
                    <Badge tone="violet">Decision</Badge>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{d.title}</span><span className="block text-[12px] text-muted">{d.owner ? `Owner: ${d.owner.name}` : "No owner"}</span></span>
                  </Link>
                ))}
                {!data.waitingForReview.length && !data.pendingDecisions.length && <p className="text-[13px] text-muted">Nothing waiting on you.</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<Flag />} title="Upcoming deadlines" description="Milestones in the next three weeks" />
              <CardBody>
                {data.upcomingDeadlines.length ? (
                  <ol className="relative space-y-3 border-l border-line pl-4">
                    {data.upcomingDeadlines.map((m) => (
                      <li key={m.id} className="relative">
                        <span className={cn("absolute -left-[21.5px] top-1.5 h-2.5 w-2.5 rotate-45 rounded-[2px] ring-2 ring-surface", m.isCritical ? "bg-danger" : "bg-teal")} aria-hidden />
                        <Link href={`/milestones/${m.id}`} className="flex items-baseline justify-between gap-3 hover:text-teal-ink">
                          <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{m.title}{m.isCritical && <span className="text-danger-ink"> · critical</span>}</span><span className="block text-[12px] text-muted">{m.project.name}</span></span>
                          <span className="shrink-0 text-[12px] tabular-nums text-muted">{day(m.dueDate)}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                ) : <p className="text-[13px] text-muted">Nothing due in the next three weeks.</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<GitBranch />} title="Dependencies affecting your team" />
              <CardBody className="space-y-2">
                {data.dependencies.length ? data.dependencies.map((d) => (
                  <Link key={d.id} href={`/dependencies?projectId=${d.downstream.id}`} className="flex items-center gap-2 rounded-[10px] border border-line px-3 py-2 text-[13px] transition-colors hover:border-line-strong">
                    <span className="min-w-0 flex-1 truncate"><strong className="font-medium">{d.downstream.name}</strong> waits on <strong className="font-medium">{d.upstream.name}</strong></span>
                    {d.isCritical && <Badge tone="danger">Critical</Badge>}<StatusBadge status={d.state} />
                  </Link>
                )) : <p className="text-[13px] text-muted">No unresolved dependencies.</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<Users />} title="Active projects" description="Projects your people contribute to" />
              <CardBody className="px-2 pb-2">{data.activeProjects.length ? data.activeProjects.map((p) => <ProjectRow key={p.id} p={p} compact />) : <EmptyState compact title="No active projects" />}</CardBody>
            </Card>
            <Card>
              <CardHeader icon={<CalendarClock />} title="Upcoming meetings" action={<ButtonLink href="/meetings" size="xs" variant="ghost">All</ButtonLink>} />
              <CardBody className="space-y-1.5">
                {data.upcomingMeetings.length ? data.upcomingMeetings.map((m) => (
                  <Link key={m.id} href={`/meetings/${m.id}`} className="flex items-center justify-between rounded-[10px] px-2 py-1.5 text-[13px] hover:bg-subtle/70"><span className="font-medium">{m.title}</span><span className="text-[12px] text-muted">{dateTime(m.scheduledAt)}</span></Link>
                )) : <p className="text-[13px] text-muted">Nothing scheduled.</p>}
              </CardBody>
            </Card>
          </Reveal.Item>
        </Reveal>
      )}
      <AskDialog report={ask} onClose={() => setAsk(null)} />
      <AssignDialog report={assign} onClose={() => setAssign(null)} />
    </>
  );
}

function ReportCard({ r, onAsk, onAssign }: { r: Report; onAsk: () => void; onAssign: () => void }) {
  const st = pulseState(r);
  return (
    <article aria-label={r.person.name} className={cn("flex flex-col rounded-[var(--radius-card)] border border-l-[3px] border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-raised", STATE_META[st].tone)}>
      <header className="flex items-start gap-3">
        <Avatar name={r.person.name} hue={r.person.avatarHue} size="md" />
        <div className="min-w-0 flex-1">
          <Link href={`/people/${r.person.id}`} className="block truncate text-[14px] font-semibold hover:text-teal-ink">{r.person.name}</Link>
          <p className="truncate text-[12px] text-muted">{r.person.title}{r.person.teams.length ? ` · ${r.person.teams.map((t) => t.name).join(", ")}` : ""}{!r.person.isDirect && " · indirect"}</p>
        </div>
        <span className="sr-only">Status: {STATE_META[st].label}</span>
      </header>
      <div className="mt-3 flex flex-wrap items-center gap-1.5"><FreshnessBadge freshness={r.freshness} />{r.latestUpdate && <StageBadge stage={r.latestUpdate.stage} />}</div>
      <div className="mt-3 space-y-2.5 text-[13px]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Current focus</p>
          {r.primaryAssignment ? (
            <Link href={`/projects/${r.primaryAssignment.project.id}?tab=work&item=${r.primaryAssignment.id}`} className="block hover:text-teal-ink">
              <span className="block truncate font-medium">{r.primaryAssignment.title}</span>
              <span className="block truncate text-[12px] text-muted">{r.primaryAssignment.project.name} · {r.openAssignments} open</span>
            </Link>
          ) : <p className="text-muted">No open assignments you can see</p>}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Latest shared update</p>
          {r.latestUpdate ? (
            <Link href={`/updates/${r.latestUpdate.id}`} className="block hover:text-teal-ink">
              <span className="line-clamp-2">{r.latestUpdate.currentFocus}</span>
              <span className="text-[11.5px] text-faint">{relative(r.latestUpdate.publishedAt)}{r.nextMilestone ? ` · next ◆ ${r.nextMilestone.title} ${day(r.nextMilestone.dueDate)}` : ""}</span>
            </Link>
          ) : <p className="text-[12px] text-muted">Nothing shared with you in this period</p>}
        </div>
        {(r.blockers.length > 0 || (r.helpRequested && r.latestUpdate?.helpNeeded)) && (
          <div className="space-y-1 rounded-[10px] bg-subtle/70 p-2">
            {r.blockers.map((b) => (
              <Link key={b.id} href={`/blockers/${b.id}`} className="flex items-center gap-1.5 hover:text-teal-ink"><SeverityBadge severity={b.severity} /><span className="truncate">{b.title}</span></Link>
            ))}
            {r.helpRequested && r.latestUpdate?.helpNeeded && <p className="flex items-start gap-1 text-[12px] text-warning-ink"><HandHelping className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {r.latestUpdate.helpNeeded}</p>}
          </div>
        )}
      </div>
      <div className="min-h-3 flex-1" />
      <footer className="flex gap-1 border-t border-line pt-3">
        <Button size="xs" variant="soft" onClick={onAsk} title="Ask for a progress update"><MessageCircleQuestion className="h-3.5 w-3.5" /> Ask</Button>
        <Button size="xs" variant="ghost" onClick={onAssign} title="Assign an action item">+ Action</Button>
        <ButtonLink href={`/people/${r.person.id}`} size="xs" variant="ghost" className="ml-auto">Profile</ButtonLink>
      </footer>
    </article>
  );
}

function ReportTable({ rows, onAsk, onAssign }: { rows: Report[]; onAsk: (r: Report) => void; onAssign: (r: Report) => void }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-faint">
            <th className="px-4 py-2.5">Person</th><th className="px-4 py-2.5">Current focus</th><th className="px-4 py-2.5">Latest shared update</th><th className="px-4 py-2.5">Next milestone</th><th className="px-4 py-2.5">Blockers & help</th><th className="px-4 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.person.id} className="border-b border-line align-top last:border-0 hover:bg-subtle/40">
              <td className="px-4 py-3">
                <PersonChip person={r.person} />
                <p className="mt-1 pl-9 text-[11.5px] text-muted">{r.person.teams.map((t) => t.name).join(", ")}{!r.person.isDirect && " · indirect"}</p>
              </td>
              <td className="max-w-[220px] px-4 py-3">
                {r.primaryAssignment ? (
                  <Link href={`/projects/${r.primaryAssignment.project.id}?tab=work&item=${r.primaryAssignment.id}`} className="block hover:text-teal-ink">
                    <span className="block truncate font-medium">{r.primaryAssignment.title}</span>
                    <span className="block truncate text-[12px] text-muted">{r.primaryAssignment.project.name} · {r.openAssignments} open</span>
                  </Link>
                ) : <span className="text-muted">No open assignments you can see</span>}
              </td>
              <td className="max-w-[280px] px-4 py-3">
                <div className="mb-1 flex flex-wrap items-center gap-1.5"><FreshnessBadge freshness={r.freshness} />{r.latestUpdate && <StageBadge stage={r.latestUpdate.stage} />}</div>
                {r.latestUpdate ? (
                  <Link href={`/updates/${r.latestUpdate.id}`} className="block hover:text-teal-ink">
                    <span className="line-clamp-1">{r.latestUpdate.currentFocus}</span>
                    {r.latestUpdate.nextSteps && <span className="line-clamp-1 text-[12px] text-muted">Next: {r.latestUpdate.nextSteps}</span>}
                    <span className="text-[11.5px] text-faint">{relative(r.latestUpdate.publishedAt)}</span>
                  </Link>
                ) : <span className="text-[12px] text-muted">Nothing shared with you in this period</span>}
              </td>
              <td className="px-4 py-3">{r.nextMilestone ? <><p className="truncate font-medium">{r.nextMilestone.title}</p><p className="text-[12px] text-muted">{day(r.nextMilestone.dueDate)}</p></> : <span className="text-muted">—</span>}</td>
              <td className="max-w-[220px] space-y-1 px-4 py-3">
                {r.blockers.map((b) => (
                  <Link key={b.id} href={`/blockers/${b.id}`} className="flex items-center gap-1.5 hover:text-teal-ink"><SeverityBadge severity={b.severity} /><span className="truncate">{b.title}</span></Link>
                ))}
                {r.helpRequested && r.latestUpdate?.helpNeeded && <p className="flex items-start gap-1 text-[12px] text-warning-ink"><HandHelping className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {r.latestUpdate.helpNeeded}</p>}
                {!r.blockers.length && !r.helpRequested && <span className="text-muted">—</span>}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <Button size="xs" variant="ghost" onClick={() => onAsk(r)} title="Ask for a progress update"><MessageCircleQuestion className="h-3.5 w-3.5" /> Ask</Button>
                  <Button size="xs" variant="ghost" onClick={() => onAssign(r)} title="Assign an action item">+ Action</Button>
                  <ButtonLink href={`/people/${r.person.id}`} size="xs" variant="ghost">Profile</ButtonLink>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function AskDialog({ report, onClose }: { report: Report | null; onClose: () => void }) {
  const [note, setNote] = useState("");
  const send = useAction(() => api.post(`/people/${report!.person.id}/request-update`, { note: note || null }), { success: "Request sent", onSuccess: () => (setNote(""), onClose()) });
  return (
    <Dialog open={!!report} onOpenChange={(o) => !o && onClose()} title={`Ask ${report?.person.name ?? ""} for an update`} description="They'll get a friendly in-app notification." footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={send.isPending} onClick={() => send.mutate(undefined)}>Send request</Button></>}>
      <Field label="Optional note" htmlFor="ask-note"><Input id="ask-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Ahead of Thursday's sync — how is the webhook work going?" /></Field>
    </Dialog>
  );
}

function AssignDialog({ report, onClose }: { report: Report | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const create = useAction(() => api.post("/action-items", { title, ownerId: report!.person.id, dueDate: isoDate(due) }), { success: "Action item assigned", invalidate: ["/action-items", "/dashboard"], onSuccess: () => (setTitle(""), setDue(""), onClose()) });
  return (
    <Dialog open={!!report} onOpenChange={(o) => !o && onClose()} title={`Assign an action item to ${report?.person.name ?? ""}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={title.trim().length < 2} loading={create.isPending} onClick={() => create.mutate(undefined)}>Assign</Button></>}>
      <div className="space-y-3">
        <Field label="What needs to happen?" htmlFor="ai-title"><Input id="ai-title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
        <Field label="Due" htmlFor="ai-due"><Input id="ai-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}

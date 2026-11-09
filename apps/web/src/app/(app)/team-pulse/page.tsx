"use client";

import { label } from "@workmesh/core";
import { CalendarClock, GitBranch, HandHelping, MessageCircleQuestion, OctagonAlert, Scale, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PersonChip } from "@/components/ui/avatar";
import { Badge, FreshnessBadge, SeverityBadge, StatusBadge } from "@/components/ui/badges";
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

export default function TeamPulsePage() {
  const [status, setStatus] = useState("");
  const [teamId, setTeamId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [sinceDays, setSinceDays] = useState("30");
  const [scope, setScope] = useState<"direct" | "all">("direct");
  const [ask, setAsk] = useState<Report | null>(null);
  const [assign, setAssign] = useState<Report | null>(null);
  const qs = new URLSearchParams({ ...(status && { status }), ...(teamId && { teamId }), ...(projectId && { projectId }), sinceDays });
  const { data, error, isLoading, refetch } = useApi<Pulse>(`/dashboard/manager?${qs.toString()}`);
  const rows = (data?.reports ?? []).filter((r) => scope === "all" || r.person.isDirect);

  return (
    <>
      <PageHeader title="Team Pulse" description="What your people are working on, what's blocking them and where they need help — from what they've chosen to share." actions={<ButtonLink href="/meetings" variant="secondary"><CalendarClock className="h-4 w-4" /> Prepare a meeting</ButtonLink>} />
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading || !data ? <LoadingCards count={4} /> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="People in your line" value={data.summary.people} hint={`${data.summary.direct} direct`} />
            <Stat label="Open blockers" value={data.summary.openBlockers} tone={data.summary.openBlockers ? "danger" : "default"} />
            <Stat label="Help requested" value={data.summary.helpRequests} tone={data.summary.helpRequests ? "warning" : "default"} />
            <Stat label="No recent update" value={data.summary.noRecentUpdate} hint={`> ${data.summary.staleAfterDays} days`} />
            <Stat label="Waiting for review" value={data.waitingForReview.length} tone="info" />
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Segmented label="People" value={scope} onChange={setScope} options={[{ value: "direct", label: "Direct reports" }, { value: "all", label: "Whole reporting line" }]} />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Status filter">
              <option value="">Everyone</option><option value="blocked">Has a blocker</option><option value="help">Asked for help</option><option value="stale">No recent update</option>
            </Select>
            <TeamSelect value={teamId} onChange={(e) => setTeamId(e.target.value)} placeholder="Any team" className="w-auto" aria-label="Team filter" />
            <ProjectSelect value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Any project" className="w-auto" aria-label="Project filter" />
            <Select value={sinceDays} onChange={(e) => setSinceDays(e.target.value)} className="w-auto" aria-label="Time period"><option value="7">Last 7 days</option><option value="14">Last 14 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></Select>
          </div>

          <Card className="mb-5 overflow-x-auto">
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
                        <Link href={`/projects/${r.primaryAssignment.project.id}?tab=work&item=${r.primaryAssignment.id}`} className="block hover:text-brand-deep">
                          <span className="block truncate font-medium">{r.primaryAssignment.title}</span>
                          <span className="block truncate text-[12px] text-muted">{r.primaryAssignment.project.name} · {r.openAssignments} open</span>
                        </Link>
                      ) : <span className="text-muted">No open assignments you can see</span>}
                    </td>
                    <td className="max-w-[280px] px-4 py-3">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5"><FreshnessBadge freshness={r.freshness} />{r.latestUpdate && <Badge tone="brand">{label(r.latestUpdate.stage)}</Badge>}</div>
                      {r.latestUpdate ? (
                        <Link href={`/updates/${r.latestUpdate.id}`} className="block hover:text-brand-deep">
                          <span className="line-clamp-1">{r.latestUpdate.currentFocus}</span>
                          {r.latestUpdate.nextSteps && <span className="line-clamp-1 text-[12px] text-muted">Next: {r.latestUpdate.nextSteps}</span>}
                          <span className="text-[11.5px] text-faint">{relative(r.latestUpdate.publishedAt)}</span>
                        </Link>
                      ) : <span className="text-[12px] text-muted">Nothing shared with you in this period</span>}
                    </td>
                    <td className="px-4 py-3">{r.nextMilestone ? <><p className="truncate font-medium">{r.nextMilestone.title}</p><p className="text-[12px] text-muted">{day(r.nextMilestone.dueDate)}</p></> : <span className="text-muted">—</span>}</td>
                    <td className="max-w-[220px] space-y-1 px-4 py-3">
                      {r.blockers.map((b) => (
                        <Link key={b.id} href={`/blockers/${b.id}`} className="flex items-center gap-1.5 hover:text-brand-deep"><SeverityBadge severity={b.severity} /><span className="truncate">{b.title}</span></Link>
                      ))}
                      {r.helpRequested && r.latestUpdate?.helpNeeded && <p className="flex items-start gap-1 text-[12px] text-amber-800"><HandHelping className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {r.latestUpdate.helpNeeded}</p>}
                      {!r.blockers.length && !r.helpRequested && <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button size="xs" variant="ghost" onClick={() => setAsk(r)} title="Ask for a progress update"><MessageCircleQuestion className="h-3.5 w-3.5" /> Ask</Button>
                        <Button size="xs" variant="ghost" onClick={() => setAssign(r)} title="Assign an action item">+ Action</Button>
                        <ButtonLink href={`/people/${r.person.id}`} size="xs" variant="ghost">Profile</ButtonLink>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <EmptyState title="Nobody matches these filters" />}
          </Card>
          <p className="-mt-3 mb-5 flex items-center gap-1.5 text-[12px] text-muted"><Scale className="h-3.5 w-3.5" aria-hidden /> Freshness describes information, not people. WorkMesh never measures online time or activity volume.</p>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader icon={<OctagonAlert className="h-4 w-4" />} title="Blocker queue" description="Unresolved blockers you can act on" action={<ButtonLink href="/blockers?scope=queue" size="xs" variant="ghost">All</ButtonLink>} />
              <CardBody className="px-2 pb-2">{data.blockerQueue.length ? data.blockerQueue.slice(0, 8).map((b) => <BlockerRow key={b.id} b={b} />) : <EmptyState compact title="No unresolved blockers" />}</CardBody>
            </Card>
            <Card>
              <CardHeader icon={<Users className="h-4 w-4" />} title="Active projects" description="Projects your people contribute to" />
              <CardBody className="px-2 pb-2">{data.activeProjects.length ? data.activeProjects.map((p) => <ProjectRow key={p.id} p={p} compact />) : <EmptyState compact title="No active projects" />}</CardBody>
            </Card>
            <Card>
              <CardHeader icon={<CalendarClock className="h-4 w-4" />} title="Upcoming deadlines" />
              <CardBody className="space-y-1.5">
                {data.upcomingDeadlines.length ? data.upcomingDeadlines.map((m) => (
                  <Link key={m.id} href={`/milestones/${m.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-subtle/70">
                    <span className="min-w-0"><span className="block truncate text-[13px] font-medium">{m.title}{m.isCritical && <span className="text-danger"> · critical</span>}</span><span className="block text-[12px] text-muted">{m.project.name}</span></span>
                    <span className="shrink-0 text-[12px] text-muted">{day(m.dueDate)}</span>
                  </Link>
                )) : <p className="text-[13px] text-muted">Nothing due in the next three weeks.</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={<GitBranch className="h-4 w-4" />} title="Dependencies affecting your team" />
              <CardBody className="space-y-2">
                {data.dependencies.length ? data.dependencies.map((d) => (
                  <Link key={d.id} href={`/dependencies?projectId=${d.downstream.id}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] hover:border-line-strong">
                    <span className="min-w-0 flex-1 truncate"><strong className="font-medium">{d.downstream.name}</strong> waits on <strong className="font-medium">{d.upstream.name}</strong></span>
                    {d.isCritical && <Badge tone="danger">Critical</Badge>}<StatusBadge status={d.state} />
                  </Link>
                )) : <p className="text-[13px] text-muted">No unresolved dependencies.</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Decisions waiting" />
              <CardBody className="space-y-1.5">
                {data.pendingDecisions.length ? data.pendingDecisions.map((d) => (
                  <Link key={d.id} href={d.meetingId ? `/meetings/${d.meetingId}` : "/decisions"} className="block rounded-lg px-2 py-1.5 text-[13px] hover:bg-subtle/70">{d.title}<span className="block text-[12px] text-muted">{d.owner ? `Owner: ${d.owner.name}` : "No owner"}</span></Link>
                )) : <p className="text-[13px] text-muted">No pending decisions.</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Upcoming meetings" action={<ButtonLink href="/meetings" size="xs" variant="ghost">All</ButtonLink>} />
              <CardBody className="space-y-1.5">
                {data.upcomingMeetings.length ? data.upcomingMeetings.map((m) => (
                  <Link key={m.id} href={`/meetings/${m.id}`} className={cn("flex items-center justify-between rounded-lg px-2 py-1.5 text-[13px] hover:bg-subtle/70")}><span className="font-medium">{m.title}</span><span className="text-[12px] text-muted">{dateTime(m.scheduledAt)}</span></Link>
                )) : <p className="text-[13px] text-muted">Nothing scheduled.</p>}
              </CardBody>
            </Card>
          </div>
        </>
      )}
      <AskDialog report={ask} onClose={() => setAsk(null)} />
      <AssignDialog report={assign} onClose={() => setAssign(null)} />
    </>
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

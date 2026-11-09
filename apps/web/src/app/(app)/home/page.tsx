"use client";

import { label } from "@workmesh/core";
import { ArrowRight, CalendarClock, CheckSquare, Compass, Flag, MessageSquarePlus, OctagonAlert, Sparkles, Target, Users } from "lucide-react";
import Link from "next/link";
import { PersonChip } from "@/components/ui/avatar";
import { Badge, FreshnessBadge, StatusBadge } from "@/components/ui/badges";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { BlockerRow, ProjectRow, UpdateCard } from "@/components/work/cards";
import { useApi, useMe } from "@/lib/hooks";
import { useUi } from "@/lib/store";
import type { Blocker, PersonLite, ProjectSummary, Update } from "@/lib/types";
import { day, daysUntil } from "@/lib/utils";

interface EmployeeDashboard {
  me: { id: string; name: string; title: string };
  manager: PersonLite | null;
  lastUpdate: Update | null;
  freshness: string;
  suggestedNextStep: string | null;
  currentStage: string | null;
  drafts: Update[];
  assignments: Array<{ id: string; title: string; status: string; priority: string; dueDate: string | null; project: { id: string; name: string; key: string }; milestone: { id: string; title: string } | null }>;
  projects: ProjectSummary[];
  blockers: Blocker[];
  teamActivity: Update[];
  upcomingMilestones: Array<{ id: string; title: string; dueDate: string; isCritical: boolean; status: string; project: { id: string; name: string } }>;
  actionItems: Array<{ id: string; title: string; dueDate: string | null; meeting: { id: string; title: string } | null }>;
  goalContributions: Array<{ id: string; title: string; progress: number | null; projects: Array<{ id: string; name: string; initiative?: string }> }>;
  helpers: Array<PersonLite | null>;
}

export default function HomePage() {
  const { data: me } = useMe();
  const { data, error, isLoading, refetch } = useApi<EmployeeDashboard>("/dashboard/employee");
  const openComposer = useUi((s) => s.openComposer);
  const firstName = me?.active?.profile?.displayName.split(" ")[0] ?? "";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        title={`${greeting}${firstName ? `, ${firstName}` : ""}`}
        description="What you're working on, what's next, and what changed around you."
        actions={
          <Button variant="primary" onClick={() => openComposer()}>
            <MessageSquarePlus className="h-4 w-4" /> Share an update
          </Button>
        }
      />
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading || !data ? <LoadingCards count={4} className="lg:grid-cols-2" /> : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-5">
            {/* Status strip */}
            <Card className="overflow-hidden">
              <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="p-4">
                  <p className="text-[12px] font-medium text-muted">Your last update</p>
                  <div className="mt-1.5 flex items-center gap-2"><FreshnessBadge freshness={data.freshness} />{data.currentStage && <Badge tone="brand">{label(data.currentStage)}</Badge>}</div>
                  <p className="mt-1.5 truncate text-[13px]">{data.lastUpdate?.currentFocus ?? "You haven't shared an update yet."}</p>
                </div>
                <div className="p-4">
                  <p className="flex items-center gap-1 text-[12px] font-medium text-muted"><Sparkles className="h-3 w-3" aria-hidden /> Suggested next step</p>
                  <p className="mt-1.5 line-clamp-2 text-[13px]">{data.suggestedNextStep ?? "Pick up an assignment below."}</p>
                </div>
                <div className="p-4">
                  <p className="text-[12px] font-medium text-muted">Your manager</p>
                  <div className="mt-1.5">{data.manager ? <PersonChip person={data.manager} /> : <span className="text-[13px] text-muted">No manager assigned</span>}</div>
                </div>
              </div>
              {data.drafts.length > 0 && (
                <Link href="/my-work?tab=updates" className="flex items-center justify-between border-t border-line bg-subtle/50 px-4 py-2 text-[12.5px] text-muted hover:text-ink">
                  <span>You have {data.drafts.length} private draft{data.drafts.length > 1 ? "s" : ""} — only you can see {data.drafts.length > 1 ? "them" : "it"}.</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </Card>

            <Card>
              <CardHeader icon={<CheckSquare className="h-4 w-4" />} title="Current assignments" description="Open work assigned to you" action={<ButtonLink href="/my-work" size="sm" variant="ghost">All work <ArrowRight className="h-3.5 w-3.5" /></ButtonLink>} />
              <CardBody className="px-2 pb-2">
                {data.assignments.length === 0 ? <EmptyState compact title="No open assignments" description="When work is assigned to you it shows up here." /> : (
                  <ul>
                    {data.assignments.slice(0, 7).map((a) => {
                      const due = daysUntil(a.dueDate);
                      return (
                        <li key={a.id}>
                          <Link href={`/projects/${a.project.id}?tab=work&item=${a.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-subtle/70">
                            <StatusBadge status={a.status} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium">{a.title}</span>
                              <span className="block truncate text-[12px] text-muted">{a.project.name}{a.milestone ? ` · ◆ ${a.milestone.title}` : ""}</span>
                            </span>
                            {a.dueDate && <span className={due !== null && due < 0 ? "text-[12px] font-medium text-danger" : "text-[12px] text-muted"}>{due !== null && due < 0 ? `${-due}d overdue` : `due ${day(a.dueDate)}`}</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader icon={<Compass className="h-4 w-4" />} title="My projects" description="Health is computed from milestones, blockers and dependencies" action={<ButtonLink href="/projects?mine=true" size="sm" variant="ghost">View all</ButtonLink>} />
              <CardBody className="px-2 pb-2">
                {data.projects.length === 0 ? <EmptyState compact title="You're not on a project yet" /> : data.projects.map((p) => <ProjectRow key={p.id} p={p} />)}
              </CardBody>
            </Card>

            <section aria-labelledby="team-activity">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="team-activity" className="flex items-center gap-2 text-[14px] font-semibold"><Users className="h-4 w-4 text-muted" aria-hidden /> Team activity</h2>
                <span className="text-[12px] text-muted">Updates your teammates shared with you</span>
              </div>
              {data.teamActivity.length === 0 ? <Card><EmptyState compact title="Quiet on your team" description="Shared updates from teammates will appear here." /></Card> : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{data.teamActivity.slice(0, 6).map((u) => <UpdateCard key={u.id} u={u} />)}</div>
              )}
            </section>
          </div>

          <aside className="space-y-5">
            <Card>
              <CardHeader icon={<OctagonAlert className="h-4 w-4" />} title="My blockers" action={<ButtonLink href="/blockers?scope=mine" size="xs" variant="ghost">All</ButtonLink>} />
              <CardBody className="px-2 pb-2">{data.blockers.length === 0 ? <EmptyState compact title="Nothing blocking you" /> : data.blockers.map((b) => <BlockerRow key={b.id} b={b} showReporter={false} />)}</CardBody>
            </Card>

            <Card>
              <CardHeader icon={<Flag className="h-4 w-4" />} title="Upcoming milestones" />
              <CardBody>
                {data.upcomingMilestones.length === 0 ? <p className="text-[13px] text-muted">No milestones in the next 30 days.</p> : (
                  <ol className="relative space-y-3 border-l border-line pl-4">
                    {data.upcomingMilestones.map((m) => {
                      const d = daysUntil(m.dueDate);
                      return (
                        <li key={m.id} className="relative">
                          <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${m.isCritical ? "bg-danger" : "bg-brand"}`} aria-hidden />
                          <Link href={`/milestones/${m.id}`} className="block text-[13px] font-medium hover:text-brand-deep">{m.title}</Link>
                          <p className="text-[12px] text-muted">{m.project.name} · {d !== null && d < 0 ? <span className="font-medium text-danger">{-d}d overdue</span> : day(m.dueDate)}{m.isCritical ? " · critical" : ""}</p>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader icon={<Target className="h-4 w-4" />} title="Your contribution to company goals" />
              <CardBody className="space-y-3">
                {data.goalContributions.length === 0 ? <p className="text-[13px] text-muted">Your projects aren&apos;t linked to a company goal yet.</p> : data.goalContributions.map((g) => (
                  <div key={g.id}>
                    <Link href={`/goals/${g.id}`} className="text-[13px] font-medium hover:text-brand-deep">{g.title}</Link>
                    <p className="mt-0.5 text-[12px] text-muted">via {g.projects.map((p) => p.name).join(", ")}</p>
                  </div>
                ))}
              </CardBody>
            </Card>

            {data.actionItems.length > 0 && (
              <Card>
                <CardHeader icon={<CalendarClock className="h-4 w-4" />} title="Action items for you" />
                <CardBody className="space-y-2">
                  {data.actionItems.map((a) => (
                    <Link key={a.id} href={a.meeting ? `/meetings/${a.meeting.id}` : "/my-work?tab=actions"} className="block rounded-lg border border-line px-3 py-2 hover:border-line-strong">
                      <p className="text-[13px] font-medium">{a.title}</p>
                      <p className="text-[12px] text-muted">{a.meeting?.title ?? "Follow-up"}{a.dueDate ? ` · due ${day(a.dueDate)}` : ""}</p>
                    </Link>
                  ))}
                </CardBody>
              </Card>
            )}

            {data.helpers.length > 0 && (
              <Card>
                <CardHeader title="Who can help" description="Your manager and the leads of your projects" />
                <CardBody className="space-y-2.5">{data.helpers.map((p) => p && <PersonChip key={p.id} person={p} />)}</CardBody>
              </Card>
            )}
          </aside>
        </div>
      )}
    </>
  );
}

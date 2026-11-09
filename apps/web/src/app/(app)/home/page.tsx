"use client";

import { label } from "@workmesh/core";
import { ArrowRight, BookUser, CalendarClock, CheckSquare, Compass, Flag, Map as MapIcon, MessageSquarePlus, Network, OctagonAlert, Sparkles, Target, Users } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { GettingStarted } from "@/components/midnight/getting-started";
import { ContributionMap, type CMColumn } from "@/components/midnight/contribution-map";
import { HeroMetric, MidnightHero, QuickAction } from "@/components/midnight/hero";
import { ProgressRing } from "@/components/midnight/viz";
import { Reveal } from "@/components/motion/primitives";
import { PersonChip } from "@/components/ui/avatar";
import { Badge, FreshnessBadge, StatusBadge } from "@/components/ui/badges";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards, Skeleton } from "@/components/ui/feedback";
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

/** Builds Task → Project → Initiative → Goal from the dashboard payload (already authorized). */
function useContribution(data: EmployeeDashboard | undefined) {
  return useMemo(() => {
    if (!data) return { columns: [] as CMColumn[], edges: [] as Array<[string, string]> };
    const edges: Array<[string, string]> = [];
    const tasks = data.assignments.slice(0, 5);
    const projects = new Map<string, { id: string; label: string; sub?: string; href: string }>();
    tasks.forEach((t) => {
      projects.set(`p:${t.project.id}`, { id: `p:${t.project.id}`, label: t.project.name, sub: t.project.key, href: `/projects/${t.project.id}` });
      edges.push([`t:${t.id}`, `p:${t.project.id}`]);
    });
    const initiatives = new Map<string, { id: string; label: string }>();
    data.goalContributions.forEach((g) =>
      g.projects.forEach((p) => {
        const pid = `p:${p.id}`;
        if (!projects.has(pid)) projects.set(pid, { id: pid, label: p.name, href: `/projects/${p.id}` });
        if (p.initiative) {
          const iid = `i:${p.initiative}`;
          initiatives.set(iid, { id: iid, label: p.initiative });
          edges.push([pid, iid], [iid, `g:${g.id}`]);
        } else edges.push([pid, `g:${g.id}`]);
      }),
    );
    const uniq = Array.from(new Set(edges.map((e) => e.join("→")))).map((k) => k.split("→") as [string, string]);
    const columns: CMColumn[] = [
      { key: "tasks", title: "Your work", color: "var(--color-graph-milestone)", nodes: tasks.map((t) => ({ id: `t:${t.id}`, label: t.title, sub: label(t.status), href: `/projects/${t.project.id}?tab=work&item=${t.id}` })) },
      { key: "projects", title: "Projects", color: "var(--color-graph-project)", nodes: Array.from(projects.values()).slice(0, 6) },
      { key: "initiatives", title: "Initiatives", color: "var(--color-graph-initiative)", nodes: Array.from(initiatives.values()) },
      { key: "goals", title: "Company goals", color: "var(--color-graph-goal)", nodes: data.goalContributions.map((g) => ({ id: `g:${g.id}`, label: g.title, sub: g.progress != null ? `${g.progress}% progress` : undefined, href: `/goals/${g.id}` })) },
    ];
    return { columns, edges: uniq };
  }, [data]);
}

export default function HomePage() {
  const { data: me } = useMe();
  const { data, error, isLoading, refetch } = useApi<EmployeeDashboard>("/dashboard/employee");
  const openComposer = useUi((s) => s.openComposer);
  const firstName = me?.active?.profile?.displayName.split(" ")[0] ?? "";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const contribution = useContribution(data);
  const overdue = data?.assignments.filter((a) => (daysUntil(a.dueDate) ?? 1) < 0).length ?? 0;

  return (
    <>
      <MidnightHero
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        title={`${greeting}${firstName ? `, ${firstName}` : ""}`}
        description="What you're working on, what's next, and what changed around you."
        actions={
          <>
            <Button variant="accent" onClick={() => openComposer()}>
              <MessageSquarePlus className="h-4 w-4" /> Share an update
            </Button>
            <ButtonLink href="/my-work" variant="on-navy">
              Open my work <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </>
        }
        aside={
          data && (
            <div className="w-full rounded-[16px] border border-white/[0.08] bg-white/[0.05] p-4 backdrop-blur-md lg:w-[340px]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11.5px] font-medium text-navy-muted">Your last update</p>
                <div className="flex items-center gap-1.5"><FreshnessBadge freshness={data.freshness} />{data.currentStage && <Badge tone="teal">{label(data.currentStage)}</Badge>}</div>
              </div>
              <p className="mt-2 line-clamp-2 text-[13.5px] font-medium text-white">{data.lastUpdate?.currentFocus ?? "You haven't shared an update yet."}</p>
              <div className="mt-3 border-t border-white/[0.08] pt-3">
                <p className="flex items-center gap-1 text-[11.5px] font-medium text-navy-muted"><Sparkles className="h-3 w-3 text-violet-bright" aria-hidden /> Suggested next step</p>
                <p className="mt-1 line-clamp-2 text-[13px] text-navy-text">{data.suggestedNextStep ?? "Pick up an assignment below."}</p>
              </div>
            </div>
          )
        }
      >
        {data ? (
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
            <HeroMetric label="Open assignments" value={data.assignments.length} hint={overdue ? `${overdue} overdue` : "None overdue"} href="/my-work" accent="teal" />
            <HeroMetric label="Blocking you" value={data.blockers.length} hint={data.blockers.length ? "Open blockers you raised" : "Nothing blocking you"} href="/blockers?scope=mine" accent="coral" />
            <HeroMetric label="Milestones · 30 days" value={data.upcomingMilestones.length} hint={`${data.upcomingMilestones.filter((m) => m.isCritical).length} critical`} accent="amber" />
            <HeroMetric label="Team updates" value={data.teamActivity.length} hint="Shared with you recently" accent="violet" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 bg-white/10" />)}</div>
        )}
      </MidnightHero>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickAction icon={<Target />} title="Roadmaps" description="Goals, initiatives and milestones" href="/roadmap" tone="teal" />
        <QuickAction icon={<MapIcon />} title="Company Map" description="See how everything connects" href="/map" tone="navy" />
        <QuickAction icon={<BookUser />} title="Find someone" description="Directory of people and teams" href="/directory" tone="violet" />
        <QuickAction icon={<CalendarClock />} title="Meetings" description="Briefs, decisions and follow-ups" href="/meetings" tone="amber" />
      </div>

      {error ? <div className="mt-5"><ErrorState error={error} onRetry={refetch} /></div> : isLoading || !data ? <LoadingCards count={4} className="mt-5 lg:grid-cols-2" /> : (
        <Reveal className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-5">
            <Reveal.Item><GettingStarted hasUpdate={!!data.lastUpdate} /></Reveal.Item>
            {data.drafts.length > 0 && (
              <Reveal.Item>
                <Link href="/my-work?tab=updates" className="flex items-center justify-between rounded-[12px] border border-violet/20 bg-violet-soft/60 px-4 py-2.5 text-[12.5px] text-ink-soft hover:border-violet/40">
                  <span>You have {data.drafts.length} private draft{data.drafts.length > 1 ? "s" : ""} — only you can see {data.drafts.length > 1 ? "them" : "it"}.</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Reveal.Item>
            )}

            <Reveal.Item>
              <Card>
                <CardHeader icon={<CheckSquare />} title="Current assignments" description="Open work assigned to you" action={<ButtonLink href="/my-work" size="sm" variant="ghost">All work <ArrowRight className="h-3.5 w-3.5" /></ButtonLink>} />
                <CardBody className="px-2 pb-2">
                  {data.assignments.length === 0 ? <EmptyState compact title="No open assignments" description="When work is assigned to you it shows up here." /> : (
                    <ul>
                      {data.assignments.slice(0, 7).map((a) => {
                        const due = daysUntil(a.dueDate);
                        return (
                          <li key={a.id}>
                            <Link href={`/projects/${a.project.id}?tab=work&item=${a.id}`} className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-subtle/70">
                              <StatusBadge status={a.status} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-medium">{a.title}</span>
                                <span className="block truncate text-[12px] text-muted">{a.project.name}{a.milestone ? ` · ◆ ${a.milestone.title}` : ""}</span>
                              </span>
                              {a.dueDate && <span className={due !== null && due < 0 ? "text-[12px] font-medium text-danger-ink" : "text-[12px] text-muted tabular-nums"}>{due !== null && due < 0 ? `${-due}d overdue` : `due ${day(a.dueDate)}`}</span>}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </Reveal.Item>

            <Reveal.Item>
              <Card>
                <CardHeader icon={<Network />} title="How your work connects" description="From your assignments up to the company goals they serve — hover to trace a path" action={<ButtonLink href="/map" size="sm" variant="ghost">Open map <ArrowRight className="h-3.5 w-3.5" /></ButtonLink>} />
                <CardBody>
                  <ContributionMap columns={contribution.columns} edges={contribution.edges} emptyHint="Your work isn't linked to a project or goal yet." />
                </CardBody>
              </Card>
            </Reveal.Item>

            <Reveal.Item>
              <Card>
                <CardHeader icon={<Compass />} title="My projects" description="Health is computed from milestones, blockers and dependencies" action={<ButtonLink href="/projects?mine=true" size="sm" variant="ghost">View all</ButtonLink>} />
                <CardBody className="px-2 pb-2">
                  {data.projects.length === 0 ? <EmptyState compact title="You're not on a project yet" /> : data.projects.map((p) => <ProjectRow key={p.id} p={p} />)}
                </CardBody>
              </Card>
            </Reveal.Item>

            <Reveal.Item>
              <section aria-labelledby="team-activity">
                <div className="mb-3 flex items-center justify-between">
                  <h2 id="team-activity" className="flex items-center gap-2 text-[14.5px] font-semibold"><Users className="h-4 w-4 text-muted" aria-hidden /> Team activity</h2>
                  <span className="text-[12px] text-muted">Updates your teammates shared with you</span>
                </div>
                {data.teamActivity.length === 0 ? <Card><EmptyState compact title="Quiet on your team" description="Shared updates from teammates will appear here." /></Card> : (
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{data.teamActivity.slice(0, 6).map((u) => <UpdateCard key={u.id} u={u} />)}</div>
                )}
              </section>
            </Reveal.Item>
          </div>

          <aside className="space-y-5">
            <Reveal.Item>
              <Card className={data.blockers.length ? "border-danger/20" : undefined}>
                <CardHeader icon={<OctagonAlert />} title="My blockers" action={<ButtonLink href="/blockers?scope=mine" size="xs" variant="ghost">All</ButtonLink>} />
                <CardBody className="px-2 pb-2">{data.blockers.length === 0 ? <EmptyState compact title="Nothing blocking you" /> : data.blockers.map((b) => <BlockerRow key={b.id} b={b} showReporter={false} />)}</CardBody>
              </Card>
            </Reveal.Item>

            <Reveal.Item>
              <Card>
                <CardHeader icon={<Flag />} title="Upcoming milestones" />
                <CardBody>
                  {data.upcomingMilestones.length === 0 ? <p className="text-[13px] text-muted">No milestones in the next 30 days.</p> : (
                    <ol className="relative space-y-3.5 border-l border-line pl-4">
                      {data.upcomingMilestones.map((m) => {
                        const d = daysUntil(m.dueDate);
                        return (
                          <li key={m.id} className="relative">
                            <span className={`absolute -left-[21.5px] top-1.5 h-2.5 w-2.5 rotate-45 rounded-[2px] ring-2 ring-surface ${m.isCritical ? "bg-danger" : "bg-teal"}`} aria-hidden />
                            <Link href={`/milestones/${m.id}`} className="block text-[13px] font-medium hover:text-teal-ink">{m.title}</Link>
                            <p className="text-[12px] text-muted">{m.project.name} · {d !== null && d < 0 ? <span className="font-medium text-danger-ink">{-d}d overdue</span> : day(m.dueDate)}{m.isCritical ? " · critical" : ""}</p>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </CardBody>
              </Card>
            </Reveal.Item>

            <Reveal.Item>
              <Card>
                <CardHeader icon={<Target />} title="Your contribution to company goals" />
                <CardBody className="space-y-3">
                  {data.goalContributions.length === 0 ? <p className="text-[13px] text-muted">Your projects aren&apos;t linked to a company goal yet.</p> : data.goalContributions.map((g) => (
                    <div key={g.id} className="flex items-center gap-3">
                      <ProgressRing value={g.progress} size={44} stroke={4.5} label={`${g.title} progress`} />
                      <div className="min-w-0">
                        <Link href={`/goals/${g.id}`} className="line-clamp-2 text-[13px] font-medium leading-snug hover:text-teal-ink">{g.title}</Link>
                        <p className="mt-0.5 truncate text-[12px] text-muted">via {g.projects.map((p) => p.name).join(", ")}</p>
                      </div>
                    </div>
                  ))}
                </CardBody>
              </Card>
            </Reveal.Item>

            {data.actionItems.length > 0 && (
              <Reveal.Item>
                <Card>
                  <CardHeader icon={<CalendarClock />} title="Action items for you" />
                  <CardBody className="space-y-2">
                    {data.actionItems.map((a) => (
                      <Link key={a.id} href={a.meeting ? `/meetings/${a.meeting.id}` : "/my-work?tab=actions"} className="block rounded-[10px] border border-line px-3 py-2 transition-colors hover:border-line-strong hover:bg-subtle/50">
                        <p className="text-[13px] font-medium">{a.title}</p>
                        <p className="text-[12px] text-muted">{a.meeting?.title ?? "Follow-up"}{a.dueDate ? ` · due ${day(a.dueDate)}` : ""}</p>
                      </Link>
                    ))}
                  </CardBody>
                </Card>
              </Reveal.Item>
            )}

            <Reveal.Item>
              <Card>
                <CardHeader icon={<Users />} title="Who can help" description="Your manager and the leads of your projects" />
                <CardBody className="space-y-2.5">
                  {data.manager && <div className="flex items-center justify-between gap-2"><PersonChip person={data.manager} /><span className="text-[11px] font-medium text-faint">Manager</span></div>}
                  {data.helpers.filter((p) => p && p.id !== data.manager?.id).map((p) => p && <PersonChip key={p.id} person={p} />)}
                  {!data.manager && data.helpers.length === 0 && <p className="text-[13px] text-muted">No manager assigned</p>}
                </CardBody>
              </Card>
            </Reveal.Item>
          </aside>
        </Reveal>
      )}
    </>
  );
}

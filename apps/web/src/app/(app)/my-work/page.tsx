"use client";

import { MessageSquarePlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PersonChip } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { TabPanel, Tabs } from "@/components/ui/overlay";
import { BlockerRow, ProjectRow, UpdateCard } from "@/components/work/cards";
import { api, useAction, useApi, useMe } from "@/lib/hooks";
import { useUi } from "@/lib/store";
import type { Blocker, PersonLite, ProjectSummary, Update } from "@/lib/types";
import { day, daysUntil } from "@/lib/utils";

interface Employee {
  assignments: Array<{ id: string; title: string; status: string; dueDate: string | null; project: { id: string; name: string }; milestone: { title: string } | null }>;
  projects: ProjectSummary[];
  blockers: Blocker[];
  upcomingMilestones: Array<{ id: string; title: string; dueDate: string; isCritical: boolean; project: { name: string } }>;
  actionItems: Array<{ id: string; title: string; dueDate: string | null; meeting: { id: string; title: string } | null }>;
  manager: PersonLite | null;
}

function MyWorkInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState(params.get("tab") ?? "assignments");
  const { data: me } = useMe();
  const openComposer = useUi((s) => s.openComposer);
  const { data, error, isLoading, refetch } = useApi<Employee>("/dashboard/employee");
  const { data: published } = useApi<Update[]>("/updates?authorId=me&limit=50");
  const { data: drafts } = useApi<Update[]>("/updates?drafts=true");
  const { data: person } = useApi<{ teams: Array<{ id: string; name: string }>; directReports: PersonLite[] }>(me?.active ? `/people/${me.active.membershipId}` : null);
  const done = useAction((id: string) => api.patch(`/action-items/${id}`, { status: "DONE" }), { success: "Marked done", invalidate: ["/dashboard", "/action-items"] });
  const changeTab = (t: string) => {
    setTab(t);
    router.replace(`/my-work?tab=${t}`, { scroll: false });
  };
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !data) return <LoadingCards />;
  return (
    <>
      <PageHeader title="My Work" description="Your assignments, updates, blockers and follow-ups in one place." actions={<Button variant="primary" onClick={() => openComposer()}><MessageSquarePlus className="h-4 w-4" /> Share an update</Button>} />
      <Tabs
        value={tab}
        onValueChange={changeTab}
        tabs={[
          { value: "assignments", label: "Assignments", count: data.assignments.length },
          { value: "projects", label: "Projects", count: data.projects.length },
          { value: "updates", label: "My updates", count: (published?.length ?? 0) + (drafts?.length ?? 0) },
          { value: "blockers", label: "Blockers", count: data.blockers.length },
          { value: "milestones", label: "Milestones", count: data.upcomingMilestones.length },
          { value: "actions", label: "Action items", count: data.actionItems.length },
          { value: "team", label: "My team" },
        ]}
      >
        <TabPanel value="assignments">
          <Card className="p-2">
            {data.assignments.length === 0 ? <EmptyState title="No open assignments" /> : data.assignments.map((a) => {
              const d = daysUntil(a.dueDate);
              return (
                <Link key={a.id} href={`/projects/${a.project.id}?tab=work&item=${a.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-subtle/70">
                  <StatusBadge status={a.status} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{a.title}</span><span className="block truncate text-[12px] text-muted">{a.project.name}{a.milestone ? ` · ◆ ${a.milestone.title}` : ""}</span></span>
                  <span className={d !== null && d < 0 ? "text-[12px] font-medium text-danger" : "text-[12px] text-muted"}>{a.dueDate ? (d !== null && d < 0 ? `${-d}d overdue` : day(a.dueDate)) : ""}</span>
                </Link>
              );
            })}
          </Card>
        </TabPanel>
        <TabPanel value="projects"><Card className="p-2">{data.projects.map((p) => <ProjectRow key={p.id} p={p} />)}</Card></TabPanel>
        <TabPanel value="updates">
          {(drafts?.length ?? 0) > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-[13px] font-semibold">Private drafts <span className="font-normal text-muted">— only you can see these</span></h2>
              <div className="grid gap-3 lg:grid-cols-2">{drafts!.map((u) => <UpdateCard key={u.id} u={u} />)}</div>
            </section>
          )}
          <h2 className="mb-2 text-[13px] font-semibold">Published</h2>
          {published?.length ? <div className="grid gap-3 lg:grid-cols-2">{published.map((u) => <UpdateCard key={u.id} u={u} />)}</div> : <Card><EmptyState title="You haven't published an update yet" action={<Button variant="primary" onClick={() => openComposer()}>Share your first update</Button>} /></Card>}
        </TabPanel>
        <TabPanel value="blockers"><Card className="p-2">{data.blockers.length ? data.blockers.map((b) => <BlockerRow key={b.id} b={b} />) : <EmptyState title="Nothing blocking you" />}</Card></TabPanel>
        <TabPanel value="milestones">
          <Card className="p-2">{data.upcomingMilestones.length ? data.upcomingMilestones.map((m) => (
            <Link key={m.id} href={`/milestones/${m.id}`} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-subtle/70"><span><span className="block text-[13.5px] font-medium">{m.title}{m.isCritical && <span className="text-danger"> · critical</span>}</span><span className="text-[12px] text-muted">{m.project.name}</span></span><span className="text-[12px] text-muted">{day(m.dueDate)}</span></Link>
          )) : <EmptyState title="No upcoming milestones" />}</Card>
        </TabPanel>
        <TabPanel value="actions">
          <Card className="p-2">{data.actionItems.length ? data.actionItems.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-subtle/70">
              <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-medium">{a.title}</span><span className="text-[12px] text-muted">{a.meeting ? <Link href={`/meetings/${a.meeting.id}`} className="hover:text-brand-deep">{a.meeting.title}</Link> : "Follow-up"}{a.dueDate ? ` · due ${day(a.dueDate)}` : ""}</span></span>
              <Button size="sm" loading={done.isPending && done.variables === a.id} onClick={() => done.mutate(a.id)}>Mark done</Button>
            </div>
          )) : <EmptyState title="No open action items" />}</Card>
        </TabPanel>
        <TabPanel value="team">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card><CardHeader title="Your manager" /><CardBody>{data.manager ? <PersonChip person={data.manager} /> : <p className="text-muted">No manager assigned.</p>}</CardBody></Card>
            <Card><CardHeader title="Your teams" /><CardBody className="space-y-1">{person?.teams.map((t) => <Link key={t.id} href={`/teams/${t.id}`} className="block text-[13.5px] font-medium hover:text-brand-deep">{t.name}</Link>)}</CardBody></Card>
            {(person?.directReports.length ?? 0) > 0 && <Card><CardHeader title="Your direct reports" /><CardBody className="space-y-2">{person!.directReports.map((p) => <PersonChip key={p.id} person={p} />)}</CardBody></Card>}
          </div>
        </TabPanel>
      </Tabs>
    </>
  );
}

export default function MyWorkPage() {
  return <Suspense><MyWorkInner /></Suspense>;
}

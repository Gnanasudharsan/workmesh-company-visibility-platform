"use client";

import { Eye, MessageSquarePlus, OctagonAlert } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { DependenciesTab, MembersTab } from "@/components/project/members";
import { ProjectOverview } from "@/components/project/overview";
import { MilestonesTab, WorkTab } from "@/components/project/work";
import { PersonChip } from "@/components/ui/avatar";
import { AccessBadge, HealthBadge, StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, healthTone, LoadingCards, ProgressBar } from "@/components/ui/feedback";
import { TabPanel, Tabs } from "@/components/ui/overlay";
import { BlockerRow, UpdateCard } from "@/components/work/cards";
import { CreateDialogs } from "@/components/work/create-dialogs";
import { useApi } from "@/lib/hooks";
import { useUi } from "@/lib/store";
import type { Blocker, ProjectDetail, Update } from "@/lib/types";
import { day, relative } from "@/lib/utils";

function ProjectInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState(params.get("tab") ?? "overview");
  const [reporting, setReporting] = useState(false);
  const openComposer = useUi((s) => s.openComposer);
  const pushRecent = useUi((s) => s.pushRecent);
  const { data: p, error, isLoading, refetch } = useApi<ProjectDetail>(`/projects/${id}`);
  const details = p?.access === "details";
  const { data: updates } = useApi<Update[]>(details ? `/updates?projectId=${id}` : null);
  const { data: blockers } = useApi<Blocker[]>(details ? `/blockers?projectId=${id}` : null);
  const { data: activity } = useApi<Array<{ id: string; entityType: string; field: string; fromValue: string | null; toValue: string | null; createdAt: string; actor: { name: string } | null }>>(details && tab === "activity" ? `/projects/${id}/activity` : null);

  useEffect(() => {
    if (p) pushRecent({ href: `/projects/${p.id}`, label: p.name, kind: "Project" });
  }, [p, pushRecent]);

  const changeTab = (t: string) => {
    setTab(t);
    router.replace(`/projects/${id}?tab=${t}`, { scroll: false });
  };

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !p) return <LoadingCards count={3} />;

  if (!details) {
    return (
      <>
        <PageHeader eyebrow={p.key} title={p.name} description={p.summary ?? undefined} actions={<AccessBadge access="summary" />} />
        <Card>
          <CardBody className="space-y-4 pt-5">
            <div className="flex flex-wrap items-center gap-2"><HealthBadge health={p.health} reasons={p.healthReasons} /><StatusBadge status={p.status} /></div>
            <div className="grid gap-4 text-[13px] sm:grid-cols-4">
              <div><p className="text-muted">Lead</p><PersonChip person={p.lead} /></div>
              <div><p className="text-muted">Team</p><p className="font-medium">{p.owningTeam?.name ?? "—"}</p></div>
              <div><p className="text-muted">Target</p><p className="font-medium">{day(p.targetDate, true)}</p></div>
              <div><p className="text-muted">Progress</p><ProgressBar value={p.computedProgress} tone={healthTone(p.health)} /></div>
            </div>
            <EmptyState icon={<Eye className="h-5 w-5" aria-hidden />} title="You're seeing this project's public summary" description="Details, work items, updates and blockers are limited to its members. Contact the lead if you need access." />
          </CardBody>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={<span className="font-mono normal-case tracking-normal">{p.key}{p.myRole ? ` · you're ${p.myRole === "LEAD" ? "the lead" : `a ${p.myRole.toLowerCase()}`}` : ""}</span>}
        title={p.name}
        description={p.summary ?? undefined}
        actions={
          <>
            <Button onClick={() => setReporting(true)}><OctagonAlert className="h-4 w-4" /> Report blocker</Button>
            <Button variant="primary" onClick={() => openComposer({ projectId: p.id })}><MessageSquarePlus className="h-4 w-4" /> Share update</Button>
          </>
        }
      />
      <Tabs
        value={tab}
        onValueChange={changeTab}
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "milestones", label: "Milestones", count: p.milestoneList.length },
          { value: "work", label: "Work", count: p.workItems?.total },
          { value: "updates", label: "Updates", count: updates?.length },
          { value: "blockers", label: "Blockers", count: blockers?.filter((b) => b.state !== "RESOLVED").length },
          { value: "dependencies", label: "Dependencies" },
          { value: "members", label: "Members & access", count: p.members.length },
          { value: "activity", label: "History" },
        ]}
      >
        <TabPanel value="overview"><ProjectOverview p={p} /></TabPanel>
        <TabPanel value="milestones"><MilestonesTab p={p} /></TabPanel>
        <TabPanel value="work"><WorkTab p={p} openItemId={params.get("item")} onOpenItem={(item) => router.replace(`/projects/${id}?tab=work${item ? `&item=${item}` : ""}`, { scroll: false })} /></TabPanel>
        <TabPanel value="updates">
          {updates?.length ? <div className="grid gap-3 lg:grid-cols-2">{updates.map((u) => <UpdateCard key={u.id} u={u} showProject={false} />)}</div> : <Card><EmptyState title="No updates yet" action={<Button variant="primary" onClick={() => openComposer({ projectId: p.id })}>Share the first update</Button>} /></Card>}
        </TabPanel>
        <TabPanel value="blockers">
          <Card className="p-2">{blockers?.length ? blockers.map((b) => <BlockerRow key={b.id} b={b} />) : <EmptyState title="No blockers" description="Nothing is in the way right now." />}</Card>
        </TabPanel>
        <TabPanel value="dependencies"><DependenciesTab p={p} /></TabPanel>
        <TabPanel value="members"><MembersTab p={p} /></TabPanel>
        <TabPanel value="activity">
          <Card>
            <CardBody className="pt-4">
              <ol className="space-y-2 border-l border-line pl-4">
                {(activity ?? []).map((a) => (
                  <li key={a.id} className="text-[13px]">
                    <span className="font-medium">{a.actor?.name ?? "System"}</span> changed <span className="font-medium">{a.entityType.toLowerCase().replace("_", " ")} {a.field}</span> from {a.fromValue ?? "—"} to {a.toValue ?? "—"} <span className="text-muted">· {relative(a.createdAt)}</span>
                  </li>
                ))}
                {activity && activity.length === 0 && <li className="text-[13px] text-muted">No recorded changes yet.</li>}
              </ol>
            </CardBody>
          </Card>
        </TabPanel>
      </Tabs>
      <CreateDialogs kind={reporting ? "blocker" : null} onClose={() => setReporting(false)} defaults={{ projectId: p.id }} />
    </>
  );
}

export default function ProjectPage() {
  return <Suspense><ProjectInner /></Suspense>;
}

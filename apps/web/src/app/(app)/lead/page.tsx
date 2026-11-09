"use client";

import { label } from "@workmesh/core";
import { Diamond, OctagonAlert, Users } from "lucide-react";
import Link from "next/link";
import { PersonChip } from "@/components/ui/avatar";
import { Badge, FreshnessBadge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { BlockerRow, ProjectRow } from "@/components/work/cards";
import { useApi } from "@/lib/hooks";
import type { Blocker, PersonLite, ProjectSummary } from "@/lib/types";
import { day, daysUntil, relative } from "@/lib/utils";

interface LeadDashboard {
  projects: ProjectSummary[];
  contributors: Array<{ person: PersonLite | null; reportsToMe: boolean; projects: string[]; latestUpdate: { id: string; stage: string; currentFocus: string; publishedAt: string; helpNeeded: string | null } | null; freshness: string }>;
  blockers: Blocker[];
  milestones: Array<{ id: string; title: string; dueDate: string | null; isCritical: boolean; status: string; project: { id: string; name: string } }>;
}

export default function LeadPage() {
  const { data, error, isLoading, refetch } = useApi<LeadDashboard>("/dashboard/lead");
  return (
    <>
      <PageHeader title="Projects I lead" description="Contributor progress across the projects you lead — including people who don't report to you." />
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading || !data ? <LoadingCards /> : (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <Card>
              <CardHeader title="Your projects" />
              <CardBody className="px-2 pb-2">{data.projects.length ? data.projects.map((p) => <ProjectRow key={p.id} p={p} />) : <EmptyState compact title="You don't lead a project yet" />}</CardBody>
            </Card>
            <Card>
              <CardHeader icon={<Users className="h-4 w-4" />} title="Contributors" description="Latest update each contributor shared on your projects" />
              <CardBody className="divide-y divide-line">
                {data.contributors.map((c) => (
                  <div key={c.person?.id} className="flex flex-wrap items-start gap-3 py-3">
                    <div className="w-56 shrink-0"><PersonChip person={c.person} /><p className="mt-1 pl-9 text-[11.5px] text-muted">{c.projects.join(", ")}{c.reportsToMe ? "" : " · doesn't report to you"}</p></div>
                    <div className="min-w-0 flex-1 text-[13px]">
                      <div className="mb-1 flex gap-1.5"><FreshnessBadge freshness={c.freshness} />{c.latestUpdate && <Badge tone="brand">{label(c.latestUpdate.stage)}</Badge>}</div>
                      {c.latestUpdate ? <Link href={`/updates/${c.latestUpdate.id}`} className="hover:text-brand-deep">{c.latestUpdate.currentFocus} <span className="text-[11.5px] text-faint">· {relative(c.latestUpdate.publishedAt)}</span></Link> : <span className="text-muted">No update on your projects yet.</span>}
                      {c.latestUpdate?.helpNeeded && <p className="mt-1 text-[12px] text-amber-800">Needs help: {c.latestUpdate.helpNeeded}</p>}
                    </div>
                  </div>
                ))}
                {data.contributors.length === 0 && <EmptyState compact title="No contributors yet" />}
              </CardBody>
            </Card>
          </div>
          <aside className="space-y-5">
            <Card>
              <CardHeader icon={<OctagonAlert className="h-4 w-4" />} title="Open blockers on your projects" />
              <CardBody className="px-2 pb-2">{data.blockers.length ? data.blockers.map((b) => <BlockerRow key={b.id} b={b} />) : <EmptyState compact title="No open blockers" />}</CardBody>
            </Card>
            <Card>
              <CardHeader icon={<Diamond className="h-4 w-4" />} title="Open milestones" />
              <CardBody className="space-y-1.5">
                {data.milestones.map((m) => {
                  const d = daysUntil(m.dueDate);
                  return (
                    <Link key={m.id} href={`/milestones/${m.id}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-subtle/70">
                      <span className="min-w-0"><span className="block truncate font-medium">{m.title}{m.isCritical && <span className="text-danger"> · critical</span>}</span><span className="block text-[12px] text-muted">{m.project.name}</span></span>
                      <span className={d !== null && d < 0 ? "shrink-0 text-[12px] font-medium text-danger" : "shrink-0 text-[12px] text-muted"}>{d !== null && d < 0 ? `${-d}d overdue` : day(m.dueDate)}</span>
                    </Link>
                  );
                })}
              </CardBody>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}

"use client";

import { allowedTransitions, label } from "@workmesh/core";
import { Diamond } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PersonChip } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { api, useAction, useApi } from "@/lib/hooks";
import type { PersonLite, WorkItem } from "@/lib/types";
import { day, daysUntil, relative } from "@/lib/utils";

interface MilestoneDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  isCritical: boolean;
  dueDate: string | null;
  completedAt: string | null;
  version: number;
  owner: PersonLite | null;
  project: { id: string; name: string; key: string };
  workItems: WorkItem[];
  history: Array<{ id: string; field: string; fromValue: string | null; toValue: string | null; createdAt: string }>;
}

export default function MilestonePage() {
  const { id } = useParams<{ id: string }>();
  const { data: m, error, isLoading, refetch } = useApi<MilestoneDetail>(`/milestones/${id}`);
  const { data: project } = useApi<{ canEdit: boolean }>(m ? `/projects/${m.project.id}` : null);
  const move = useAction((status: string) => api.patch(`/milestones/${id}`, { status, version: m!.version }), { success: "Milestone updated", invalidate: ["/milestones", "/projects", "/roadmap", "/dashboard"] });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !m) return <LoadingCards />;
  const d = daysUntil(m.dueDate);
  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Diamond className="h-3.5 w-3.5" aria-hidden /> Milestone · <Link href={`/projects/${m.project.id}?tab=milestones`} className="normal-case tracking-normal text-brand">{m.project.name}</Link></span>}
        title={m.title}
        description={m.description ?? undefined}
        actions={<><StatusBadge status={m.status} />{m.isCritical && <Badge tone="danger">Critical</Badge>}</>}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader title="Work in this milestone" description={`${m.workItems.filter((w) => w.status === "DONE").length} of ${m.workItems.length} done`} />
          <CardBody className="px-2 pb-2">
            {m.workItems.length === 0 ? <EmptyState compact title="No work items linked" /> : m.workItems.map((w) => (
              <Link key={w.id} href={`/projects/${m.project.id}?tab=work&item=${w.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-subtle/70">
                <StatusBadge status={w.status} /><span className="flex-1 truncate text-[13px] font-medium">{w.title}</span><PersonChip person={w.assignee} sub={null} size="xs" link={false} />
              </Link>
            ))}
          </CardBody>
        </Card>
        <aside className="space-y-4">
          <Card>
            <CardBody className="space-y-3 pt-4 text-[13px]">
              <div><p className="text-[12px] text-muted">Due</p><p className="font-medium">{day(m.dueDate, true)}{m.status !== "DONE" && d !== null && d < 0 ? <span className="text-danger"> · {-d} days overdue</span> : null}</p></div>
              {m.completedAt && <div><p className="text-[12px] text-muted">Completed</p><p className="font-medium">{day(m.completedAt, true)}</p></div>}
              <div><p className="mb-1 text-[12px] text-muted">Owner</p><PersonChip person={m.owner} /></div>
              {project?.canEdit && <div className="flex flex-wrap gap-2 pt-1">{allowedTransitions("milestone", m.status).map((s) => <Button key={s} size="sm" variant="soft" loading={move.isPending} onClick={() => move.mutate(s)}>→ {label(s)}</Button>)}</div>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="History" />
            <CardBody>
              <ol className="space-y-1.5 border-l border-line pl-3 text-[12.5px]">
                {m.history.map((h) => <li key={h.id}><span className="font-medium">{label(h.field)}</span>: {h.fromValue ? label(h.fromValue) : "—"} → {h.toValue ? label(h.toValue) : "—"} <span className="text-faint">· {relative(h.createdAt)}</span></li>)}
                {m.history.length === 0 && <li className="text-muted">No changes recorded.</li>}
              </ol>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}

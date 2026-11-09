"use client";

import { allowedTransitions, label } from "@workmesh/core";
import { Plus, Target } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PersonChip } from "@/components/ui/avatar";
import { StatusBadge, VisibilityBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader, Stat } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards, ProgressBar } from "@/components/ui/feedback";
import { ProjectRow } from "@/components/work/cards";
import { CreateDialogs } from "@/components/work/create-dialogs";
import { api, useAction, useApi } from "@/lib/hooks";
import type { PersonLite, ProjectSummary } from "@/lib/types";
import { day } from "@/lib/utils";

interface Goal {
  id: string;
  title: string;
  description: string | null;
  status: string;
  period: string | null;
  visibility: string;
  targetDate: string | null;
  owner: PersonLite | null;
  canEdit: boolean;
  progress: number | null;
  projectCount: number;
  atRisk: number;
  blocked: number;
  initiatives: Array<{ id: string; title: string; progress: number | null; projectCount: number; owner: PersonLite | null; projects: ProjectSummary[] }>;
}

export default function GoalPage() {
  const { id } = useParams<{ id: string }>();
  const { data: g, error, isLoading, refetch } = useApi<Goal>(`/goals/${id}`);
  const [creating, setCreating] = useState(false);
  const move = useAction((status: string) => api.patch(`/goals/${id}`, { status }), { success: "Goal updated", invalidate: ["/goals", "/dashboard", "/graph"] });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !g) return <LoadingCards />;
  return (
    <>
      <PageHeader eyebrow={<span className="flex items-center gap-1.5"><Target className="h-3.5 w-3.5 text-violet" aria-hidden /> Company goal · {g.period ?? "No period"}</span>} title={g.title} description={g.description ?? undefined} actions={<><StatusBadge status={g.status} /><VisibilityBadge visibility={g.visibility} /></>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Visible projects" value={g.projectCount} />
        <Stat label="Need attention" value={g.atRisk} tone={g.atRisk ? "warning" : "default"} />
        <Stat label="Blocked" value={g.blocked} tone={g.blocked ? "danger" : "default"} />
        <Stat label="Target" value={<span className="text-[18px]">{day(g.targetDate, true)}</span>} />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {g.initiatives.length === 0 && <Card><EmptyState title="No initiatives yet" /></Card>}
          {g.initiatives.map((i) => (
            <Card key={i.id}>
              <CardHeader title={<Link href={`/initiatives/${i.id}`} className="hover:text-brand-deep">{i.title}</Link>} description={`${i.projectCount} visible projects${i.owner ? ` · owner ${i.owner.name}` : ""}`} action={<div className="w-36"><ProgressBar value={i.progress} /></div>} />
              <CardBody className="px-2 pb-2">{i.projects.length ? i.projects.map((p) => <ProjectRow key={p.id} p={p} />) : <p className="px-3 pb-2 text-[13px] text-muted">No projects you can see.</p>}</CardBody>
            </Card>
          ))}
        </div>
        <aside className="space-y-4">
          <Card>
            <CardBody className="space-y-3 pt-4 text-[13px]">
              <div><p className="mb-1 text-[12px] text-muted">Owner</p><PersonChip person={g.owner} /></div>
              <div><p className="mb-1 text-[12px] text-muted">Average computed progress (projects you can see)</p><ProgressBar value={g.progress} /></div>
            </CardBody>
          </Card>
          {g.canEdit && (
            <Card>
              <CardHeader title="Manage goal" />
              <CardBody className="flex flex-wrap gap-2">
                {allowedTransitions("goal", g.status).map((s) => <Button key={s} size="sm" variant="soft" onClick={() => move.mutate(s)}>→ {label(s)}</Button>)}
                <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" /> Initiative</Button>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
      <CreateDialogs kind={creating ? "initiative" : null} defaults={{ goalId: g.id }} onClose={() => setCreating(false)} />
    </>
  );
}

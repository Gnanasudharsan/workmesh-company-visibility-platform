"use client";

import { Flag, FolderPlus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PersonChip } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards, ProgressBar } from "@/components/ui/feedback";
import { ProjectRow } from "@/components/work/cards";
import { CreateDialogs } from "@/components/work/create-dialogs";
import { useApi } from "@/lib/hooks";
import type { PersonLite, ProjectSummary } from "@/lib/types";

interface Initiative {
  id: string;
  title: string;
  description: string | null;
  status: string;
  owner: PersonLite | null;
  progress: number | null;
  projects: ProjectSummary[];
  goal: { id: string; title: string } | null;
}

export default function InitiativePage() {
  const { id } = useParams<{ id: string }>();
  const { data: i, error, isLoading, refetch } = useApi<Initiative>(`/initiatives/${id}`);
  const [creating, setCreating] = useState(false);
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !i) return <LoadingCards />;
  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><Flag className="h-3.5 w-3.5 text-brand" aria-hidden /> Initiative{i.goal ? <> · supports <Link href={`/goals/${i.goal.id}`} className="normal-case tracking-normal text-brand">{i.goal.title}</Link></> : null}</span>}
        title={i.title}
        description={i.description ?? undefined}
        actions={<><StatusBadge status={i.status} /><Button variant="primary" onClick={() => setCreating(true)}><FolderPlus className="h-4 w-4" /> New project</Button></>}
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="p-2">{i.projects.length ? i.projects.map((p) => <ProjectRow key={p.id} p={p} />) : <EmptyState title="No projects you can see yet" />}</Card>
        <Card><CardBody className="space-y-3 pt-4 text-[13px]"><div><p className="mb-1 text-[12px] text-muted">Owner</p><PersonChip person={i.owner} /></div><div><p className="mb-1 text-[12px] text-muted">Average computed progress</p><ProgressBar value={i.progress} /></div></CardBody></Card>
      </div>
      <CreateDialogs kind={creating ? "project" : null} defaults={{ initiativeId: i.id }} onClose={() => setCreating(false)} />
    </>
  );
}

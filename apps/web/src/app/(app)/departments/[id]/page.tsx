"use client";

import { Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PersonChip } from "@/components/ui/avatar";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { ProjectRow } from "@/components/work/cards";
import { useApi } from "@/lib/hooks";
import type { PersonLite, ProjectSummary } from "@/lib/types";

interface DepartmentProfile {
  id: string;
  name: string;
  description: string | null;
  color: string;
  head: PersonLite | null;
  memberCount: number;
  teams: Array<{ id: string; name: string; mission: string | null; responsibilities: string[]; lead: PersonLite | null; memberCount: number }>;
  projects: ProjectSummary[];
}

export default function DepartmentPage() {
  const { id } = useParams<{ id: string }>();
  const { data: d, error, isLoading, refetch } = useApi<DepartmentProfile>(`/departments/${id}`);
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !d) return <LoadingCards />;
  return (
    <>
      <PageHeader eyebrow={<span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: d.color }} aria-hidden />Department · {d.memberCount} people</span>} title={d.name} description={d.description ?? undefined} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            {d.teams.map((t) => (
              <Link key={t.id} href={`/teams/${t.id}`} className="rounded-xl border border-line bg-surface p-4 shadow-card hover:shadow-raised">
                <p className="flex items-center gap-2 text-[14px] font-semibold"><Users className="h-4 w-4 text-muted" aria-hidden />{t.name}<span className="ml-auto text-[12px] font-normal text-muted">{t.memberCount} people</span></p>
                <p className="mt-1.5 line-clamp-2 text-[13px] text-slate-600">{t.mission}</p>
                <p className="mt-2 text-[12px] text-muted">{t.responsibilities.slice(0, 3).join(" · ")}</p>
              </Link>
            ))}
          </div>
          <Card>
            <CardHeader title="Work in this department" description="Only projects you are allowed to see are listed." />
            <CardBody className="px-2 pb-2">{d.projects.length ? d.projects.map((p) => <ProjectRow key={p.id} p={p} />) : <EmptyState compact title="No visible projects" />}</CardBody>
          </Card>
        </div>
        <Card className="self-start"><CardBody className="pt-4"><p className="mb-1 text-[12px] text-muted">Department head</p><PersonChip person={d.head} /></CardBody></Card>
      </div>
    </>
  );
}

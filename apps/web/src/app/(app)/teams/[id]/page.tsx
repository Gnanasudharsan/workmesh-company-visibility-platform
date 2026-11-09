"use client";

import { BookOpen, MessageSquare, Target, Users } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PersonChip } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badges";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { ProjectRow } from "@/components/work/cards";
import { useApi } from "@/lib/hooks";
import type { PersonLite, ProjectSummary } from "@/lib/types";

interface TeamProfile {
  id: string;
  name: string;
  mission: string | null;
  responsibilities: string[];
  contact: string | null;
  docsUrl: string | null;
  department: { id: string; name: string; color: string } | null;
  lead: (PersonLite & { role: string }) | null;
  members: Array<PersonLite & { role: string }>;
  projects: ProjectSummary[];
  goals: Array<{ id: string; title: string; status: string }>;
  canManage: boolean;
  isMember: boolean;
}

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const { data: t, error, isLoading, refetch } = useApi<TeamProfile>(`/teams/${id}`);
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !t) return <LoadingCards />;
  return (
    <>
      <PageHeader
        eyebrow={t.department ? <Link href={`/departments/${t.department.id}`} className="flex items-center gap-1.5 normal-case tracking-normal"><span className="h-2 w-2 rounded-full" style={{ background: t.department.color }} aria-hidden />{t.department.name}</Link> : "Team"}
        title={t.name}
        description={t.mission ?? undefined}
        actions={<>{t.isMember && <Badge tone="brand">Your team</Badge>}{t.canManage && <ButtonLink href="/admin/structure" size="sm">Manage team</ButtonLink>}</>}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Areas of responsibility" description="What to come to this team for" />
            <CardBody className="flex flex-wrap gap-2">{t.responsibilities.length ? t.responsibilities.map((r) => <Badge key={r} tone="brand">{r}</Badge>) : <p className="text-[13px] text-muted">Not documented yet.</p>}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Current projects" description="Projects owned by this team that you can see. Members-only work appears as a summary or not at all." />
            <CardBody className="px-2 pb-2">{t.projects.length ? t.projects.map((p) => <ProjectRow key={p.id} p={p} />) : <EmptyState compact title="No projects visible to you" />}</CardBody>
          </Card>
          {t.goals.length > 0 && (
            <Card>
              <CardHeader icon={<Target className="h-4 w-4" />} title="Company goals this team supports" />
              <CardBody className="space-y-1.5">{t.goals.map((g) => <Link key={g.id} href={`/goals/${g.id}`} className="flex items-center justify-between text-[13.5px] hover:text-brand-deep"><span className="font-medium">{g.title}</span><StatusBadge status={g.status} /></Link>)}</CardBody>
            </Card>
          )}
        </div>
        <aside className="space-y-5">
          <Card>
            <CardHeader title="Point of contact" />
            <CardBody className="space-y-3 text-[13px]">
              {t.lead ? <div><p className="mb-1 text-[12px] text-muted">Team lead</p><PersonChip person={t.lead} /></div> : <p className="text-muted">No team lead</p>}
              {t.contact && <p className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5 text-muted" aria-hidden />{t.contact}</p>}
              {t.docsUrl && <a href={t.docsUrl} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1.5 text-brand"><BookOpen className="h-3.5 w-3.5" aria-hidden />Team documentation</a>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader icon={<Users className="h-4 w-4" />} title={`Members (${t.members.length})`} />
            <CardBody className="space-y-2.5">{t.members.map((m) => <PersonChip key={m.id} person={m} sub={m.role === "LEAD" ? `${m.title} · lead` : undefined} />)}</CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}

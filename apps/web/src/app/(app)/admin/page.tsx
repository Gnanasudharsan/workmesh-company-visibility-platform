"use client";

import Link from "next/link";
import { PersonChip } from "@/components/ui/avatar";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card";
import { ErrorState, LoadingCards } from "@/components/ui/feedback";
import { useApi } from "@/lib/hooks";
import type { PersonLite } from "@/lib/types";
import { relative } from "@/lib/utils";

interface AdminOverview {
  members: number;
  deactivated: number;
  pendingInvitations: number;
  teams: number;
  teamsWithoutLead: Array<{ id: string; name: string }>;
  peopleWithoutManager: PersonLite[];
  peopleWithoutTeam: PersonLite[];
  roles: Record<string, number>;
  recentAudit: Array<{ id: string; action: string; resourceType: string; createdAt: string; actor: PersonLite | null }>;
}

export default function AdminOverviewPage() {
  const { data, error, isLoading, refetch } = useApi<AdminOverview>("/dashboard/admin");
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !data) return <LoadingCards />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active members" value={data.members} href="/admin/members" hint={`${data.roles.OWNER} owners · ${data.roles.ADMIN} admins · ${data.roles.EXECUTIVE} executives`} />
        <Stat label="Pending invitations" value={data.pendingInvitations} href="/admin/invitations" />
        <Stat label="Teams" value={data.teams} href="/admin/structure" hint={`${data.teamsWithoutLead.length} without a lead`} />
        <Stat label="Deactivated" value={data.deactivated} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="People without a manager" description="Owners excluded" />
          <CardBody className="space-y-2">{data.peopleWithoutManager.length ? data.peopleWithoutManager.map((p) => <PersonChip key={p.id} person={p} />) : <p className="text-[13px] text-muted">Everyone has a manager.</p>}<Link href="/admin/reporting" className="block pt-1 text-[12.5px] font-medium text-brand">Edit reporting lines</Link></CardBody>
        </Card>
        <Card>
          <CardHeader title="People without a team" />
          <CardBody className="space-y-2">{data.peopleWithoutTeam.length ? data.peopleWithoutTeam.map((p) => <PersonChip key={p.id} person={p} />) : <p className="text-[13px] text-muted">Everyone is on a team.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Recent administrative activity" action={<Link href="/admin/audit" className="text-[12.5px] font-medium text-brand">Audit log</Link>} />
          <CardBody className="space-y-2">{data.recentAudit.map((a) => <p key={a.id} className="text-[12.5px]"><span className="font-medium">{a.actor?.name ?? "System"}</span> · {a.action} <span className="text-muted">· {relative(a.createdAt)}</span></p>)}</CardBody>
        </Card>
      </div>
    </div>
  );
}

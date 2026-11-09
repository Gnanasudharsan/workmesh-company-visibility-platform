"use client";

import { label, ORG_ROLES } from "@workmesh/core";
import { useState } from "react";
import { PersonChip } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Input, Select } from "@/components/ui/form";
import { api, useAction, useApi, useMe } from "@/lib/hooks";
import { day } from "@/lib/utils";

interface Member { id: string; name: string; title: string; email: string; avatarHue: number; role: string; active: boolean; teams: Array<{ name: string }>; joinedAt: string; onboardedAt: string | null }

export default function MembersPage() {
  const { data: me } = useMe();
  const { data, error, isLoading, refetch } = useApi<Member[]>("/admin/members");
  const [q, setQ] = useState("");
  const update = useAction(({ id, body }: { id: string; body: Record<string, string> }) => api.patch(`/admin/members/${id}`, body), { success: "Member updated", invalidate: ["/admin", "/people", "/dashboard", "/auth/me"] });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !data) return <LoadingCards />;
  const list = data.filter((m) => !q || `${m.name} ${m.email} ${m.title}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter members" className="mb-3 max-w-sm" aria-label="Filter members" />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-faint"><th className="px-4 py-2.5">Person</th><th className="px-4 py-2.5">Email</th><th className="px-4 py-2.5">Teams</th><th className="px-4 py-2.5">Joined</th><th className="px-4 py-2.5">Role</th><th className="px-4 py-2.5 text-right">Status</th></tr></thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5"><PersonChip person={m} /></td>
                <td className="px-4 py-2.5 text-muted">{m.email}</td>
                <td className="px-4 py-2.5 text-muted">{m.teams.map((t) => t.name).join(", ") || "—"}</td>
                <td className="px-4 py-2.5 text-muted">{day(m.joinedAt, true)}{!m.onboardedAt && <Badge className="ml-1.5" tone="info">Onboarding</Badge>}</td>
                <td className="px-4 py-2.5">
                  <Select aria-label={`Role for ${m.name}`} className="h-8 w-auto text-[12.5px]" value={m.role} disabled={!m.active || m.id === me?.active?.membershipId} onChange={(e) => update.mutate({ id: m.id, body: { role: e.target.value } })}>
                    {ORG_ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}
                  </Select>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {m.id === me?.active?.membershipId ? <Badge>You</Badge> : m.active ? (
                    <Button size="xs" variant="ghost" className="text-danger" onClick={() => confirm(`Deactivate ${m.name}? They lose access immediately; their history is kept.`) && update.mutate({ id: m.id, body: { status: "DEACTIVATED" } })}>Deactivate</Button>
                  ) : <Button size="xs" onClick={() => update.mutate({ id: m.id, body: { status: "ACTIVE" } })}>Reactivate</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-3 text-[12px] text-muted">Only owners can grant or remove the owner role. Deactivation ends team memberships, reporting lines and project access immediately while preserving history.</p>
    </>
  );
}

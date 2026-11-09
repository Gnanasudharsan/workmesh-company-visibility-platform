"use client";

import { label, ORG_ROLES } from "@workmesh/core";
import { Copy, Mail } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { nn, PersonSelect, TeamSelect } from "@/components/work/pickers";
import { api, useAction, useApi } from "@/lib/hooks";
import { toast } from "@/lib/toast";
import { day, relative } from "@/lib/utils";

interface Invite { id: string; email: string; role: string; title: string | null; status: string; expiresAt: string; sendCount: number; lastSentAt: string; createdAt: string }

export default function InvitationsPage() {
  const { data, error, isLoading, refetch } = useApi<Invite[]>("/admin/invitations");
  const [v, setV] = useState({ email: "", role: "MEMBER", title: "", teamId: "", managerId: "" });
  const [lastLink, setLastLink] = useState<string | null>(null);
  const inv = ["/admin"];
  const create = useAction(() => api.post<{ devLink?: string }>("/admin/invitations", { email: v.email, role: v.role, title: nn(v.title), teamId: nn(v.teamId), managerId: nn(v.managerId) }), { success: "Invitation sent", invalidate: inv, onSuccess: (r) => (setLastLink(r.devLink ?? null), setV({ email: "", role: "MEMBER", title: "", teamId: "", managerId: "" })) });
  const resend = useAction((id: string) => api.post<{ devLink?: string }>(`/admin/invitations/${id}/resend`), { success: "Invitation resent with a new link — the old one stopped working", invalidate: inv, onSuccess: (r) => setLastLink(r.devLink ?? null) });
  const revoke = useAction((id: string) => api.post(`/admin/invitations/${id}/revoke`), { success: "Invitation revoked", invalidate: inv });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="self-start">
        <CardHeader icon={<Mail className="h-4 w-4" />} title="Invite someone" description="Single-use link, expires in 7 days." />
        <CardBody className="space-y-3">
          <Field label="Email" htmlFor="inv-email" required><Input id="inv-email" type="email" value={v.email} onChange={set("email")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role" htmlFor="inv-role"><Select id="inv-role" value={v.role} onChange={set("role")}>{ORG_ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}</Select></Field>
            <Field label="Title" htmlFor="inv-title"><Input id="inv-title" value={v.title} onChange={set("title")} /></Field>
          </div>
          <Field label="Team" htmlFor="inv-team"><TeamSelect id="inv-team" value={v.teamId} onChange={set("teamId")} /></Field>
          <Field label="Manager" htmlFor="inv-mgr"><PersonSelect id="inv-mgr" value={v.managerId} onChange={set("managerId")} placeholder="No manager yet" /></Field>
          <Button variant="primary" className="w-full" disabled={!v.email.includes("@")} loading={create.isPending} onClick={() => create.mutate(undefined)}>Send invitation</Button>
          {lastLink && (
            <div className="rounded-lg border border-dashed border-line-strong p-2.5 text-[12px]">
              <p className="text-muted">Local demo mode: the email is in the developer mailbox. Invite link:</p>
              <button className="mt-1 flex items-center gap-1 font-medium text-brand" onClick={() => navigator.clipboard.writeText(lastLink).then(() => toast.success("Link copied"))}><Copy className="h-3 w-3" /> Copy invite link</button>
            </div>
          )}
        </CardBody>
      </Card>
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading || !data ? <LoadingCards /> : (
        <Card className="divide-y divide-line">
          {data.length === 0 && <EmptyState title="No invitations yet" />}
          {data.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
              <div className="min-w-0 flex-1"><p className="font-medium">{i.email}</p><p className="text-[12px] text-muted">{label(i.role)}{i.title ? ` · ${i.title}` : ""} · sent {relative(i.lastSentAt)}{i.sendCount > 1 ? ` (${i.sendCount}×)` : ""} · expires {day(i.expiresAt)}</p></div>
              <StatusBadge status={i.status} />
              {(i.status === "PENDING" || i.status === "EXPIRED") && <Button size="xs" onClick={() => resend.mutate(i.id)}>Resend</Button>}
              {i.status === "PENDING" && <Button size="xs" variant="ghost" className="text-danger" onClick={() => revoke.mutate(i.id)}>Revoke</Button>}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

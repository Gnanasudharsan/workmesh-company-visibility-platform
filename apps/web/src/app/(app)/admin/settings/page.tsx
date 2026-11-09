"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { api, useAction, useApi } from "@/lib/hooks";

interface OrgSettings { id: string; name: string; slug: string; staleAfterDays: number; escalateBlockersAfterHours: number | null; isDemo: boolean }

export default function OrgSettingsPage() {
  const { data, error, refetch } = useApi<OrgSettings>("/admin/settings");
  const [draft, setDraft] = useState<{ name: string; stale: string; escalate: string } | null>(null);
  const v = draft ?? (data ? { name: data.name, stale: String(data.staleAfterDays), escalate: data.escalateBlockersAfterHours ? String(data.escalateBlockersAfterHours) : "" } : null);
  const save = useAction(() => api.patch("/admin/settings", { name: v!.name, staleAfterDays: Number(v!.stale), escalateBlockersAfterHours: v!.escalate ? Number(v!.escalate) : null }), { success: "Organization settings saved", invalidate: ["/admin", "/auth/me"], onSuccess: () => setDraft(null) });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!data || !v) return <LoadingCards />;
  return (
    <Card className="max-w-2xl">
      <CardHeader title="Organization" description={`workmesh.app/${data.slug}${data.isDemo ? " · synthetic demo organization" : ""}`} />
      <CardBody className="space-y-4">
        <Field label="Company name" htmlFor="os-name"><Input id="os-name" value={v.name} onChange={(e) => setDraft({ ...v, name: e.target.value })} /></Field>
        <Field label="Show “No recent update” after (days)" htmlFor="os-stale" hint="Neutral freshness label in Team Pulse. It describes information, never people."><Input id="os-stale" type="number" min={1} max={60} value={v.stale} onChange={(e) => setDraft({ ...v, stale: e.target.value })} className="w-28" /></Field>
        <Field label="Escalate unowned high/critical blockers after (hours)" htmlFor="os-esc" hint="Leave empty to turn escalation off. Escalations notify the reporter's management chain once."><Input id="os-esc" type="number" min={1} max={720} value={v.escalate} onChange={(e) => setDraft({ ...v, escalate: e.target.value })} className="w-28" placeholder="Off" /></Field>
        <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button>
      </CardBody>
    </Card>
  );
}

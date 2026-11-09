"use client";

import { label } from "@workmesh/core";
import { CheckCircle2, ShieldQuestion, XCircle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/feedback";
import { Field, Select } from "@/components/ui/form";
import { PersonSelect, TeamSelect } from "@/components/work/pickers";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { MeetingSummary, PersonLite, ProjectSummary } from "@/lib/types";

interface Inspection { member: PersonLite; role: string; active: boolean; workspaces: string[]; relationships: Record<string, number>; checks: Array<{ capability: string; allow: boolean; reason: string }> }

export default function PermissionInspector() {
  const [memberId, setMemberId] = useState("");
  const [type, setType] = useState("project");
  const [resourceId, setResourceId] = useState("");
  const [result, setResult] = useState<Inspection | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const { data: projects } = useApi<ProjectSummary[]>("/projects");
  const { data: meetings } = useApi<MeetingSummary[]>("/meetings");
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.get<Inspection>(`/admin/permissions/inspect?memberId=${memberId}&resourceType=${type}&resourceId=${resourceId}`));
    } catch (e) {
      setError(e as ApiError);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="self-start">
        <CardHeader icon={<ShieldQuestion className="h-4 w-4" />} title="Why can (or can't) someone see this?" description="Runs the real policy engine with that member's real relationships. You can only inspect resources you can see yourself." />
        <CardBody className="space-y-3">
          <Field label="Member" htmlFor="pi-member"><PersonSelect id="pi-member" value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="Choose a member" /></Field>
          <Field label="Resource type" htmlFor="pi-type"><Select id="pi-type" value={type} onChange={(e) => (setType(e.target.value), setResourceId(""))}>{["project", "team", "meeting", "member"].map((t) => <option key={t} value={t}>{label(t.toUpperCase())}</option>)}</Select></Field>
          <Field label="Resource" htmlFor="pi-res">
            {type === "project" && <Select id="pi-res" value={resourceId} onChange={(e) => setResourceId(e.target.value)}><option value="">Choose a project</option>{projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
            {type === "team" && <TeamSelect id="pi-res" value={resourceId} onChange={(e) => setResourceId(e.target.value)} placeholder="Choose a team" />}
            {type === "meeting" && <Select id="pi-res" value={resourceId} onChange={(e) => setResourceId(e.target.value)}><option value="">Choose a meeting</option>{meetings?.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</Select>}
            {type === "member" && <PersonSelect id="pi-res" value={resourceId} onChange={(e) => setResourceId(e.target.value)} placeholder="Whose work?" />}
          </Field>
          <Button variant="primary" className="w-full" disabled={!memberId || !resourceId} loading={busy} onClick={run}>Inspect</Button>
        </CardBody>
      </Card>
      <div>
        {error && <ErrorState error={error} />}
        {result && (
          <Card>
            <CardHeader title={result.member.name} description={`${label(result.role)} · workspaces: ${result.workspaces.map((w) => label(w.toUpperCase())).join(", ")}`} />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-1.5">{Object.entries(result.relationships).map(([k, v]) => <Badge key={k}>{k}: {v}</Badge>)}</div>
              <ul className="divide-y divide-line">
                {result.checks.map((c) => (
                  <li key={c.capability} className="flex items-start gap-3 py-2.5">
                    {c.allow ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" aria-label="Allowed" /> : <XCircle className="mt-0.5 h-4 w-4 text-danger" aria-label="Denied" />}
                    <div><p className="font-mono text-[12.5px]">{c.capability}</p><p className="text-[12.5px] text-muted">{c.allow ? "Allowed" : "Denied"} — {c.reason}</p></div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}

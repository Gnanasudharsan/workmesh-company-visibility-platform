"use client";

import { Clock, UserRoundCog } from "lucide-react";
import { useState } from "react";
import { PersonChip } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LoadingCards } from "@/components/ui/feedback";
import { Field, Input, Select } from "@/components/ui/form";
import { PersonSelect } from "@/components/work/pickers";
import { api, useAction, useApi } from "@/lib/hooks";
import type { PersonLite } from "@/lib/types";
import { day } from "@/lib/utils";

interface Line { id: string; type: "PRIMARY" | "DOTTED"; report: PersonLite | null; manager: PersonLite | null; startedAt: string; endedAt: string | null; reason: string | null }
interface Delegation { id: string; delegator: PersonLite | null; delegate: PersonLite | null; reason: string | null; startsAt: string; expiresAt: string; revokedAt: string | null; active: boolean }

const INV = ["/reporting", "/org", "/people", "/graph", "/dashboard", "/delegations", "/admin"];

export default function ReportingPage() {
  const [person, setPerson] = useState("");
  const [manager, setManager] = useState("");
  const [type, setType] = useState<"PRIMARY" | "DOTTED">("PRIMARY");
  const [reason, setReason] = useState("");
  const { data: history } = useApi<Line[]>(person ? `/reporting/${person}/history` : null);
  const { data: delegations } = useApi<Delegation[]>("/delegations");
  const set = useAction(() => api.post("/reporting", { reportId: person, managerId: manager, type, reason: reason || null }), { success: type === "PRIMARY" ? "Manager changed — the previous line is kept in history" : "Dotted line added", invalidate: INV, onSuccess: () => (setManager(""), setReason("")) });
  const end = useAction((id: string) => api.del(`/reporting/${id}`), { success: "Reporting line ended", invalidate: INV });
  const [d, setD] = useState({ delegatorId: "", delegateId: "", expiresAt: "", reason: "" });
  const delegate = useAction(() => api.post("/delegations", { ...d, expiresAt: new Date(`${d.expiresAt}T23:59:00`).toISOString(), reason: d.reason || null }), { success: "Delegation created", invalidate: INV, onSuccess: () => setD({ delegatorId: "", delegateId: "", expiresAt: "", reason: "" }) });
  const revoke = useAction((id: string) => api.del(`/delegations/${id}`), { success: "Delegation revoked — access ended", invalidate: INV });
  const asReport = (history ?? []).filter((h) => h.report?.id === person);
  const asManager = (history ?? []).filter((h) => h.manager?.id === person && !h.endedAt);
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader icon={<UserRoundCog className="h-4 w-4" />} title="Change who someone reports to" description="Self-management, circular chains and duplicate primary managers are rejected." />
        <CardBody className="space-y-3">
          <Field label="Person" htmlFor="r-person"><PersonSelect id="r-person" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Choose a person" /></Field>
          {person && (
            <>
              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <Field label="New manager" htmlFor="r-mgr"><PersonSelect id="r-mgr" value={manager} onChange={(e) => setManager(e.target.value)} exclude={[person]} placeholder="Choose a manager" /></Field>
                <Field label="Type" htmlFor="r-type"><Select id="r-type" value={type} onChange={(e) => setType(e.target.value as "PRIMARY")}><option value="PRIMARY">Primary</option><option value="DOTTED">Dotted line</option></Select></Field>
              </div>
              <Field label="Reason" htmlFor="r-reason" hint="Recorded in the audit log and history"><Input id="r-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Team reorganization" /></Field>
              <Button variant="primary" disabled={!manager} loading={set.isPending} onClick={() => set.mutate(undefined)}>Save reporting line</Button>
              <div className="border-t border-line pt-3">
                <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold"><Clock className="h-3.5 w-3.5" aria-hidden /> History</p>
                {!history ? <LoadingCards count={1} /> : (
                  <ol className="space-y-2">
                    {asReport.map((h) => (
                      <li key={h.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                        <span>Reports to</span><PersonChip person={h.manager} sub={null} size="xs" />
                        <Badge tone={h.type === "PRIMARY" ? "brand" : "violet"}>{h.type === "PRIMARY" ? "Primary" : "Dotted"}</Badge>
                        <span className="text-[12px] text-muted">{day(h.startedAt, true)} → {h.endedAt ? day(h.endedAt, true) : "now"}{h.reason ? ` · ${h.reason}` : ""}</span>
                        {!h.endedAt && <Button size="xs" variant="ghost" className="ml-auto" onClick={() => end.mutate(h.id)}>End</Button>}
                      </li>
                    ))}
                    {asReport.length === 0 && <li className="text-[13px] text-muted">No reporting lines.</li>}
                  </ol>
                )}
                {asManager.length > 0 && <p className="mt-3 text-[12.5px] text-muted">Currently manages {asManager.map((h) => h.report?.name).join(", ")}.</p>}
              </div>
            </>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Temporary delegation" description="A delegate temporarily inherits a manager's reporting line. Access ends automatically at expiry." />
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Manager (delegator)" htmlFor="dl-from"><PersonSelect id="dl-from" value={d.delegatorId} onChange={(e) => setD({ ...d, delegatorId: e.target.value })} placeholder="Choose" /></Field>
            <Field label="Delegate" htmlFor="dl-to"><PersonSelect id="dl-to" value={d.delegateId} onChange={(e) => setD({ ...d, delegateId: e.target.value })} exclude={[d.delegatorId]} placeholder="Choose" /></Field>
            <Field label="Expires" htmlFor="dl-exp"><Input id="dl-exp" type="date" value={d.expiresAt} onChange={(e) => setD({ ...d, expiresAt: e.target.value })} /></Field>
            <Field label="Reason" htmlFor="dl-reason"><Input id="dl-reason" value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} /></Field>
          </div>
          <Button disabled={!d.delegatorId || !d.delegateId || !d.expiresAt} loading={delegate.isPending} onClick={() => delegate.mutate(undefined)}>Create delegation</Button>
          <div className="space-y-2 border-t border-line pt-3">
            {(delegations ?? []).map((x) => (
              <div key={x.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-medium">{x.delegator?.name}</span> → <span className="font-medium">{x.delegate?.name}</span>
                <span className="text-[12px] text-muted">until {day(x.expiresAt, true)}{x.reason ? ` · ${x.reason}` : ""}</span>
                <span className="ml-auto flex items-center gap-2">{x.active ? <StatusBadge status="ACTIVE" /> : <Badge>{x.revokedAt ? "Revoked" : "Expired"}</Badge>}{x.active && <Button size="xs" variant="ghost" onClick={() => revoke.mutate(x.id)}>Revoke</Button>}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

"use client";

import { BLOCKER_STATES, label } from "@workmesh/core";
import { OctagonAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, Stat } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Segmented, Select } from "@/components/ui/form";
import { BlockerRow } from "@/components/work/cards";
import { CreateDialogs } from "@/components/work/create-dialogs";
import { useApi, useMe } from "@/lib/hooks";
import type { Blocker } from "@/lib/types";

function BlockersInner() {
  const params = useSearchParams();
  const { data: me } = useMe();
  const canQueue = me?.active?.workspaces.some((w) => w === "manager" || w === "lead");
  const [scope, setScope] = useState<"queue" | "mine" | "all">((params.get("scope") as "mine") ?? (canQueue ? "queue" : "mine"));
  const [state, setState] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading, refetch } = useApi<Blocker[]>(`/blockers?scope=${scope}${state ? `&state=${state}` : ""}`);
  const open = (data ?? []).filter((b) => b.state !== "RESOLVED");
  return (
    <>
      <PageHeader title="Blockers" description="Everything slowing work down, who owns it, and how long it has been open." actions={<Button variant="primary" onClick={() => setCreating(true)}><OctagonAlert className="h-4 w-4" /> Report a blocker</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open" value={open.length} />
        <Stat label="Critical / high" value={open.filter((b) => b.severity === "CRITICAL" || b.severity === "HIGH").length} tone="danger" />
        <Stat label="No owner yet" value={open.filter((b) => !b.owner).length} tone="warning" />
        <Stat label="Resolved" value={(data ?? []).length - open.length} tone="success" />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Segmented label="Scope" value={scope} onChange={setScope} options={[...(canQueue ? [{ value: "queue" as const, label: "Needs my attention" }] : []), { value: "mine", label: "Reported by or assigned to me" }, { value: "all", label: "All I can see" }]} />
        <Select value={state} onChange={(e) => setState(e.target.value)} className="w-auto" aria-label="State"><option value="">Any state</option>{BLOCKER_STATES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
      </div>
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <LoadingCards /> : (
        <Card className="p-2">{(data ?? []).length === 0 ? <EmptyState title="No blockers here" description="Nothing in this view is blocked." /> : data!.map((b) => <BlockerRow key={b.id} b={b} />)}</Card>
      )}
      <CreateDialogs kind={creating ? "blocker" : null} onClose={() => setCreating(false)} />
    </>
  );
}

export default function BlockersPage() {
  return <Suspense><BlockersInner /></Suspense>;
}

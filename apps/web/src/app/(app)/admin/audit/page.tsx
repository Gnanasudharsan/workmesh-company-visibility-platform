"use client";

import { useState } from "react";
import { PersonChip } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Select } from "@/components/ui/form";
import { useApi } from "@/lib/hooks";
import type { PersonLite } from "@/lib/types";
import { dateTime } from "@/lib/utils";

interface AuditEvent { id: string; action: string; resourceType: string; resourceId: string | null; metadata: Record<string, unknown> | null; requestId: string | null; createdAt: string; actor: PersonLite | null }

const PREFIXES = ["", "membership", "reporting", "team", "department", "project", "invitation", "delegation", "blocker", "decision", "organization"];

export default function AuditPage() {
  const [action, setAction] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const { data, error, isLoading, refetch } = useApi<{ items: AuditEvent[]; nextCursor: string | null }>(`/admin/audit?${action ? `action=${action}&` : ""}${cursor ? `cursor=${encodeURIComponent(cursor)}` : ""}`);
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Select value={action} onChange={(e) => (setAction(e.target.value), setCursor(null))} className="w-auto" aria-label="Filter by action">{PREFIXES.map((p) => <option key={p} value={p}>{p ? `${p}.*` : "All actions"}</option>)}</Select>
        <p className="text-[12px] text-muted">Structural and access changes. Free-text content of updates and comments is never stored here.</p>
      </div>
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading || !data ? <LoadingCards /> : (
        <Card className="divide-y divide-line">
          {data.items.length === 0 && <EmptyState title="No events" />}
          {data.items.map((a) => (
            <details key={a.id} className="group px-4 py-3">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 text-[13px]">
                <span className="w-44 shrink-0 text-[12px] text-muted">{dateTime(a.createdAt)}</span>
                <span className="w-48 shrink-0"><PersonChip person={a.actor} sub={null} size="xs" link={false} /></span>
                <span className="font-mono text-[12.5px]">{a.action}</span>
                <span className="text-[12px] text-muted">{a.resourceType}</span>
              </summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-subtle p-3 text-[11.5px] text-slate-700">{JSON.stringify({ resourceId: a.resourceId, requestId: a.requestId, ...a.metadata }, null, 2)}</pre>
            </details>
          ))}
        </Card>
      )}
      <div className="mt-3 flex gap-2">
        {cursor && <Button size="sm" onClick={() => setCursor(null)}>Newest</Button>}
        {data?.nextCursor && <Button size="sm" onClick={() => setCursor(data.nextCursor)}>Older events</Button>}
      </div>
    </>
  );
}

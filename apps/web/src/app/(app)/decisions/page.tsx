"use client";

import { Flag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PersonChip } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badges";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Segmented } from "@/components/ui/form";
import { useApi } from "@/lib/hooks";
import type { PersonLite } from "@/lib/types";
import { day } from "@/lib/utils";

interface Decision { id: string; title: string; rationale: string | null; status: string; meetingId: string | null; owner: PersonLite | null; decidedAt: string | null; createdAt: string }

export default function DecisionsPage() {
  const [status, setStatus] = useState<"" | "PENDING" | "DECIDED">("");
  const { data, error, isLoading, refetch } = useApi<Decision[]>(`/decisions${status ? `?status=${status}` : ""}`);
  return (
    <>
      <PageHeader title="Decision log" description="Decisions linked to projects and meetings you can see." />
      <div className="mb-3"><Segmented label="Status" value={status} onChange={setStatus} options={[{ value: "", label: "All" }, { value: "PENDING", label: "Needs a decision" }, { value: "DECIDED", label: "Decided" }]} /></div>
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading || !data ? <LoadingCards /> : (
        <Card className="divide-y divide-line">
          {data.length === 0 ? <EmptyState title="No decisions" /> : data.map((d) => (
            <Link key={d.id} href={d.meetingId ? `/meetings/${d.meetingId}` : "#"} className="flex flex-wrap items-start gap-3 px-5 py-3.5 hover:bg-subtle/60">
              <Flag className="mt-0.5 h-4 w-4 text-violet" aria-hidden />
              <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-medium">{d.title}</span>{d.rationale && <span className="block text-[12.5px] text-muted">{d.rationale}</span>}</span>
              {d.owner && <PersonChip person={d.owner} sub={null} size="xs" link={false} />}
              <span className="w-24 text-right text-[12px] text-muted">{day(d.decidedAt ?? d.createdAt)}</span>
              <StatusBadge status={d.status} />
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}

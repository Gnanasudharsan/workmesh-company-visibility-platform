"use client";

import { label } from "@workmesh/core";
import { CalendarPlus, Repeat } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Segmented } from "@/components/ui/form";
import { CreateDialogs } from "@/components/work/create-dialogs";
import { useApi } from "@/lib/hooks";
import type { MeetingSummary } from "@/lib/types";
import { dateTime } from "@/lib/utils";

export default function MeetingsPage() {
  const [when, setWhen] = useState<"upcoming" | "past">("upcoming");
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading, refetch } = useApi<MeetingSummary[]>(`/meetings?when=${when}`);
  return (
    <>
      <PageHeader title="Meetings" description="Briefs are generated from what actually changed — no recordings, no transcripts." actions={<Button variant="primary" onClick={() => setCreating(true)}><CalendarPlus className="h-4 w-4" /> Schedule meeting</Button>} />
      <div className="mb-3"><Segmented label="When" value={when} onChange={setWhen} options={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }]} /></div>
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <LoadingCards /> : (
        <Card className="p-2">
          {(data ?? []).length === 0 ? <EmptyState title={when === "upcoming" ? "Nothing scheduled" : "No past meetings"} /> : data!.map((m) => (
            <Link key={m.id} href={`/meetings/${m.id}`} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-3 hover:bg-subtle/70">
              <div className="w-40 shrink-0 text-[12.5px] text-muted">{dateTime(m.scheduledAt)}</div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13.5px] font-medium">{m.title}{m.recurrence !== "NONE" && <Repeat className="h-3.5 w-3.5 text-muted" aria-label={`Repeats ${label(m.recurrence)}`} />}</p>
                <p className="text-[12px] text-muted">Organized by {m.organizer?.name} · {m.durationMinutes} min · {m.decisions} decisions · {m.openActionItems} open actions</p>
              </div>
              <AvatarStack people={m.participants} />
              <Badge>{m.participantCount} people</Badge>
              <StatusBadge status={m.status} />
            </Link>
          ))}
        </Card>
      )}
      <CreateDialogs kind={creating ? "meeting" : null} onClose={() => setCreating(false)} />
    </>
  );
}

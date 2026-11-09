"use client";

import { Bell, CalendarClock, CheckCheck, Diamond, FolderKanban, Gavel, HandHelping, MessageSquare, OctagonAlert, GitBranch, ListChecks } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Segmented } from "@/components/ui/form";
import { api, useAction, useApi } from "@/lib/hooks";
import type { Notification } from "@/lib/types";
import { cn, relative } from "@/lib/utils";

const ICONS: Record<string, typeof Bell> = { BLOCKER: OctagonAlert, HELP: HandHelping, UPDATE: MessageSquare, COMMENT: MessageSquare, PROJECT: FolderKanban, MILESTONE: Diamond, DECISION: Gavel, MEETING: CalendarClock, ACTION: CalendarClock, DEADLINE: Diamond, DEPENDENCY: GitBranch, WORK: ListChecks };

function groupByDay(items: Notification[]): Array<[string, Notification[]]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const day = 864e5;
  const groups = new Map<string, Notification[]>();
  for (const n of items) {
    const t = +new Date(n.createdAt);
    const g = t >= +start ? "Today" : t >= +start - day ? "Yesterday" : t >= +start - 6 * day ? "Earlier this week" : "Older";
    groups.set(g, [...(groups.get(g) ?? []), n]);
  }
  return [...groups.entries()];
}

export default function NotificationsPage() {
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const { data, error, isLoading, refetch } = useApi<{ items: Notification[]; unreadCount: number }>(`/notifications${filter === "unread" ? "?unread=true" : ""}`);
  const readAll = useAction(() => api.post("/notifications/read-all"), { success: "All caught up", invalidate: ["/notifications"] });
  const read = useAction((id: string) => api.post(`/notifications/${id}/read`), { invalidate: ["/notifications"] });
  return (
    <>
      <PageHeader title="Notifications" description="Only about things you're allowed to see. Each person is re-checked before a notification is created." actions={<><ButtonLink href="/settings?tab=notifications" variant="ghost">Preferences</ButtonLink><Button disabled={!data?.unreadCount} loading={readAll.isPending} onClick={() => readAll.mutate(undefined)}><CheckCheck className="h-4 w-4" /> Mark all read</Button></>} />
      <div className="mb-3"><Segmented label="Filter" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "unread", label: `Unread${data ? ` (${data.unreadCount})` : ""}` }]} /></div>
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading || !data ? <LoadingCards /> : (
        data.items.length === 0 ? <Card><EmptyState icon={<Bell className="h-5 w-5" aria-hidden />} title="Nothing here" description="You're all caught up." /></Card> : (
          <div className="space-y-5">
            {groupByDay(data.items).map(([group, items]) => (
              <section key={group} aria-labelledby={`n-${group}`}>
                <h2 id={`n-${group}`} className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{group}</h2>
                <Card className="divide-y divide-line overflow-hidden">
                  {items.map((n) => {
                    const Icon = ICONS[n.type.split("_")[0] ?? ""] ?? Bell;
                    return (
                      <Link key={n.id} href={n.link ?? "#"} onClick={() => !n.readAt && read.mutate(n.id)} className={cn("flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-subtle/60", !n.readAt && "bg-teal-soft/35")}>
                        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]", n.readAt ? "bg-subtle text-muted" : "bg-teal-soft text-teal-ink")}><Icon className="h-4 w-4" aria-hidden /></span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-[13.5px]", !n.readAt && "font-medium")}>{n.title}</span>
                          {n.body && <span className="block text-[12.5px] text-muted">{n.body}</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-[12px] text-muted">
                          {relative(n.createdAt)}
                          {!n.readAt ? <span className="h-2 w-2 rounded-full bg-teal" aria-label="Unread" /> : <span className="sr-only">Read</span>}
                        </span>
                      </Link>
                    );
                  })}
                </Card>
              </section>
            ))}
          </div>
        )
      )}
    </>
  );
}

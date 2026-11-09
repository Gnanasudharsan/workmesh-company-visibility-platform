"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Segmented } from "@/components/ui/form";
import { api, useAction, useApi } from "@/lib/hooks";
import type { Notification } from "@/lib/types";
import { cn, relative } from "@/lib/utils";

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
        <Card className="divide-y divide-line">
          {data.items.length === 0 ? <EmptyState icon={<Bell className="h-5 w-5" aria-hidden />} title="Nothing here" description="You're all caught up." /> : data.items.map((n) => (
            <Link key={n.id} href={n.link ?? "#"} onClick={() => !n.readAt && read.mutate(n.id)} className={cn("flex items-start gap-3 px-5 py-3.5 hover:bg-subtle/60", !n.readAt && "bg-brand-soft/30")}>
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-line" : "bg-brand")} aria-label={n.readAt ? "Read" : "Unread"} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px]">{n.title}</span>
                {n.body && <span className="block text-[12.5px] text-muted">{n.body}</span>}
              </span>
              <span className="shrink-0 text-[12px] text-muted">{relative(n.createdAt)}</span>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}

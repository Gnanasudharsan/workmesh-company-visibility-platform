"use client";

import { Inbox } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { useApi } from "@/lib/hooks";
import { dateTime } from "@/lib/utils";

interface Mail { id: string; to: string; subject: string; text: string; link: string | null; createdAt: string }

/** Local development mailbox (DEMO_MODE only). Replaces a paid email provider. */
export default function MailboxPage() {
  const { data, error } = useApi<Mail[]>("/dev/mailbox", { refetchInterval: 5000, retry: false });
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between"><Logo /><Link href="/login" className="text-[13px] text-brand">Sign in</Link></div>
      <h1 className="flex items-center gap-2 text-[22px] font-semibold"><Inbox className="h-5 w-5" aria-hidden /> Developer mailbox</h1>
      <p className="mb-5 mt-1 text-[13.5px] text-muted">Invitation and password-reset emails sent by the local API. Available only when DEMO_MODE is enabled; never in production.</p>
      {error ? <Card><EmptyState title="Mailbox unavailable" description="The API is not running in demo mode." /></Card> : (
        <Card className="divide-y divide-line">
          {(data ?? []).length === 0 && <EmptyState title="No messages yet" />}
          {(data ?? []).map((m) => (
            <article key={m.id} className="px-5 py-4">
              <p className="text-[12px] text-muted">To {m.to} · {dateTime(m.createdAt)}</p>
              <p className="mt-0.5 text-[14px] font-semibold">{m.subject}</p>
              <p className="mt-1 whitespace-pre-line text-[13px] text-ink-soft">{m.text.split("\n")[0]}</p>
              {m.link && <Link href={new URL(m.link).pathname} className="mt-2 inline-block text-[13px] font-medium text-brand">Open link →</Link>}
            </article>
          ))}
        </Card>
      )}
    </div>
  );
}

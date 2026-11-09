"use client";

import { label } from "@workmesh/core";
import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { AccessBadge, StatusBadge } from "@/components/ui/badges";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { useApi } from "@/lib/hooks";

type R = Record<string, Array<Record<string, unknown>>>;

const GROUPS: Array<{ key: string; title: string; href: (x: Record<string, unknown>) => string; text: (x: Record<string, unknown>) => string; sub?: (x: Record<string, unknown>) => string }> = [
  { key: "people", title: "People", href: (x) => `/people/${x.id}`, text: (x) => String(x.name), sub: (x) => String(x.title) },
  { key: "teams", title: "Teams", href: (x) => `/teams/${x.id}`, text: (x) => String(x.name), sub: (x) => String(x.mission ?? "") },
  { key: "departments", title: "Departments", href: (x) => `/departments/${x.id}`, text: (x) => String(x.name) },
  { key: "projects", title: "Projects", href: (x) => `/projects/${x.id}`, text: (x) => String(x.name), sub: (x) => String(x.summary ?? "") },
  { key: "goals", title: "Goals", href: (x) => `/goals/${x.id}`, text: (x) => String(x.title) },
  { key: "initiatives", title: "Initiatives", href: (x) => `/initiatives/${x.id}`, text: (x) => String(x.title) },
  { key: "milestones", title: "Milestones", href: (x) => `/milestones/${x.id}`, text: (x) => String(x.title) },
  { key: "updates", title: "Updates", href: (x) => `/updates/${x.id}`, text: (x) => String(x.currentFocus), sub: (x) => String((x.author as { name?: string } | null)?.name ?? "") },
  { key: "blockers", title: "Blockers", href: (x) => `/blockers/${x.id}`, text: (x) => String(x.title), sub: (x) => label(String(x.severity)) },
  { key: "decisions", title: "Decisions", href: (x) => (x.meetingId ? `/meetings/${x.meetingId}` : "/decisions"), text: (x) => String(x.title) },
];

function SearchInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const term = params.get("q") ?? "";
  const { data, error, isLoading } = useApi<{ results: R; total: number }>(term.length >= 2 ? `/search?q=${encodeURIComponent(term)}&limit=20` : null);
  return (
    <>
      <PageHeader title="Search" description="Results are filtered on the server — you only ever receive what you're allowed to see." />
      <form className="relative mb-5 max-w-xl" onSubmit={(e) => (e.preventDefault(), router.replace(`/search?q=${encodeURIComponent(q)}`))}>
        <Search className="absolute left-3 top-3 h-4 w-4 text-faint" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-10 pl-9" placeholder="Search everything you can access" aria-label="Search" autoFocus />
      </form>
      {term.length < 2 ? <Card><EmptyState title="Type at least two characters" /></Card> : error ? <ErrorState error={error} /> : isLoading || !data ? <LoadingCards /> : data.total === 0 ? <Card><EmptyState title={`No results for “${term}”`} description="Nothing you have access to matches." /></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {GROUPS.filter((g) => data.results[g.key]?.length).map((g) => (
            <Card key={g.key}>
              <CardHeader title={`${g.title} (${data.results[g.key]!.length})`} />
              <CardBody className="space-y-1 px-2 pb-2">
                {data.results[g.key]!.map((x) => (
                  <Link key={String(x.id)} href={g.href(x)} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-subtle/70">
                    {g.key === "people" && <Avatar name={String(x.name)} hue={Number(x.avatarHue)} size="sm" />}
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{g.text(x)}</span>{g.sub && <span className="block truncate text-[12px] text-muted">{g.sub(x)}</span>}</span>
                    {g.key === "projects" && <AccessBadge access={x.access as "summary" | "details"} />}
                    {typeof x.status === "string" && g.key !== "people" && <StatusBadge status={x.status} />}
                    {typeof x.state === "string" && <StatusBadge status={x.state} />}
                  </Link>
                ))}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export default function SearchPage() {
  return <Suspense><SearchInner /></Suspense>;
}

"use client";

import { Building2, Search, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Avatar, PersonChip } from "@/components/ui/avatar";
import { RoleBadge } from "@/components/ui/badges";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Input, Segmented, Select } from "@/components/ui/form";
import { usePeople } from "@/components/work/pickers";
import { useApi } from "@/lib/hooks";
import type { PersonLite } from "@/lib/types";

interface Dept { id: string; name: string; description: string | null; color: string; head: PersonLite | null; teams: Array<{ id: string; name: string }>; memberCount: number }
interface Team { id: string; name: string; mission: string | null; responsibilities: string[]; department: { id: string; name: string; color: string } | null; lead: PersonLite | null; memberCount: number }

function DirectoryInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // The section lives in the URL so links (and the sidebar's Teams entry) can open it directly.
  const tab = ((["teams", "departments"] as const).find((t) => t === params.get("tab")) ?? "people") as "people" | "teams" | "departments";
  const setTab = (t: typeof tab) => router.replace(t === "people" ? pathname : `${pathname}?tab=${t}`, { scroll: false });
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const people = usePeople();
  const teams = useApi<Team[]>("/teams");
  const depts = useApi<Dept[]>("/departments");
  const teamName = useMemo(() => new Map((teams.data ?? []).map((t) => [t.id, t.name])), [teams.data]);
  const needle = q.toLowerCase();

  const filteredPeople = (people.data ?? []).filter((p) => (!dept || p.departmentId === dept) && (!needle || `${p.name} ${p.title} ${teamName.get(p.primaryTeamId ?? "") ?? ""}`.toLowerCase().includes(needle)));
  const filteredTeams = (teams.data ?? []).filter((t) => (!dept || t.department?.id === dept) && (!needle || `${t.name} ${t.mission ?? ""} ${t.responsibilities.join(" ")}`.toLowerCase().includes(needle)));
  const error = people.error ?? teams.error ?? depts.error;

  return (
    <>
      <PageHeader title="Company Directory" description="Find people, discover what each team owns, and know who to contact." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented label="Directory section" value={tab} onChange={setTab} options={[{ value: "people", label: `People${people.data ? ` (${people.data.length})` : ""}` }, { value: "teams", label: "Teams" }, { value: "departments", label: "Departments" }]} />
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-faint" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" placeholder={tab === "teams" ? "Search by responsibility, e.g. invoicing" : "Search by name, title or team"} aria-label="Search directory" />
        </div>
        {tab !== "departments" && <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-auto" aria-label="Department"><option value="">All departments</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>}
      </div>
      {error ? <ErrorState error={error} /> : !people.data || !teams.data || !depts.data ? <LoadingCards /> : (
        <>
          {tab === "people" && (
            filteredPeople.length === 0 ? <Card><EmptyState title="Nobody matches" /></Card> : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredPeople.map((p) => (
                  <Link key={p.id} href={`/people/${p.id}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-card transition-shadow hover:shadow-raised">
                    <Avatar name={p.name} hue={p.avatarHue} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold">{p.name}</p>
                      <p className="truncate text-[12.5px] text-muted">{p.title}</p>
                      <p className="truncate text-[12px] text-faint">{teamName.get(p.primaryTeamId ?? "") ?? "No team"}</p>
                    </div>
                    <RoleBadge role={p.role} />
                  </Link>
                ))}
              </div>
            )
          )}
          {tab === "teams" && (
            filteredTeams.length === 0 ? <Card><EmptyState title="No teams match" description="Try a different responsibility." /></Card> : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredTeams.map((t) => (
                  <Link key={t.id} href={`/teams/${t.id}`} className="flex flex-col rounded-xl border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-raised">
                    <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted" aria-hidden /><p className="text-[14px] font-semibold">{t.name}</p><span className="ml-auto text-[12px] text-muted">{t.memberCount} people</span></div>
                    {t.department && <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted"><span className="h-2 w-2 rounded-full" style={{ background: t.department.color }} aria-hidden />{t.department.name}</p>}
                    <p className="mt-2 line-clamp-2 text-[13px] text-ink-soft">{t.mission ?? "No mission statement yet."}</p>
                    <div className="mt-3 flex flex-wrap gap-1">{t.responsibilities.slice(0, 4).map((r) => <span key={r} className="rounded-md bg-subtle px-1.5 py-0.5 text-[11.5px] text-ink-soft">{r}</span>)}</div>
                    <div className="mt-auto pt-3">{t.lead ? <PersonChip person={t.lead} sub="Team lead" link={false} size="xs" /> : <span className="text-[12px] text-faint">No lead</span>}</div>
                  </Link>
                ))}
              </div>
            )
          )}
          {tab === "departments" && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {depts.data.map((d) => (
                <Link key={d.id} href={`/departments/${d.id}`} className="rounded-xl border border-line bg-surface p-4 shadow-card transition-shadow hover:shadow-raised">
                  <div className="flex items-center gap-2"><Building2 className="h-4 w-4" style={{ color: d.color }} aria-hidden /><p className="text-[14.5px] font-semibold">{d.name}</p><span className="ml-auto text-[12px] text-muted">{d.memberCount} people · {d.teams.length} teams</span></div>
                  <p className="mt-1.5 text-[13px] text-ink-soft">{d.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">{d.head && <PersonChip person={d.head} sub="Head" link={false} size="xs" />}<span className="text-[12px] text-muted">{d.teams.map((t) => t.name).join(" · ")}</span></div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function DirectoryPage() {
  return <Suspense><DirectoryInner /></Suspense>;
}

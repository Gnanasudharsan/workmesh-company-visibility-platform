"use client";

import { label, PROJECT_STATUSES } from "@workmesh/core";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from "@tanstack/react-table";
import { addMonths, differenceInCalendarDays, format, startOfMonth } from "date-fns";
import { ArrowUpDown, CalendarRange, Columns3, Diamond, List, Network, Plus, Target } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { PersonChip } from "@/components/ui/avatar";
import { AccessBadge, HealthBadge, StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { EmptyState, ErrorState, healthTone, LoadingCards, ProgressBar } from "@/components/ui/feedback";
import { Segmented } from "@/components/ui/form";
import { CreateDialogs, type CreateKind } from "@/components/work/create-dialogs";
import { useApi, useMe } from "@/lib/hooks";
import type { ProjectSummary } from "@/lib/types";
import { cn, day, daysUntil } from "@/lib/utils";

type View = "timeline" | "kanban" | "list" | "milestones" | "goals";
interface RoadmapData {
  projects: ProjectSummary[];
  milestones: Array<{ id: string; projectId: string; title: string; status: string; dueDate: string | null; isCritical: boolean; completedAt: string | null }>;
}

const HEALTH_BAR: Record<string, string> = { ON_TRACK: "bg-success/80", AT_RISK: "bg-warning/80", OFF_TRACK: "bg-danger/80", BLOCKED: "bg-danger/80", NOT_STARTED: "bg-slate-300", DONE: "bg-success/50", CANCELLED: "bg-slate-200" };

function Timeline({ data, highlight }: { data: RoadmapData; highlight: string | null }) {
  const projects = data.projects.filter((p) => p.startDate || p.targetDate);
  const start = startOfMonth(addMonths(new Date(), -3));
  const months = Array.from({ length: 9 }, (_, i) => addMonths(start, i));
  const end = addMonths(start, 9);
  const total = differenceInCalendarDays(end, start);
  const pct = (d: Date) => Math.min(100, Math.max(0, (differenceInCalendarDays(d, start) / total) * 100));
  const today = pct(new Date());
  const groups = new Map<string, ProjectSummary[]>();
  for (const p of projects) {
    const key = p.initiative?.title ?? "Not aligned to an initiative";
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return (
    <Card className="overflow-x-auto">
      <div className="min-w-[900px]">
        <div className="sticky top-0 z-10 grid grid-cols-[260px_1fr] border-b border-line bg-surface">
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Project</div>
          <div className="relative grid" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>
            {months.map((m) => <div key={m.toISOString()} className="border-l border-line px-2 py-2 text-[11.5px] font-medium text-muted">{format(m, "MMM yyyy")}</div>)}
          </div>
        </div>
        {[...groups.entries()].map(([g, ps]) => (
          <div key={g}>
            <div className="border-b border-line bg-subtle/50 px-4 py-1.5 text-[12px] font-semibold text-slate-600">{g}</div>
            {ps.map((p) => {
              const s = p.startDate ? new Date(p.startDate) : new Date();
              const e = p.targetDate ? new Date(p.targetDate) : addMonths(s, 1);
              const left = pct(s);
              const width = Math.max(1.5, pct(e) - left);
              const ms = data.milestones.filter((m) => m.projectId === p.id && m.dueDate);
              return (
                <div key={p.id} className={cn("grid grid-cols-[260px_1fr] border-b border-line last:border-0", highlight === p.id && "bg-brand-soft/40")}>
                  <Link href={`/projects/${p.id}`} className="flex min-w-0 items-center gap-2 px-4 py-2.5 hover:text-brand-deep">
                    <span className="font-mono text-[10.5px] text-muted">{p.key}</span>
                    <span className="truncate text-[13px] font-medium">{p.name}</span>
                  </Link>
                  <div className="relative h-11">
                    {months.map((m, i) => <span key={i} className="absolute inset-y-0 border-l border-line/70" style={{ left: `${(i / months.length) * 100}%` }} aria-hidden />)}
                    <span className="absolute inset-y-0 w-px bg-brand" style={{ left: `${today}%` }} aria-hidden />
                    <Link href={`/projects/${p.id}`} title={`${p.name}: ${label(p.health)} · ${day(p.startDate)} → ${day(p.targetDate)}`} className={cn("absolute top-3 h-5 rounded-md shadow-sm ring-1 ring-black/5 transition-transform hover:scale-y-110", HEALTH_BAR[p.health])} style={{ left: `${left}%`, width: `${width}%` }}>
                      {p.computedProgress !== null && <span className="absolute inset-y-0 left-0 rounded-l-md bg-black/15" style={{ width: `${p.computedProgress}%` }} aria-hidden />}
                    </Link>
                    {ms.map((m) => (
                      <Link key={m.id} href={`/milestones/${m.id}`} title={`${m.title} · ${label(m.status)} · ${day(m.dueDate)}`} className="absolute top-[10px] -translate-x-1/2" style={{ left: `${pct(new Date(m.dueDate!))}%` }}>
                        <Diamond className={cn("h-3.5 w-3.5 drop-shadow", m.status === "DONE" ? "fill-success text-white" : m.isCritical ? "fill-danger text-white" : "fill-ink text-white")} aria-label={m.title} />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 border-t border-line px-4 py-2.5 text-[11.5px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded bg-success/80" />On track</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded bg-warning/80" />At risk</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded bg-danger/80" />Off track / blocked</span>
        <span className="flex items-center gap-1.5"><Diamond className="h-3 w-3 fill-danger text-white" />Critical milestone</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-brand" />Today</span>
        <span>Darker fill = computed progress</span>
      </div>
    </Card>
  );
}

function Kanban({ projects }: { projects: ProjectSummary[] }) {
  const cols = PROJECT_STATUSES.filter((s) => s !== "CANCELLED");
  return (
    <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-6">
      {cols.map((c) => {
        const items = projects.filter((p) => p.status === c);
        return (
          <section key={c} className="min-w-[220px] rounded-xl bg-subtle/60 p-2" aria-label={label(c)}>
            <h3 className="flex items-center justify-between px-1.5 pb-2 text-[12px] font-semibold text-muted">{label(c)}<span>{items.length}</span></h3>
            <div className="space-y-2">
              {items.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="block rounded-lg border border-line bg-surface p-3 shadow-card hover:border-line-strong">
                  <div className="flex items-center gap-1.5"><span className="font-mono text-[10.5px] text-muted">{p.key}</span><AccessBadge access={p.access} /></div>
                  <p className="mt-0.5 text-[13px] font-medium leading-snug">{p.name}</p>
                  <div className="mt-2"><ProgressBar value={p.computedProgress} tone={healthTone(p.health)} /></div>
                  <div className="mt-2 flex items-center justify-between"><HealthBadge health={p.health} reasons={p.healthReasons} /><span className="text-[11.5px] text-muted">{day(p.targetDate)}</span></div>
                </Link>
              ))}
              {items.length === 0 && <p className="py-4 text-center text-[12px] text-faint">None</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const col = createColumnHelper<ProjectSummary>();
function ProjectTable({ projects }: { projects: ProjectSummary[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "targetDate", desc: false }]);
  const columns = useMemo(
    () => [
      col.accessor("name", { header: "Project", cell: (c) => <Link href={`/projects/${c.row.original.id}`} className="font-medium hover:text-brand-deep">{c.getValue()}</Link> }),
      col.accessor((p) => p.owningTeam?.name ?? "", { id: "team", header: "Team" }),
      col.accessor((p) => p.lead?.name ?? "", { id: "lead", header: "Lead", cell: (c) => <PersonChip person={c.row.original.lead} sub={null} size="xs" /> }),
      col.accessor("status", { header: "Status", cell: (c) => <StatusBadge status={c.getValue()} /> }),
      col.accessor("health", { header: "Health", cell: (c) => <HealthBadge health={c.getValue()} reasons={c.row.original.healthReasons} /> }),
      col.accessor((p) => p.computedProgress ?? -1, { id: "progress", header: "Computed", cell: (c) => <div className="w-28"><ProgressBar value={c.row.original.computedProgress} tone={healthTone(c.row.original.health)} /></div> }),
      col.accessor((p) => p.targetDate ?? "9999", { id: "targetDate", header: "Target", cell: (c) => day(c.row.original.targetDate, true) }),
    ],
    [],
  );
  const table = useReactTable({ data: projects, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-[13px]">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-line">
              {hg.headers.map((h) => (
                <th key={h.id} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-faint" aria-sort={h.column.getIsSorted() === "asc" ? "ascending" : h.column.getIsSorted() === "desc" ? "descending" : "none"}>
                  <button className="flex items-center gap-1 hover:text-ink" onClick={h.column.getToggleSortingHandler()}>{flexRender(h.column.columnDef.header, h.getContext())}<ArrowUpDown className="h-3 w-3" aria-hidden /></button>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0 hover:bg-subtle/50">
              {r.getVisibleCells().map((c) => <td key={c.id} className="px-4 py-2.5">{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function MilestoneList({ items, tone, byId }: { items: RoadmapData["milestones"]; tone: string; byId: Map<string, ProjectSummary> }) {
  return (
    <ul className="space-y-1">
      {items.map((m) => {
        const d = daysUntil(m.dueDate);
        return (
          <li key={m.id}>
            <Link href={`/milestones/${m.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-subtle/70">
              <Diamond className={cn("h-3.5 w-3.5", tone)} aria-hidden />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{m.title}</span><span className="block truncate text-[12px] text-muted">{byId.get(m.projectId)?.name}{m.isCritical ? " · critical" : ""}</span></span>
              <span className="text-[12px] text-muted">{m.status === "DONE" ? `done ${day(m.completedAt)}` : d !== null && d < 0 ? <span className="font-medium text-danger">{-d}d overdue</span> : day(m.dueDate)}</span>
            </Link>
          </li>
        );
      })}
      {items.length === 0 && <li className="px-3 py-4 text-[13px] text-muted">None</li>}
    </ul>
  );
}

function MilestoneTracker({ data }: { data: RoadmapData }) {
  const byId = new Map(data.projects.map((p) => [p.id, p]));
  const open = data.milestones.filter((m) => m.status !== "DONE" && m.status !== "CANCELLED" && m.dueDate);
  const overdue = open.filter((m) => (daysUntil(m.dueDate) ?? 0) < 0);
  const upcoming = open.filter((m) => (daysUntil(m.dueDate) ?? 0) >= 0);
  const done = data.milestones.filter((m) => m.status === "DONE").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")).slice(0, 8);
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card><CardBody className="pt-4"><h3 className="mb-2 text-[13px] font-semibold text-danger">Overdue ({overdue.length})</h3><MilestoneList byId={byId} items={overdue} tone="text-danger" /></CardBody></Card>
      <Card><CardBody className="pt-4"><h3 className="mb-2 text-[13px] font-semibold">Upcoming ({upcoming.length})</h3><MilestoneList byId={byId} items={upcoming} tone="text-brand" /></CardBody></Card>
      <Card><CardBody className="pt-4"><h3 className="mb-2 text-[13px] font-semibold text-success">Recently reached</h3><MilestoneList byId={byId} items={done} tone="text-success" /></CardBody></Card>
    </div>
  );
}

interface GoalTree {
  goals: Array<{ id: string; title: string; status: string; period: string | null; progress: number | null; projectCount: number; atRisk: number; canEdit: boolean; owner: { id: string; name: string; title: string; avatarHue: number } | null; initiatives: Array<{ id: string; title: string; progress: number | null; projectCount: number; atRisk: number; projects: ProjectSummary[] }> }>;
  unalignedProjects: ProjectSummary[];
  canCreateGoal: boolean;
  canCreateInitiative: boolean;
}

function GoalHierarchy({ onCreate }: { onCreate: (k: CreateKind, goalId?: string) => void }) {
  const { data, error } = useApi<GoalTree>("/goals");
  if (error) return <ErrorState error={error} />;
  if (!data) return <LoadingCards />;
  return (
    <div className="space-y-4">
      {(data.canCreateGoal || data.canCreateInitiative) && (
        <div className="flex gap-2">
          {data.canCreateGoal && <Button size="sm" variant="primary" onClick={() => onCreate("goal")}><Plus className="h-3.5 w-3.5" /> Company goal</Button>}
          {data.canCreateInitiative && <Button size="sm" onClick={() => onCreate("initiative")}><Plus className="h-3.5 w-3.5" /> Initiative</Button>}
        </div>
      )}
      {data.goals.map((g) => (
        <Card key={g.id}>
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
            <Target className="h-5 w-5 text-violet" aria-hidden />
            <div className="min-w-0 flex-1">
              <Link href={`/goals/${g.id}`} className="text-[15px] font-semibold hover:text-brand-deep">{g.title}</Link>
              <p className="text-[12px] text-muted">{g.period ?? "Company goal"} · {g.projectCount} visible projects{g.atRisk ? ` · ${g.atRisk} need attention` : ""}</p>
            </div>
            <div className="w-40"><ProgressBar value={g.progress} tone="brand" label={`${g.title} progress`} /></div>
            <StatusBadge status={g.status} />
          </div>
          <div className="divide-y divide-line">
            {g.initiatives.map((i) => (
              <div key={i.id} className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <Link href={`/initiatives/${i.id}`} className="flex-1 text-[13.5px] font-medium hover:text-brand-deep">↳ {i.title}</Link>
                  <div className="w-32"><ProgressBar value={i.progress} /></div>
                </div>
                <div className="mt-2 grid gap-1 pl-5 sm:grid-cols-2">
                  {i.projects.map((p) => (
                    <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-2 rounded-md px-2 py-1 text-[12.5px] hover:bg-subtle">
                      <HealthBadge health={p.health} /><span className="truncate">{p.name}</span>
                    </Link>
                  ))}
                  {i.projects.length === 0 && <span className="px-2 text-[12px] text-faint">No visible projects</span>}
                </div>
              </div>
            ))}
            {g.initiatives.length === 0 && <p className="px-5 py-3 text-[13px] text-muted">No initiatives yet.</p>}
          </div>
        </Card>
      ))}
      {data.unalignedProjects.length > 0 && (
        <Card><CardBody className="pt-4"><p className="mb-2 text-[13px] font-semibold">Projects not yet aligned to a goal</p><div className="flex flex-wrap gap-2">{data.unalignedProjects.map((p) => <Link key={p.id} href={`/projects/${p.id}`} className="rounded-md border border-line px-2 py-1 text-[12.5px] hover:border-brand">{p.name}</Link>)}</div></CardBody></Card>
      )}
      <p className="text-[12px] text-muted">Goal and initiative progress is the average computed progress of the projects <em>you</em> can see; it is not an organization-wide figure.</p>
    </div>
  );
}

function RoadmapInner() {
  const params = useSearchParams();
  const highlight = params.get("project");
  const [view, setView] = useState<View>((params.get("view") as View) ?? "timeline");
  const [create, setCreate] = useState<{ kind: CreateKind; goalId?: string } | null>(null);
  const { data: me } = useMe();
  const { data, error, isLoading, refetch } = useApi<RoadmapData>("/roadmap");
  void me;
  return (
    <>
      <PageHeader
        title="Roadmaps"
        description="One set of records, five ways to look at it: goals, timeline, board, list and milestones."
        actions={
          <Segmented
            label="Roadmap view"
            value={view}
            onChange={setView}
            options={[
              { value: "timeline", label: "Timeline", icon: <CalendarRange className="h-3.5 w-3.5" aria-hidden /> },
              { value: "kanban", label: "Board", icon: <Columns3 className="h-3.5 w-3.5" aria-hidden /> },
              { value: "list", label: "List", icon: <List className="h-3.5 w-3.5" aria-hidden /> },
              { value: "milestones", label: "Milestones", icon: <Diamond className="h-3.5 w-3.5" aria-hidden /> },
              { value: "goals", label: "Goals", icon: <Network className="h-3.5 w-3.5" aria-hidden /> },
            ]}
          />
        }
      />
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading || !data ? <LoadingCards /> : data.projects.length === 0 && view !== "goals" ? <Card><EmptyState title="No projects yet" /></Card> : (
        <>
          {view === "timeline" && <Timeline data={data} highlight={highlight} />}
          {view === "kanban" && <Kanban projects={data.projects} />}
          {view === "list" && <ProjectTable projects={data.projects} />}
          {view === "milestones" && <MilestoneTracker data={data} />}
          {view === "goals" && <GoalHierarchy onCreate={(kind, goalId) => setCreate({ kind, goalId })} />}
        </>
      )}
      <CreateDialogs kind={create?.kind ?? null} defaults={create?.goalId ? { goalId: create.goalId } : undefined} onClose={() => setCreate(null)} />
    </>
  );
}

export default function RoadmapPage() {
  return <Suspense><RoadmapInner /></Suspense>;
}

"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { BookUser, Building2, CalendarClock, Clock, FolderKanban, Flag, MessageSquare, OctagonAlert, Search, Sparkles, Target, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useApi } from "@/lib/hooks";
import { useUi } from "@/lib/store";
import type { CopilotStatus } from "@/lib/types";
import { Avatar } from "../ui/avatar";

interface SearchResults {
  results: {
    people?: Array<{ id: string; name: string; title: string; avatarHue: number }>;
    teams?: Array<{ id: string; name: string; mission: string | null }>;
    departments?: Array<{ id: string; name: string }>;
    projects?: Array<{ id: string; name: string; key: string; access: string }>;
    goals?: Array<{ id: string; title: string }>;
    initiatives?: Array<{ id: string; title: string }>;
    milestones?: Array<{ id: string; title: string; projectId: string }>;
    updates?: Array<{ id: string; currentFocus: string; author: { name: string } | null }>;
    blockers?: Array<{ id: string; title: string; severity: string }>;
    decisions?: Array<{ id: string; title: string; meetingId: string | null }>;
  };
  total: number;
}

function useDebounced(value: string, ms = 180) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const item = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] data-[selected=true]:bg-brand-soft data-[selected=true]:text-brand-deep";
const group = "px-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint";

function Row({ go, href, label, kind, icon, sub }: { go: (href: string, label: string, kind: string) => void; href: string; label: string; kind: string; icon: ReactNode; sub?: string }) {
  return (
    <Command.Item value={`${kind}-${href}-${label}`} onSelect={() => go(href, label, kind)} className={item}>
      <span className="text-faint">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {sub && <span className="shrink-0 text-[11.5px] text-muted">{sub}</span>}
    </Command.Item>
  );
}

/** Global search. Results are authorized on the server before they are returned. */
export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, recent, pushRecent, markTour, setPendingQuestion } = useUi();
  const { data: copilot } = useApi<CopilotStatus>(paletteOpen ? "/copilot/status" : null, { retry: false, staleTime: 300_000 });
  useEffect(() => {
    if (paletteOpen) markTour("search");
  }, [paletteOpen, markTour]);
  const [q, setQ] = useState("");
  const router = useRouter();
  const debounced = useDebounced(q.trim());
  const { data, isFetching } = useApi<SearchResults>(debounced.length >= 2 ? `/search?q=${encodeURIComponent(debounced)}` : null, { placeholderData: (prev) => prev });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!useUi.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  const go = (href: string, label: string, kind: string) => {
    pushRecent({ href, label, kind });
    setPaletteOpen(false);
    setQ("");
    router.push(href);
  };
  /** Hands the typed text to Ask the Mesh in memory: questions never go into recents or the URL. */
  const askMesh = (question: string) => {
    setPendingQuestion(question.trim() || null);
    setPaletteOpen(false);
    setQ("");
    router.push("/ask");
  };
  const r = debounced.length >= 2 ? data?.results : undefined;
  const ic = (C: typeof Search) => <C className="h-4 w-4" aria-hidden />;

  return (
    <DialogPrimitive.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-950/45 backdrop-blur-[2px] animate-fade-in" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-overlay animate-pop">
          <DialogPrimitive.Title className="sr-only">Search WorkMesh</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search people, teams, projects, goals, updates, blockers and decisions you can access.</DialogPrimitive.Description>
          <Command shouldFilter={false} label="Search WorkMesh">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="h-4 w-4 text-faint" aria-hidden />
              <Command.Input value={q} onValueChange={setQ} placeholder="Search people, teams, projects, goals, decisions…" className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
              {isFetching && <span className="text-[11px] text-faint">Searching…</span>}
            </div>
            <Command.List className="max-h-[420px] overflow-y-auto pb-2">
              {debounced.length < 2 ? (
                <>
                  {recent.length > 0 && (
                    <Command.Group heading="Recent" className={group}>
                      {recent.map((x) => <Row go={go} key={x.href} href={x.href} label={x.label} kind={x.kind} icon={ic(Clock)} sub={x.kind} />)}
                    </Command.Group>
                  )}
                  <Command.Group heading="Jump to" className={group}>
                    {copilot?.enabled && (
                      <Command.Item value="page-ask-the-mesh" onSelect={() => askMesh("")} className={item}>
                        <span className="text-faint">{ic(Sparkles)}</span>
                        <span className="min-w-0 flex-1 truncate">Ask the Mesh</span>
                        <span className="shrink-0 text-[11.5px] text-muted">AI copilot</span>
                      </Command.Item>
                    )}
                    <Row go={go} href="/map" label="Company Map" kind="Page" icon={ic(Building2)} />
                    <Row go={go} href="/roadmap" label="Roadmaps" kind="Page" icon={ic(Target)} />
                    <Row go={go} href="/directory" label="Directory" kind="Page" icon={ic(BookUser)} />
                    <Row go={go} href="/meetings" label="Meetings" kind="Page" icon={ic(CalendarClock)} />
                  </Command.Group>
                </>
              ) : (
                <>
                  <Command.Empty className="py-10 text-center text-[13px] text-muted">No results you have access to.</Command.Empty>
                  {/* With the Ask row present cmdk never shows Empty, so say it ourselves once the search has answered. */}
                  {copilot?.enabled && data && !isFetching && data.total === 0 && <p className="px-4 pb-2 pt-6 text-center text-[13px] text-muted">No results you have access to.</p>}
                  {!!r?.people?.length && (
                    <Command.Group heading="People" className={group}>
                      {r.people.map((p) => (
                        <Command.Item key={p.id} value={`p-${p.id}`} onSelect={() => go(`/people/${p.id}`, p.name, "Person")} className={item}>
                          <Avatar name={p.name} hue={p.avatarHue} size="xs" />
                          <span className="flex-1 truncate">{p.name}</span>
                          <span className="text-[11.5px] text-muted">{p.title}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                  {!!r?.teams?.length && <Command.Group heading="Teams" className={group}>{r.teams.map((t) => <Row go={go} key={t.id} href={`/teams/${t.id}`} label={t.name} kind="Team" icon={ic(Users)} />)}</Command.Group>}
                  {!!r?.departments?.length && <Command.Group heading="Departments" className={group}>{r.departments.map((d) => <Row go={go} key={d.id} href={`/departments/${d.id}`} label={d.name} kind="Department" icon={ic(Building2)} />)}</Command.Group>}
                  {!!r?.projects?.length && <Command.Group heading="Projects" className={group}>{r.projects.map((p) => <Row go={go} key={p.id} href={`/projects/${p.id}`} label={p.name} kind="Project" icon={ic(FolderKanban)} sub={p.access === "summary" ? "Summary" : p.key} />)}</Command.Group>}
                  {!!r?.goals?.length && <Command.Group heading="Goals" className={group}>{r.goals.map((g) => <Row go={go} key={g.id} href={`/goals/${g.id}`} label={g.title} kind="Goal" icon={ic(Target)} />)}</Command.Group>}
                  {!!r?.initiatives?.length && <Command.Group heading="Initiatives" className={group}>{r.initiatives.map((g) => <Row go={go} key={g.id} href={`/initiatives/${g.id}`} label={g.title} kind="Initiative" icon={ic(Flag)} />)}</Command.Group>}
                  {!!r?.milestones?.length && <Command.Group heading="Milestones" className={group}>{r.milestones.map((m) => <Row go={go} key={m.id} href={`/milestones/${m.id}`} label={m.title} kind="Milestone" icon={ic(Flag)} />)}</Command.Group>}
                  {!!r?.updates?.length && <Command.Group heading="Updates" className={group}>{r.updates.map((u) => <Row go={go} key={u.id} href={`/updates/${u.id}`} label={u.currentFocus} kind="Update" icon={ic(MessageSquare)} sub={u.author?.name} />)}</Command.Group>}
                  {!!r?.blockers?.length && <Command.Group heading="Blockers" className={group}>{r.blockers.map((b) => <Row go={go} key={b.id} href={`/blockers/${b.id}`} label={b.title} kind="Blocker" icon={ic(OctagonAlert)} />)}</Command.Group>}
                  {!!r?.decisions?.length && <Command.Group heading="Decisions" className={group}>{r.decisions.map((d) => <Row go={go} key={d.id} href={d.meetingId ? `/meetings/${d.meetingId}` : "/decisions"} label={d.title} kind="Decision" icon={ic(Flag)} />)}</Command.Group>}
                  {copilot?.enabled && (
                    <Command.Group heading="Ask the Mesh" className={group}>
                      <Command.Item value="ask-the-mesh-question" onSelect={() => askMesh(q)} className={item}>
                        <span className="text-faint">{ic(Sparkles)}</span>
                        <span className="min-w-0 flex-1 truncate">Ask the Mesh: “{q.trim()}”</span>
                        <span className="shrink-0 text-[11.5px] text-muted">AI answer</span>
                      </Command.Item>
                    </Command.Group>
                  )}
                </>
              )}
            </Command.List>
            <div className="flex items-center justify-between border-t border-line bg-subtle/50 px-4 py-2 text-[11.5px] text-muted">
              <span>↑↓ to navigate · ↵ to open · esc to close</span>
              <button className="font-medium text-brand" onClick={() => go(`/search?q=${encodeURIComponent(q)}`, `Search “${q}”`, "Search")} disabled={q.trim().length < 2}>All results</button>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

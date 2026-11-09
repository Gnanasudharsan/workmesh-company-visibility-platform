"use client";

import { label } from "@workmesh/core";
import { ArrowDownRight, ArrowUpRight, Diamond, ExternalLink, GitFork, Target, X } from "lucide-react";
import Link from "next/link";
import type { Graph, GraphNode, PersonLite } from "@/lib/types";
import { day } from "@/lib/utils";
import { Avatar, PersonChip } from "../ui/avatar";
import { AccessBadge, Badge, HealthBadge, StatusBadge } from "../ui/badges";
import { Button, ButtonLink } from "../ui/button";
import { ProgressBar, healthTone } from "../ui/feedback";

export function MapPanel({ node, graph, mode, onClose, onFocusSubtree, onExpandProject, expandedProjects, onSelect }: {
  node: GraphNode | null;
  graph?: Graph;
  mode: "people" | "work";
  onClose: () => void;
  onFocusSubtree: (memberId: string) => void;
  onExpandProject: (projectId: string) => void;
  expandedProjects: string[];
  onSelect: (n: GraphNode) => void;
}) {
  if (!node) return null;
  const d = node.data;
  const id = String(d.entityId ?? "");
  const byId = new Map((graph?.nodes ?? []).map((n) => [n.id, n]));
  const deps = (graph?.edges ?? []).filter((e) => e.type === "depends_on" && (e.source === node.id || e.target === node.id));
  const upstream = deps.filter((e) => e.target === node.id).map((e) => ({ e, n: byId.get(e.source) })).filter((x) => x.n);
  const downstream = deps.filter((e) => e.source === node.id).map((e) => ({ e, n: byId.get(e.target) })).filter((x) => x.n);

  return (
    <aside className="absolute right-3 top-3 z-10 flex max-h-[calc(100%-24px)] w-[min(340px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-overlay animate-slide-in" aria-label={`${label(node.type)} details`}>
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">{label(node.type)}</p>
          <h2 className="mt-0.5 truncate text-[14.5px] font-semibold">{node.label}</h2>
        </div>
        <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-subtle hover:text-ink" aria-label="Close details"><X className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-[13px]">
        {node.type === "person" && (
          <>
            <div className="flex items-center gap-3">
              <Avatar name={node.label} hue={Number(d.avatarHue)} size="lg" />
              <div>
                <p className="font-medium">{String(d.title)}</p>
                <p className="text-muted">{(d.teams as Array<{ name: string; role: string }>).map((t) => `${t.name}${t.role === "LEAD" ? " (lead)" : ""}`).join(", ") || "No team"}</p>
              </div>
            </div>
            {Number(d.directReports) > 0 && <p className="text-muted">Manages {String(d.directReports)} direct report{Number(d.directReports) > 1 ? "s" : ""}.</p>}
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/people/${id}`} size="sm" variant="primary">Open profile</ButtonLink>
              <Button size="sm" onClick={() => onFocusSubtree(id)}><GitFork className="h-3.5 w-3.5" /> {Number(d.directReports) > 0 ? "Reporting subtree" : "Management chain"}</Button>
            </div>
          </>
        )}
        {node.type === "team" && (
          <>
            {d.mission ? <p className="text-ink-soft">{String(d.mission)}</p> : null}
            {d.lead ? <div><p className="mb-1 text-[11.5px] font-medium text-muted">Team lead</p><PersonChip person={d.lead as PersonLite} /></div> : null}
            <p className="text-muted">{String(d.memberCount)} members · {d.expanded ? "shown on the map" : "click the team to expand"}</p>
            <ButtonLink href={`/teams/${id}`} size="sm" variant="primary">Team profile & responsibilities</ButtonLink>
          </>
        )}
        {node.type === "department" && (
          <>
            {d.head ? <div><p className="mb-1 text-[11.5px] font-medium text-muted">Department head</p><PersonChip person={d.head as PersonLite} /></div> : null}
            <p className="text-muted">{String(d.teamCount)} teams · {String(d.memberCount)} people</p>
            <ButtonLink href={`/departments/${id}`} size="sm" variant="primary">Open department</ButtonLink>
          </>
        )}
        {node.type === "company" && <p className="text-muted">{String(d.memberCount)} people across {String(d.departmentCount)} departments.</p>}
        {(node.type === "goal" || node.type === "initiative") && (
          <>
            <div className="flex items-center gap-2"><StatusBadge status={String(d.status)} />{d.period ? <Badge>{String(d.period)}</Badge> : null}</div>
            <div><p className="mb-1 text-[11.5px] font-medium text-muted">Average computed progress of projects you can see</p><ProgressBar value={d.progress as number | null} /></div>
            <p className="text-muted">{String(d.projectCount)} projects{Number(d.atRisk) > 0 ? ` · ${String(d.atRisk)} need attention` : ""}</p>
            {d.owner ? <div><p className="mb-1 text-[11.5px] font-medium text-muted">Owner</p><PersonChip person={d.owner as PersonLite} /></div> : null}
            <ButtonLink href={`/${node.type === "goal" ? "goals" : "initiatives"}/${id}`} size="sm" variant="primary"><Target className="h-3.5 w-3.5" /> Open {node.type}</ButtonLink>
          </>
        )}
        {node.type === "project" && (
          <>
            <div className="flex flex-wrap items-center gap-1.5"><HealthBadge health={String(d.health)} /><StatusBadge status={String(d.status)} /><AccessBadge access={d.access as "summary" | "details"} /></div>
            <div><p className="mb-1 text-[11.5px] font-medium text-muted">Computed progress</p><ProgressBar value={d.computedProgress as number | null} tone={healthTone(String(d.health))} /></div>
            <dl className="grid grid-cols-2 gap-2 text-[12.5px]">
              <div><dt className="text-muted">Team</dt><dd className="font-medium">{(d.team as { name: string } | null)?.name ?? "—"}</dd></div>
              <div><dt className="text-muted">Target</dt><dd className="font-medium">{day(d.targetDate as string | null, true)}</dd></div>
            </dl>
            {d.lead ? <div><p className="mb-1 text-[11.5px] font-medium text-muted">Lead</p><PersonChip person={d.lead as PersonLite} /></div> : null}
            {(upstream.length > 0 || downstream.length > 0) && (
              <div className="space-y-2">
                <p className="text-[11.5px] font-medium text-muted">Dependencies (follow to explore)</p>
                {upstream.map(({ e, n }) => (
                  <button key={e.id} onClick={() => onSelect(n!)} className="flex w-full items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left hover:border-brand">
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted" aria-hidden /><span className="flex-1 truncate">Waits on <strong className="font-medium">{n!.label}</strong></span><StatusBadge status={String(e.data?.state ?? "OPEN")} />
                  </button>
                ))}
                {downstream.map(({ e, n }) => (
                  <button key={e.id} onClick={() => onSelect(n!)} className="flex w-full items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-left hover:border-brand">
                    <ArrowDownRight className="h-3.5 w-3.5 text-muted" aria-hidden /><span className="flex-1 truncate"><strong className="font-medium">{n!.label}</strong> waits on this</span><StatusBadge status={String(e.data?.state ?? "OPEN")} />
                  </button>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/projects/${id}`} size="sm" variant="primary">Open project</ButtonLink>
              <ButtonLink href={`/roadmap?project=${id}`} size="sm">Roadmap</ButtonLink>
              {d.access === "details" && mode === "work" && <Button size="sm" onClick={() => onExpandProject(id)}><Diamond className="h-3.5 w-3.5" /> {expandedProjects.includes(id) ? "Hide" : "Show"} milestones</Button>}
              <ButtonLink href={`/dependencies?projectId=${id}`} size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5" /> Dependency chain</ButtonLink>
            </div>
          </>
        )}
        {node.type === "milestone" && (
          <>
            <div className="flex items-center gap-2"><StatusBadge status={String(d.status)} />{d.isCritical ? <Badge tone="danger">Critical</Badge> : null}</div>
            <p className="text-muted">Due {day(d.dueDate as string | null, true)}</p>
            <ButtonLink href={`/milestones/${id}`} size="sm" variant="primary">Open milestone</ButtonLink>
          </>
        )}
      </div>
    </aside>
  );
}

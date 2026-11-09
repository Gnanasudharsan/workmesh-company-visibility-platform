"use client";

import { label, PROJECT_STATUSES } from "@workmesh/core";
import { Download, FolderPlus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, Stat } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Input, Segmented, Select } from "@/components/ui/form";
import { ProjectRow } from "@/components/work/cards";
import { CreateDialogs } from "@/components/work/create-dialogs";
import { TeamSelect } from "@/components/work/pickers";
import { download } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { toast } from "@/lib/toast";
import type { ProjectSummary } from "@/lib/types";

function ProjectsInner() {
  const params = useSearchParams();
  const [scope, setScope] = useState<"all" | "mine">(params.get("mine") === "true" ? "mine" : "all");
  const [status, setStatus] = useState("");
  const [team, setTeam] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading, refetch } = useApi<ProjectSummary[]>(`/projects?mine=${scope === "mine"}${status ? `&status=${status}` : ""}${team ? `&teamId=${team}` : ""}`);
  const list = useMemo(() => (data ?? []).filter((p) => !q || `${p.name} ${p.key} ${p.owningTeam?.name ?? ""}`.toLowerCase().includes(q.toLowerCase())), [data, q]);
  const count = (h: string[]) => (data ?? []).filter((p) => h.includes(p.health)).length;

  return (
    <>
      <PageHeader
        title="Projects"
        description="Every project you can see. Summary-only projects show their public status without details."
        actions={
          <>
            <Button onClick={() => download("/projects/export.csv", "workmesh-projects.csv").catch((e) => toast.error(e.message))}><Download className="h-4 w-4" /> Export CSV</Button>
            <Button variant="primary" onClick={() => setCreating(true)}><FolderPlus className="h-4 w-4" /> New project</Button>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Visible projects" value={data?.length ?? "—"} />
        <Stat label="On track" value={count(["ON_TRACK"])} tone="success" />
        <Stat label="At risk / off track" value={count(["AT_RISK", "OFF_TRACK"])} tone="warning" />
        <Stat label="Blocked" value={count(["BLOCKED"])} tone="danger" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Scope" value={scope} onChange={setScope} options={[{ value: "all", label: "All visible" }, { value: "mine", label: "My projects" }]} />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, key or team" className="w-full sm:w-64" aria-label="Filter projects" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Status"><option value="">Any status</option>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select>
        <TeamSelect value={team} onChange={(e) => setTeam(e.target.value)} className="w-auto" placeholder="Any team" aria-label="Team" />
      </div>
      {error ? <ErrorState error={error} onRetry={refetch} /> : isLoading ? <LoadingCards /> : (
        <Card className="p-2">
          <div className="hidden grid-cols-[minmax(0,1fr)_120px_140px_auto] gap-3 px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-faint sm:grid">
            <span>Project</span><span>Computed progress</span><span className="text-right">Health</span><span className="text-right">Status</span>
          </div>
          {list.length === 0 ? <EmptyState title="No projects match" description="Try clearing the filters." /> : list.map((p) => <ProjectRow key={p.id} p={p} />)}
        </Card>
      )}
      <p className="mt-3 text-[12px] text-muted">Computed progress is the weighted share of completed milestones (critical milestones count double), or completed work items when a project has no milestones. Owner-reported estimates are shown separately on each project.</p>
      <CreateDialogs kind={creating ? "project" : null} onClose={() => setCreating(false)} />
    </>
  );
}

export default function ProjectsPage() {
  return <Suspense><ProjectsInner /></Suspense>;
}

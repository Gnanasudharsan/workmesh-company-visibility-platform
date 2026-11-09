"use client";

import { label, type BlockerState } from "@workmesh/core";
import { CircleCheck, OctagonAlert, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PersonChip } from "@/components/ui/avatar";
import { SeverityBadge, StatusBadge, VisibilityBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Field, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { Comments } from "@/components/work/comments";
import { nn, PersonSelect } from "@/components/work/pickers";
import { api, useAction, useApi } from "@/lib/hooks";
import type { Blocker, Comment, PersonLite } from "@/lib/types";
import { cn, day, relative } from "@/lib/utils";

interface BlockerDetail extends Blocker {
  events: Array<{ id: string; fromState: string | null; toState: string | null; note: string | null; createdAt: string; actor: PersonLite | null; fromOwner: PersonLite | null; toOwner: PersonLite | null }>;
  comments: Comment[];
}

export default function BlockerPage() {
  const { id } = useParams<{ id: string }>();
  const { data: b, error, isLoading, refetch } = useApi<BlockerDetail>(`/blockers/${id}`);
  const [owner, setOwner] = useState("");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const inv = ["/blockers", "/dashboard", "/projects", "/dependencies", "/meetings"];
  const assign = useAction(() => api.post(`/blockers/${id}/assign`, { ownerId: nn(owner), version: b!.version }), { success: "Owner assigned — they've been notified", invalidate: inv, onSuccess: () => setOwner("") });
  const move = useAction((state: BlockerState) => api.post(`/blockers/${id}/transition`, { state, version: b!.version, resolutionNotes: state === "RESOLVED" ? notes : undefined }), { success: (r) => (r ? "Blocker updated" : "Updated"), invalidate: inv, onSuccess: () => setResolveOpen(false) });
  const comment = useAction((body: string) => api.post(`/blockers/${id}/comments`, { body }), { success: "Comment added", invalidate: ["/blockers"] });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !b) return <LoadingCards />;
  return (
    <>
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><OctagonAlert className="h-3.5 w-3.5" aria-hidden /> Blocker{b.project ? <> · <Link href={`/projects/${b.project.id}?tab=blockers`} className="normal-case tracking-normal text-brand">{b.project.name}</Link></> : null}</span>}
        title={b.title}
        actions={<><SeverityBadge severity={b.severity} /><StatusBadge status={b.state} /><VisibilityBadge visibility={b.visibility} /></>}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card>
            <CardBody className="pt-4 text-[13.5px]">
              <p className="whitespace-pre-line text-slate-700">{b.description || "No description."}</p>
              {b.resolutionNotes && <p className="mt-4 rounded-lg bg-success-soft px-3 py-2 text-green-900"><strong className="font-medium">Resolution:</strong> {b.resolutionNotes}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Timeline" description="Every state and owner change is recorded." />
            <CardBody>
              <ol className="relative space-y-4 border-l border-line pl-5">
                {b.events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className={cn("absolute -left-[26px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-surface", e.toState === "RESOLVED" ? "bg-success" : e.toState === "OPEN" || e.toState === "REOPENED" ? "bg-warning" : "bg-brand")} aria-hidden />
                    <p className="text-[13px]"><span className="font-medium">{e.actor?.name ?? "Someone"}</span> {e.fromState ? <>moved it from <strong className="font-medium">{label(e.fromState)}</strong> to <strong className="font-medium">{label(e.toState ?? "")}</strong></> : <>reported it</>}{e.toOwner && e.toOwner.id !== e.fromOwner?.id ? <> and assigned <strong className="font-medium">{e.toOwner.name}</strong></> : null}</p>
                    {e.note && e.note !== "Reported" && <p className="mt-0.5 text-[12.5px] text-slate-600">“{e.note}”</p>}
                    <p className="text-[11.5px] text-muted">{relative(e.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
          <Comments comments={b.comments} onSubmit={(body) => comment.mutate(body)} pending={comment.isPending} />
        </div>
        <aside className="space-y-4">
          <Card>
            <CardBody className="space-y-3 pt-4 text-[13px]">
              <div><p className="mb-1 text-[12px] text-muted">Reported by</p><PersonChip person={b.reporter} /></div>
              <div><p className="mb-1 text-[12px] text-muted">Owner</p>{b.owner ? <PersonChip person={b.owner} /> : <p className="font-medium text-warning">Nobody yet</p>}</div>
              <div className="grid grid-cols-2 gap-2"><div><p className="text-[12px] text-muted">Open for</p><p className="font-medium">{b.ageDays} day{b.ageDays === 1 ? "" : "s"}</p></div><div><p className="text-[12px] text-muted">Needed by</p><p className="font-medium">{day(b.targetDate)}</p></div></div>
            </CardBody>
          </Card>
          {b.canManage ? (
            <Card>
              <CardHeader title="Take action" />
              <CardBody className="space-y-4">
                {b.state !== "RESOLVED" && (
                  <div className="space-y-2">
                    <PersonSelect value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Choose an owner…" aria-label="New owner" />
                    <Button className="w-full" disabled={!owner} loading={assign.isPending} onClick={() => assign.mutate(undefined)}><UserRoundCheck className="h-4 w-4" /> Assign owner</Button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {b.allowedTransitions.filter((s) => s !== "RESOLVED").map((s) => <Button key={s} size="sm" variant="soft" loading={move.isPending && move.variables === s} onClick={() => move.mutate(s)}>→ {label(s)}</Button>)}
                  {b.allowedTransitions.includes("RESOLVED") && <Button size="sm" variant="primary" onClick={() => setResolveOpen(true)}><CircleCheck className="h-3.5 w-3.5" /> Resolve</Button>}
                </div>
              </CardBody>
            </Card>
          ) : <p className="px-1 text-[12.5px] text-muted">Only the reporter, owner, their managers or the project lead can change this blocker.</p>}
        </aside>
      </div>
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen} title="Resolve blocker" footer={<><Button variant="ghost" onClick={() => setResolveOpen(false)}>Cancel</Button><Button variant="primary" disabled={!notes.trim()} loading={move.isPending} onClick={() => move.mutate("RESOLVED")}>Resolve</Button></>}>
        <Field label="How was it resolved?" htmlFor="res-notes" hint="Linked work moves back to In progress automatically."><Textarea id="res-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} autoFocus /></Field>
      </Dialog>
    </>
  );
}

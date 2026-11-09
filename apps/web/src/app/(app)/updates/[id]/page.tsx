"use client";

import { label, UPDATE_STAGES, UPDATE_VISIBILITIES } from "@workmesh/core";
import { History, Trash2 } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PersonChip } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorState, LoadingCards } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { UpdateCard } from "@/components/work/cards";
import { Comments } from "@/components/work/comments";
import { api, useAction, useApi } from "@/lib/hooks";
import type { Comment, PersonLite, Update } from "@/lib/types";
import { relative } from "@/lib/utils";

interface UpdateDetail extends Update {
  acknowledgedBy: PersonLite[];
  revisions: Array<{ id: string; createdAt: string; snapshot: Record<string, string | null> }>;
  comments: Comment[];
}

function UpdateInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { data: u, error, isLoading, refetch } = useApi<UpdateDetail>(`/updates/${id}`);
  const [editing, setEditing] = useState(params.get("edit") === "1");
  const comment = useAction((body: string) => api.post(`/updates/${id}/comments`, { body }), { success: "Comment added", invalidate: ["/updates"] });
  const publish = useAction(() => api.post(`/updates/${id}/publish`), { success: "Update published", invalidate: ["/updates", "/dashboard"] });
  const del = useAction(() => api.del(`/updates/${id}`), { success: "Draft deleted", invalidate: ["/updates", "/dashboard"], onSuccess: () => router.push("/my-work?tab=updates") });
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (isLoading || !u) return <LoadingCards />;
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {u.status === "DRAFT" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line-strong bg-surface px-4 py-3 text-[13px]">
          <span>This is a private draft. Only you can see it.</span>
          <span className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => confirm("Delete this draft?") && del.mutate(undefined)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
            <Button size="sm" variant="primary" disabled={u.visibility === "PRIVATE"} title={u.visibility === "PRIVATE" ? "Choose an audience first" : undefined} loading={publish.isPending} onClick={() => publish.mutate(undefined)}>Publish</Button>
          </span>
        </div>
      )}
      {editing && u.isMine ? <EditUpdate u={u} onDone={() => setEditing(false)} /> : <UpdateCard u={u} />}
      {u.isMine && !editing && <Button size="sm" onClick={() => setEditing(true)}>Edit update</Button>}
      {u.acknowledgedBy.length > 0 && <p className="text-[12.5px] text-muted">Acknowledged by {u.acknowledgedBy.map((p) => p.name).join(", ")}</p>}
      {u.revisions.length > 0 && (
        <Card>
          <CardHeader icon={<History className="h-4 w-4" />} title="Edit history" description="Previously published versions are kept for transparency." />
          <CardBody className="space-y-3">
            {u.revisions.map((r) => (
              <div key={r.id} className="rounded-lg border border-line p-3 text-[13px]">
                <p className="mb-1 text-[11.5px] text-muted">Version replaced {relative(r.createdAt)}</p>
                <p className="font-medium">{r.snapshot.currentFocus}</p>
                {r.snapshot.nextSteps && <p className="text-slate-600">Next: {r.snapshot.nextSteps}</p>}
              </div>
            ))}
          </CardBody>
        </Card>
      )}
      {u.status === "PUBLISHED" && <Comments comments={u.comments} onSubmit={(b) => comment.mutate(b)} pending={comment.isPending} />}
    </div>
  );
}

function EditUpdate({ u, onDone }: { u: UpdateDetail; onDone: () => void }) {
  const [v, setV] = useState({ stage: u.stage, currentFocus: u.currentFocus, completed: u.completed ?? "", nextSteps: u.nextSteps ?? "", helpNeeded: u.helpNeeded ?? "", visibility: u.visibility });
  const save = useAction(() => api.patch(`/updates/${u.id}`, { ...v, completed: v.completed || null, nextSteps: v.nextSteps || null, helpNeeded: v.helpNeeded || null, version: u.version }), { success: "Update saved", invalidate: ["/updates", "/dashboard"], onSuccess: onDone });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Card>
      <CardHeader title="Edit update" description={u.status === "PUBLISHED" ? "The previous version is kept in the edit history." : undefined} />
      <CardBody className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Stage" htmlFor="eu-stage"><Select id="eu-stage" value={v.stage} onChange={set("stage")}>{UPDATE_STAGES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
          <Field label="Who can see this" htmlFor="eu-vis"><Select id="eu-vis" value={v.visibility} onChange={set("visibility")}>{UPDATE_VISIBILITIES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
        </div>
        <Field label="Working on" htmlFor="eu-focus"><Input id="eu-focus" value={v.currentFocus} onChange={set("currentFocus")} /></Field>
        <Field label="Completed" htmlFor="eu-done"><Textarea id="eu-done" rows={2} value={v.completed} onChange={set("completed")} /></Field>
        <Field label="Next steps" htmlFor="eu-next"><Input id="eu-next" value={v.nextSteps} onChange={set("nextSteps")} /></Field>
        <Field label="Help needed" htmlFor="eu-help"><Input id="eu-help" value={v.helpNeeded} onChange={set("helpNeeded")} /></Field>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onDone}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></div>
      </CardBody>
    </Card>
  );
}

export default function UpdatePage() {
  return <Suspense><UpdateInner /></Suspense>;
}

"use client";

import { UPDATE_STAGES, UPDATE_VISIBILITIES, label } from "@workmesh/core";
import { ChevronDown, Lock, OctagonAlert, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { api, useAction } from "@/lib/hooks";
import { useUi } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Field, Input, Select, Textarea } from "../ui/form";
import { Dialog } from "../ui/overlay";
import { MilestoneSelect, nn, PersonSelect, ProjectSelect } from "./pickers";

interface FormValues {
  projectId: string;
  milestoneId: string;
  stage: string;
  currentFocus: string;
  completed: string;
  nextSteps: string;
  helpNeeded: string;
  helpFromId: string;
  confidence: string;
  visibility: string;
  blockerTitle: string;
  blockerSeverity: string;
}

const AUDIENCE_HINT: Record<string, string> = {
  PRIVATE: "Only you. Use this for notes you're not ready to share.",
  MANAGER: "You and the people in your management chain.",
  PROJECT: "Project members plus your management chain.",
  TEAM: "Your teammates plus your management chain.",
  ORG: "Everyone at the company who can see the linked project.",
};

/** The fast path: a useful update in under a minute. Detailed fields are one click away. */
export function UpdateComposer() {
  const { composer, closeComposer } = useUi();
  const router = useRouter();
  const [detailed, setDetailed] = useState(false);
  const [withBlocker, setWithBlocker] = useState(false);
  const { register, handleSubmit, watch, reset, formState } = useForm<FormValues>({
    defaultValues: { stage: "DEVELOPMENT", visibility: "MANAGER", blockerSeverity: "MEDIUM", confidence: "" },
  });
  useEffect(() => {
    if (composer.open) {
      reset({ projectId: composer.projectId ?? "", milestoneId: composer.milestoneId ?? "", stage: "DEVELOPMENT", visibility: composer.projectId ? "PROJECT" : "MANAGER", blockerSeverity: "MEDIUM", currentFocus: "", completed: "", nextSteps: "", helpNeeded: "", helpFromId: "", confidence: "", blockerTitle: "" });
      setDetailed(false);
      setWithBlocker(false);
    }
  }, [composer.open, composer.projectId, composer.milestoneId, reset]);

  const projectId = watch("projectId");
  const visibility = watch("visibility");
  const save = useAction(
    async ({ v, publish }: { v: FormValues; publish: boolean }) =>
      api.post<{ update: { id: string } }>("/updates", {
        projectId: nn(v.projectId),
        milestoneId: nn(v.milestoneId),
        workItemId: composer.workItemId ?? null,
        stage: withBlocker ? "BLOCKED" : v.stage,
        currentFocus: v.currentFocus,
        completed: nn(v.completed),
        nextSteps: nn(v.nextSteps),
        helpNeeded: nn(v.helpNeeded),
        helpFromId: nn(v.helpFromId),
        confidence: v.confidence ? Number(v.confidence) : null,
        visibility: v.visibility,
        publish,
        blocker: withBlocker && v.blockerTitle ? { title: v.blockerTitle, severity: v.blockerSeverity } : undefined,
      }),
    {
      success: (r) => (r ? "Update saved" : "Saved"),
      invalidate: ["/updates", "/dashboard", "/blockers", "/projects"],
      onSuccess: (r, vars) => {
        closeComposer();
        if (!vars.publish) router.push("/my-work?tab=updates");
        void r;
      },
    },
  );
  const submit = (publish: boolean) => handleSubmit((v) => save.mutate({ v, publish }));

  return (
    <Dialog
      open={composer.open}
      onOpenChange={(o) => !o && closeComposer()}
      title={<span className="flex items-center gap-2"><Zap className="h-4 w-4 text-brand" aria-hidden /> Share a progress update</span>}
      description="What you're on, what's next, and whether anything is in your way."
      footer={
        <>
          <span className="mr-auto flex items-center gap-1.5 text-[12px] text-muted">
            <Lock className="h-3 w-3" aria-hidden /> {AUDIENCE_HINT[visibility] ?? ""}
          </span>
          <Button variant="ghost" onClick={submit(false)} disabled={save.isPending}>Save draft</Button>
          <Button variant="primary" onClick={submit(true)} loading={save.isPending} disabled={visibility === "PRIVATE"} title={visibility === "PRIVATE" ? "Private updates stay as drafts" : undefined}>
            Publish update
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit(true)}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Project" htmlFor="u-project">
            <ProjectSelect id="u-project" {...register("projectId")} placeholder="Not tied to a project" />
          </Field>
          <Field label="Current stage" htmlFor="u-stage">
            <Select id="u-stage" {...register("stage")} disabled={withBlocker}>
              {UPDATE_STAGES.map((s) => (
                <option key={s} value={s}>{label(s)}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="What are you working on?" htmlFor="u-focus" required error={formState.errors.currentFocus ? "Tell your team what you're focused on" : undefined}>
          <Input id="u-focus" placeholder="e.g. Webhook signature verification" {...register("currentFocus", { required: true, minLength: 2 })} autoFocus />
        </Field>
        <Field label="Next step" htmlFor="u-next">
          <Input id="u-next" placeholder="What happens next?" {...register("nextSteps")} />
        </Field>

        <button type="button" onClick={() => setWithBlocker((b) => !b)} className={cn("flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors", withBlocker ? "border-danger/25 bg-danger-soft text-danger-ink" : "border-dashed border-line text-muted hover:text-ink")} aria-pressed={withBlocker}>
          <OctagonAlert className="h-4 w-4" aria-hidden /> {withBlocker ? "I'm blocked — this will create a tracked blocker" : "I'm blocked on something"}
        </button>
        {withBlocker && (
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-danger/15 bg-danger-soft/50 p-3 sm:grid-cols-[1fr_140px]">
            <Field label="What's blocking you?" htmlFor="u-blocker">
              <Input id="u-blocker" placeholder="e.g. Waiting on sandbox credentials" {...register("blockerTitle", { required: withBlocker })} />
            </Field>
            <Field label="Severity" htmlFor="u-sev">
              <Select id="u-sev" {...register("blockerSeverity")}>
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                  <option key={s} value={s}>{label(s)}</option>
                ))}
              </Select>
            </Field>
          </div>
        )}

        <button type="button" onClick={() => setDetailed((d) => !d)} className="flex items-center gap-1 text-[12.5px] font-medium text-brand" aria-expanded={detailed}>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", detailed && "rotate-180")} aria-hidden /> {detailed ? "Fewer fields" : "Detailed update"}
        </button>
        {detailed && (
          <div className="space-y-3 animate-fade-in">
            <Field label="Completed recently" htmlFor="u-done">
              <Textarea id="u-done" rows={2} placeholder="Meaningful outcomes, not activity" {...register("completed")} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Milestone" htmlFor="u-ms">
                <MilestoneSelect id="u-ms" projectId={projectId || undefined} {...register("milestoneId")} />
              </Field>
              <Field label="Confidence in next milestone" htmlFor="u-conf" hint="Optional and self-reported">
                <Select id="u-conf" {...register("confidence")}>
                  <option value="">Not specified</option>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n} — {["Very low", "Low", "Okay", "Good", "Very high"][n - 1]}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Help needed" htmlFor="u-help">
                <Input id="u-help" placeholder="What support would unblock you?" {...register("helpNeeded")} />
              </Field>
              <Field label="From whom?" htmlFor="u-helpfrom">
                <PersonSelect id="u-helpfrom" placeholder="Anyone" {...register("helpFromId")} />
              </Field>
            </div>
          </div>
        )}
        <Field label="Who can see this" htmlFor="u-vis">
          <Select id="u-vis" {...register("visibility")}>
            {UPDATE_VISIBILITIES.map((v) => (
              <option key={v} value={v}>{label(v)}</option>
            ))}
          </Select>
        </Field>
      </form>
    </Dialog>
  );
}

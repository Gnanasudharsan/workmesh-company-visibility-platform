"use client";

import { useMutation } from "@tanstack/react-query";
import type { Workspace } from "@workmesh/core";
import { AlertCircle, ArrowUp, RefreshCw, SearchX, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { api, ApiError } from "@/lib/api";
import { useApi, useMe } from "@/lib/hooks";
import { useUi } from "@/lib/store";
import type { CopilotAnswer, CopilotStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AnswerText, CitationChips } from "./answer";

/** Exactly the server's not-found answer; shown with a gentle hint, never a reason. */
export const STANDARD_ANSWER = "I couldn't find anything about that in WorkMesh.";
const MAX = 500;

interface Turn {
  id: string;
  question: string;
  state: "loading" | "done" | "error";
  result?: CopilotAnswer;
  error?: ApiError;
}

export function errorMessage(err: ApiError | undefined): string {
  if (!err) return "Something went wrong.";
  if (err.status === 429) return "You've asked a lot of questions in the last minute. Wait a moment and try again.";
  if (err.status === 404) return "Ask the Mesh isn't turned on in this WorkMesh.";
  return err.message || "Something went wrong.";
}

const ORDER: Workspace[] = ["employee", "manager", "lead", "leadership", "admin"];

/** Suggestions for the active workspace first, then the others the server granted. */
export function pickSuggestions(status: CopilotStatus | undefined, workspace: Workspace): string[] {
  if (!status) return [];
  const order = [workspace, ...ORDER.filter((w) => w !== workspace)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of order) for (const q of status.suggestions?.[w] ?? []) if (!seen.has(q) && out.length < 4) (seen.add(q), out.push(q));
  return out;
}

function Suggestions({ items, onPick, disabled }: { items: string[]; onPick: (q: string) => void; disabled: boolean }) {
  if (!items.length) return null;
  return (
    // One swipeable row on phones so the sticky composer stays short; wrapped from `sm` up.
    <div role="group" aria-label="Suggested questions" className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      {items.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          disabled={disabled}
          className="shrink-0 whitespace-nowrap rounded-full border border-line bg-surface px-3 py-1.5 text-left text-[12.5px] text-ink-soft shadow-card transition-[border-color,color] duration-[var(--duration-fast)] hover:border-teal/40 hover:text-ink disabled:opacity-50 sm:max-w-full sm:shrink sm:truncate"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

function TurnView({ turn, onRetry }: { turn: Turn; onRetry: (q: string) => void }) {
  const prefix = `t${turn.id}`;
  return (
    <article aria-labelledby={`${prefix}-q`} className="animate-rise">
      <div className="mb-2 flex justify-end">
        <p id={`${prefix}-q`} className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-navy-950 px-4 py-2.5 text-[13.5px] text-white shadow-card">
          <span className="sr-only">You asked: </span>
          {turn.question}
        </p>
      </div>
      <Card className="p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-teal-ink">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Ask the Mesh
        </div>
        {turn.state === "loading" && (
          <div role="status" aria-label="Looking through WorkMesh">
            <p className="mb-3 text-[13px] text-muted">Looking through WorkMesh…</p>
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="mt-2 h-3 w-4/5" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        )}
        {turn.state === "error" && (
          <div role="alert" className="flex items-start gap-3 rounded-[var(--radius-control)] border border-danger/25 bg-danger-soft p-3 text-[13px] text-danger-ink">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="flex-1">{errorMessage(turn.error)}</p>
            {turn.error?.status !== 404 && (
              <Button size="sm" onClick={() => onRetry(turn.question)}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Try again
              </Button>
            )}
          </div>
        )}
        {turn.state === "done" && turn.result && (
          <>
            {turn.result.citations.length === 0 ? (
              <div className="flex items-start gap-3">
                <SearchX className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden />
                <div>
                  <p className="text-[14px] text-ink-soft">{turn.result.answer}</p>
                  <p className="mt-1 text-[12.5px] text-muted">Try naming a project, person, team or goal.</p>
                </div>
              </div>
            ) : (
              <AnswerText text={turn.result.answer} citations={turn.result.citations} idPrefix={prefix} />
            )}
            <CitationChips citations={turn.result.citations} idPrefix={prefix} />
            <p className="mt-3 text-[11.5px] text-faint">
              {turn.result.toolCalls.length} {turn.result.toolCalls.length === 1 ? "lookup" : "lookups"} · {(turn.result.latencyMs / 1000).toFixed(1)} s · {turn.result.model}
            </p>
          </>
        )}
      </Card>
    </article>
  );
}

/**
 * Ask the Mesh. Each question is answered on its own (no conversation memory, no caching); the
 * list below is just this page's history and disappears on reload.
 */
export function AskMesh() {
  const { data: status, error: statusError, isLoading } = useApi<CopilotStatus>("/copilot/status", { retry: false, staleTime: 300_000 });
  const { data: me } = useMe();
  const workspace = useUi((s) => s.workspace);
  const { pendingQuestion, setPendingQuestion } = useUi();
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const counterId = useId();
  const seq = useRef(0);

  const ask = useMutation<CopilotAnswer, ApiError, { id: string; question: string }>({
    mutationFn: ({ question }) => api.post<CopilotAnswer>("/copilot/ask", { question }),
    onSuccess: (result, { id }) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, state: "done", result } : t))),
    onError: (error, { id }) => setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, state: "error", error } : t))),
  });
  const busy = ask.isPending;

  const submit = (raw: string) => {
    const question = raw.trim().slice(0, MAX);
    if (!question || busy) return;
    const id = String(++seq.current);
    setTurns((ts) => [...ts, { id, question, state: "loading" }]);
    setDraft("");
    ask.mutate({ id, question });
  };

  // A question handed over from ⌘K: consume it once, then forget it.
  useEffect(() => {
    if (status && pendingQuestion) {
      const q = pendingQuestion;
      setPendingQuestion(null);
      submit(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pendingQuestion]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [turns.length]);

  if (isLoading) return <div role="status" aria-label="Loading Ask the Mesh"><Skeleton className="h-40 w-full" /></div>;
  if (statusError || !status) {
    return (
      <Card>
        <EmptyState icon={<Sparkles className="h-5 w-5" aria-hidden />} title="Ask the Mesh isn't turned on" description="This optional assistant is off in this WorkMesh. Everything else works as usual." />
      </Card>
    );
  }

  const suggestions = pickSuggestions(status, me?.active?.workspaces.includes(workspace) ? workspace : "employee");
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(draft);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(draft);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <section aria-label="Answers" aria-live="polite" aria-busy={busy} className="flex flex-col gap-5">
        {turns.length === 0 ? (
          <Card className="p-2">
            <EmptyState
              icon={<Sparkles className="h-5 w-5" aria-hidden />}
              title="Ask about projects, people, blockers, dependencies and goals"
              description="Answers are built only from WorkMesh records you can open, with a source for every claim."
            />
          </Card>
        ) : (
          turns.map((t) => <TurnView key={t.id} turn={t} onRetry={submit} />)
        )}
        <div ref={endRef} />
      </section>

      {/* Answers scroll under the composer; the canvas fade keeps them from showing through. */}
      <div className="sticky bottom-0 z-10 -mx-2 space-y-3 bg-gradient-to-t from-canvas from-75% to-transparent px-2 pb-4 pt-6">

        <Suggestions items={suggestions} onPick={submit} disabled={busy} />
        <form onSubmit={onSubmit} className="on-navy surface-midnight flex items-end gap-2 rounded-[var(--radius-panel)] p-2 shadow-overlay">
          <label htmlFor="ask-input" className="sr-only">Ask a question about your company</label>
          <textarea
            id="ask-input"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={MAX}
            autoFocus
            aria-describedby={`${hintId} ${counterId}`}
            placeholder="What's blocking Checkout Launch? Who can help with pricing?"
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[14px] text-white outline-none placeholder:text-navy-faint field-sizing-content"
          />
          <span id={counterId} className={cn("mb-3 shrink-0 text-[11px] tabular-nums", draft.length > MAX - 50 ? "text-amber-bright" : "text-navy-faint")} aria-live="off">
            {draft.length}/{MAX}
          </span>
          <Button type="submit" variant="accent" size="icon" className="mb-1.5 mr-1 h-9 w-9 shrink-0 rounded-full" disabled={!draft.trim() || busy} loading={busy} aria-label="Ask">
            {!busy && <ArrowUp className="h-4 w-4" aria-hidden />}
          </Button>
        </form>
        <p id={hintId} className="px-2 text-[11.5px] text-muted">
          Enter to ask · Shift+Enter for a new line. Ask the Mesh describes work: it doesn&apos;t rate people or predict deadlines.
        </p>
      </div>
    </div>
  );
}

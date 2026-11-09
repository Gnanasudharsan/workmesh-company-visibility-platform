import { AlertCircle, Inbox, Lock, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

export function LoadingCards({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4", className)} role="status" aria-label="Loading">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-3 h-3 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, compact }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-6" : "py-12")}>
      <div className="relative mb-3 flex h-11 w-11 items-center justify-center rounded-[14px] bg-gradient-to-br from-teal-soft to-violet-soft text-teal-ink ring-1 ring-inset ring-teal/15">{icon ?? <Inbox className="h-5 w-5" aria-hidden />}</div>
      <p className="text-[14px] font-semibold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[12.5px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Shows the real server error; 404s are explained without implying the record exists. */
export function ErrorState({ error, onRetry }: { error: ApiError | Error | null | undefined; onRetry?: () => void }) {
  const status = (error as ApiError | undefined)?.status;
  if (status === 404 || status === 403) {
    return (
      <EmptyState
        icon={<Lock className="h-5 w-5" aria-hidden />}
        title="Not available"
        description="This item doesn't exist or you don't have access to it. If you think you should, ask its owner."
      />
    );
  }
  return (
    <div role="alert" className="flex items-start gap-3 rounded-[var(--radius-card)] border border-danger/25 bg-danger-soft p-4 text-[13px] text-danger-ink">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex-1">
        <p className="font-medium">Couldn&apos;t load this</p>
        <p className="mt-0.5 text-danger-ink">{error?.message ?? "Unknown error"}</p>
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      )}
    </div>
  );
}

export function ProgressBar({ value, label: lbl, tone = "brand", className }: { value: number | null | undefined; label?: string; tone?: "brand" | "success" | "warning" | "danger"; className?: string }) {
  const color = { brand: "bg-gradient-to-r from-teal-ink to-teal", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  if (value === null || value === undefined)
    return <span className="text-[12px] text-faint">Not enough data</span>;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={lbl ?? "Progress"}>
        <div className={cn("h-full rounded-full origin-left transition-[width] duration-700 ease-[var(--ease-out-quint)]", color)} style={{ width: `${Math.max(2, value)}%` }} />
      </div>
      <span className="w-9 text-right text-[12px] tabular-nums text-muted">{value}%</span>
    </div>
  );
}

export function healthTone(h: string): "brand" | "success" | "warning" | "danger" {
  return h === "ON_TRACK" || h === "DONE" ? "success" : h === "AT_RISK" ? "warning" : h === "OFF_TRACK" || h === "BLOCKED" ? "danger" : "brand";
}

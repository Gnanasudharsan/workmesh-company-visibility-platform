"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useToasts } from "@/lib/toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-32px))] flex-col gap-2" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-raised animate-pop">
          {t.tone === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" aria-hidden /> : t.tone === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 text-danger" aria-hidden /> : <Info className="mt-0.5 h-4 w-4 text-brand" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p className={cn("text-[13px] font-medium", t.tone === "error" && "text-red-800")}>{t.title}</p>
            {t.description && <p className="mt-0.5 text-[12.5px] text-muted">{t.description}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-faint hover:text-ink" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

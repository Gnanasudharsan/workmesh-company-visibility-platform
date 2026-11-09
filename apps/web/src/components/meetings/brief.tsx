"use client";

import { CheckCircle2, CircleAlert, Clock, Diamond, FileQuestion, Flag, GitCommitHorizontal, HandHelping, ListTodo, OctagonAlert, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn, day, relative } from "@/lib/utils";
import { SeverityBadge } from "../ui/badges";
import { Card } from "../ui/card";
import { Input } from "../ui/form";

export interface BriefSection {
  key: string;
  title: string;
  items: Array<{ title: string; detail?: string; at?: string; ref: { type: string; id: string }; projectId?: string | null; severity?: string }>;
}
export interface Brief {
  meetingId: string;
  since: string;
  generatedAt: string;
  projects: Array<{ id: string; name: string }>;
  sections: BriefSection[];
}

const META: Record<string, { icon: ReactNode; tone: string }> = {
  newBlockers: { icon: <OctagonAlert className="h-4 w-4" />, tone: "text-danger" },
  unresolvedBlockers: { icon: <CircleAlert className="h-4 w-4" />, tone: "text-warning" },
  decisionsRequired: { icon: <Flag className="h-4 w-4" />, tone: "text-violet" },
  helpRequests: { icon: <HandHelping className="h-4 w-4" />, tone: "text-warning" },
  upcomingDeadlines: { icon: <Clock className="h-4 w-4" />, tone: "text-brand" },
  milestonesReached: { icon: <Diamond className="h-4 w-4" />, tone: "text-success" },
  workCompleted: { icon: <CheckCircle2 className="h-4 w-4" />, tone: "text-success" },
  resolvedBlockers: { icon: <CheckCircle2 className="h-4 w-4" />, tone: "text-success" },
  statusChanges: { icon: <GitCommitHorizontal className="h-4 w-4" />, tone: "text-info" },
  pendingActionItems: { icon: <ListTodo className="h-4 w-4" />, tone: "text-ink" },
  missingInformation: { icon: <FileQuestion className="h-4 w-4" />, tone: "text-muted" },
};

const ORDER = ["newBlockers", "decisionsRequired", "helpRequests", "unresolvedBlockers", "upcomingDeadlines", "statusChanges", "milestonesReached", "workCompleted", "resolvedBlockers", "pendingActionItems", "missingInformation"];

function href(ref: { type: string; id: string }, projectId?: string | null) {
  switch (ref.type) {
    case "project": return `/projects/${ref.id}`;
    case "milestone": return `/milestones/${ref.id}`;
    case "workItem": return projectId ? `/projects/${projectId}?tab=work&item=${ref.id}` : "#";
    case "blocker": return `/blockers/${ref.id}`;
    case "update": return `/updates/${ref.id}`;
    case "member": return `/people/${ref.id}`;
    case "decision": return "/decisions";
    default: return "/my-work?tab=actions";
  }
}

/** Every claim links to the authorized record it came from. */
export function BriefView({ brief, since, onSince, onAddAgenda }: { brief: Brief; since: string; onSince: (v: string) => void; onAddAgenda?: (title: string) => void }) {
  const sections = ORDER.map((k) => brief.sections.find((s) => s.key === k)).filter((s): s is BriefSection => !!s);
  const attention = sections.filter((s) => ["newBlockers", "decisionsRequired", "helpRequests"].includes(s.key)).reduce((a, s) => a + s.items.length, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal/30 bg-gradient-to-r from-brand-soft to-white px-4 py-3">
        <p className="flex items-center gap-2 text-[13px]"><Sparkles className="h-4 w-4 text-brand" aria-hidden /><span><strong className="font-medium">{attention} item{attention === 1 ? "" : "s"} need discussion.</strong> Compared with {day(brief.since, true)} · generated {relative(brief.generatedAt)} from records you can see.</span></p>
        <label className="flex items-center gap-2 text-[12.5px] text-muted no-print">Compare since <Input type="date" value={since} onChange={(e) => onSince(e.target.value)} className="h-8 w-auto" /></label>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.key} className={cn("p-4 print-area", s.items.length === 0 && "opacity-70")}>
            <h3 className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold"><span className={META[s.key]?.tone}>{META[s.key]?.icon}</span>{s.title}<span className="ml-auto rounded-full bg-subtle px-2 text-[11.5px] tabular-nums text-muted">{s.items.length}</span></h3>
            {s.items.length === 0 ? <p className="text-[12.5px] text-faint">Nothing in this period.</p> : (
              <ul className="space-y-1.5">
                {s.items.slice(0, 8).map((i, idx) => (
                  <li key={`${i.ref.id}-${idx}`} className="group flex items-start gap-2">
                    <Link href={href(i.ref, i.projectId)} className="min-w-0 flex-1 rounded-md px-1.5 py-1 hover:bg-subtle/70">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium">{i.severity && <SeverityBadge severity={i.severity} />}<span className="truncate">{i.title}</span></span>
                      {(i.detail || i.at) && <span className="block truncate text-[12px] text-muted">{i.detail}{i.detail && i.at ? " · " : ""}{i.at ? day(i.at) : ""}</span>}
                    </Link>
                    {onAddAgenda && ["newBlockers", "unresolvedBlockers", "decisionsRequired", "helpRequests"].includes(s.key) && (
                      <button onClick={() => onAddAgenda(i.title)} className="no-print mt-1 shrink-0 rounded-md px-1.5 py-0.5 text-[11.5px] text-brand opacity-0 hover:bg-brand-soft focus:opacity-100 group-hover:opacity-100">+ Agenda</button>
                    )}
                  </li>
                ))}
                {s.items.length > 8 && <li className="px-1.5 text-[12px] text-muted">+{s.items.length - 8} more</li>}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

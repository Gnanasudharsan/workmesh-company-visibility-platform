import { CalendarClock, FileText, Flag, FolderKanban, Gavel, GitBranch, ListChecks, Milestone, OctagonAlert, Target, User, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { CopilotCitation } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICON: Record<string, LucideIcon> = {
  project: FolderKanban,
  person: User,
  team: Users,
  department: Users,
  goal: Target,
  initiative: Flag,
  milestone: Milestone,
  update: FileText,
  blocker: OctagonAlert,
  decision: Gavel,
  dependency: GitBranch,
  work_item: ListChecks,
  meeting: CalendarClock,
};

const KIND: Record<string, string> = { work_item: "Work item" };
export const kindLabel = (type: string) => KIND[type] ?? type.charAt(0).toUpperCase() + type.slice(1);

/**
 * Inline Markdown subset: **bold**, *italic* / _italic_, `code`, and [n] citation markers.
 * Everything else is plain text. Rendered as React elements: no HTML is ever injected.
 */
function inline(text: string, cites: Map<number, CopilotCitation>, anchor: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[\d+\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-i${k++}`;
    if (tok.startsWith("**")) out.push(<strong key={key} className="font-semibold text-ink">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key} className="rounded bg-subtle px-1 py-px font-mono text-[12.5px]">{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const n = Number(tok.slice(1, -1));
      const c = cites.get(n);
      out.push(
        c ? (
          <a key={key} href={`#${anchor}-cite-${n}`} aria-label={`Source ${n}: ${c.title}`} className="mx-px inline-flex h-[17px] min-w-[17px] -translate-y-px items-center justify-center rounded-[5px] bg-teal-soft px-1 align-middle font-mono text-[10.5px] font-semibold text-teal-ink ring-1 ring-inset ring-teal/25 hover:bg-teal/20 focus-visible:outline-2">
            {n}
          </a>
        ) : (
          tok
        ),
      );
    } else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Block Markdown subset: paragraphs and bulleted or numbered lists. */
export function AnswerText({ text, citations, idPrefix }: { text: string; citations: CopilotCitation[]; idPrefix: string }) {
  const cites = new Map(citations.map((c) => [c.n, c]));
  const blocks: Array<{ kind: "p" | "ul" | "ol"; lines: string[] }> = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      blocks.push({ kind: "p", lines: [] });
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    const kind = bullet ? "ul" : numbered ? "ol" : "p";
    const content = (bullet ?? numbered)?.[1] ?? line.replace(/^#{1,6}\s+/, "");
    const prev = blocks.at(-1);
    if (prev && prev.kind === kind && (kind !== "p" || prev.lines.length)) prev.lines.push(content);
    else blocks.push({ kind, lines: [content] });
  }
  return (
    <div className="space-y-2.5 text-[14px] leading-relaxed text-ink-soft">
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) => {
          const key = `${idPrefix}-b${i}`;
          if (b.kind === "p") return <p key={key}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && " "}{inline(l, cites, idPrefix, `${key}-${j}`)}</Fragment>)}</p>;
          const List = b.kind === "ul" ? "ul" : "ol";
          return (
            <List key={key} className={cn("space-y-1 pl-5", b.kind === "ul" ? "list-disc marker:text-teal" : "list-decimal marker:text-muted")}>
              {b.lines.map((l, j) => <li key={j}>{inline(l, cites, idPrefix, `${key}-${j}`)}</li>)}
            </List>
          );
        })}
    </div>
  );
}

/** One chip per source, linking to the record's page. Hrefs come from the server. */
export function CitationChips({ citations, idPrefix }: { citations: CopilotCitation[]; idPrefix: string }) {
  if (!citations.length) return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <h3 id={`${idPrefix}-sources`} className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Sources</h3>
      <ol aria-labelledby={`${idPrefix}-sources`} className="flex flex-wrap gap-2">
        {citations.map((c) => {
          const Icon = ICON[c.type] ?? FileText;
          return (
            <li key={c.n} id={`${idPrefix}-cite-${c.n}`} className="min-w-0 max-w-full scroll-mt-24">
              <Link
                href={c.href}
                className="group flex min-w-0 max-w-full items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-[12.5px] shadow-card transition-[border-color,box-shadow] duration-[var(--duration-fast)] hover:border-teal/40 hover:shadow-raised target:ring-2 target:ring-teal/40"
              >
                <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-teal-soft px-1 font-mono text-[10.5px] font-semibold text-teal-ink">{c.n}</span>
                <Icon className="h-3.5 w-3.5 shrink-0 text-faint group-hover:text-teal-ink" aria-hidden />
                <span className="sr-only">{kindLabel(c.type)}: </span>
                <span className="min-w-0 truncate font-medium text-ink">{c.title}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Deterministic meeting-brief generation (no language model).
 *
 * Input is a set of records the *viewer is already authorized to see* plus the comparison
 * window [since, now]. Output is a list of sections; every item carries a reference
 * (entity type + id) back to the record that justifies it.
 *
 * Complexity: linear in the number of input records.
 */
import { label } from "./enums";

export interface BriefRef {
  type: "project" | "milestone" | "workItem" | "blocker" | "update" | "decision" | "actionItem" | "member";
  id: string;
}

export interface BriefItem {
  title: string;
  detail?: string;
  at?: string;
  ref: BriefRef;
  projectId?: string | null;
  severity?: string;
}

export interface BriefInput {
  since: Date;
  now: Date;
  horizonDays: number;
  projects: Array<{ id: string; name: string }>;
  changes: Array<{
    entityType: "PROJECT" | "MILESTONE" | "WORK_ITEM";
    entityId: string;
    projectId: string;
    field: string;
    from: string | null;
    to: string | null;
    at: Date;
    title: string;
  }>;
  milestones: Array<{
    id: string;
    projectId: string;
    title: string;
    status: string;
    dueDate: Date | null;
    completedAt: Date | null;
    isCritical: boolean;
  }>;
  blockers: Array<{
    id: string;
    projectId: string | null;
    title: string;
    state: string;
    severity: string;
    createdAt: Date;
    resolvedAt: Date | null;
    ownerName: string | null;
  }>;
  updates: Array<{
    id: string;
    projectId: string | null;
    authorName: string;
    publishedAt: Date;
    completed: string | null;
    helpNeeded: string | null;
  }>;
  decisions: Array<{ id: string; projectId: string | null; title: string; status: string; createdAt: Date }>;
  actionItems: Array<{
    id: string;
    projectId: string | null;
    title: string;
    status: string;
    ownerName: string;
    dueDate: Date | null;
  }>;
  /** People expected to report (e.g. participants with assigned work). */
  expectedReporters: Array<{ id: string; name: string; lastPublishedAt: Date | null }>;
}

export interface BriefSection {
  key:
    | "workCompleted"
    | "milestonesReached"
    | "newBlockers"
    | "unresolvedBlockers"
    | "resolvedBlockers"
    | "statusChanges"
    | "upcomingDeadlines"
    | "decisionsRequired"
    | "helpRequests"
    | "pendingActionItems"
    | "missingInformation";
  title: string;
  items: BriefItem[];
}

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString();

export function buildBrief(input: BriefInput): BriefSection[] {
  const since = input.since.getTime();
  const now = input.now.getTime();
  const horizon = now + input.horizonDays * DAY;
  const inWindow = (d: Date | null | undefined) => !!d && d.getTime() >= since && d.getTime() <= now;
  const projectName = new Map(input.projects.map((p) => [p.id, p.name]));

  const workCompleted: BriefItem[] = input.changes
    .filter((c) => c.entityType === "WORK_ITEM" && c.field === "status" && c.to === "DONE" && inWindow(c.at))
    .map((c) => ({
      title: c.title,
      detail: projectName.get(c.projectId),
      at: iso(c.at),
      ref: { type: "workItem", id: c.entityId },
      projectId: c.projectId,
    }));

  const milestonesReached: BriefItem[] = input.milestones
    .filter((m) => m.status === "DONE" && inWindow(m.completedAt))
    .map((m) => ({
      title: m.title,
      detail: `${projectName.get(m.projectId) ?? ""}${m.isCritical ? " · critical" : ""}`,
      at: iso(m.completedAt!),
      ref: { type: "milestone", id: m.id },
      projectId: m.projectId,
    }));

  const openBlockers = input.blockers.filter((b) => b.state !== "RESOLVED");
  const blockerItem = (b: BriefInput["blockers"][number]): BriefItem => ({
    title: b.title,
    detail: [b.projectId ? projectName.get(b.projectId) : null, b.ownerName ? `Owner: ${b.ownerName}` : "No owner yet"]
      .filter(Boolean)
      .join(" · "),
    at: iso(b.createdAt),
    ref: { type: "blocker", id: b.id },
    projectId: b.projectId,
    severity: b.severity,
  });
  const severityRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const bySeverity = (a: BriefItem, b: BriefItem) => (severityRank[a.severity!] ?? 9) - (severityRank[b.severity!] ?? 9);
  const newBlockers = openBlockers.filter((b) => inWindow(b.createdAt)).map(blockerItem).sort(bySeverity);
  const unresolvedBlockers = openBlockers
    .filter((b) => b.createdAt.getTime() < since)
    .map(blockerItem)
    .sort(bySeverity);
  const resolvedBlockers = input.blockers
    .filter((b) => b.state === "RESOLVED" && inWindow(b.resolvedAt))
    .map((b) => ({ ...blockerItem(b), at: iso(b.resolvedAt!) }));

  const statusChanges: BriefItem[] = input.changes
    .filter((c) => c.entityType === "PROJECT" && (c.field === "status" || c.field === "leadId") && inWindow(c.at))
    .map((c) => ({
      title: c.field === "status" ? `${c.title}: ${label(c.from) || "—"} → ${label(c.to) || "—"}` : `${c.title}: lead changed`,
      detail: c.field === "leadId" ? `${c.from ?? "—"} → ${c.to ?? "—"}` : undefined,
      at: iso(c.at),
      ref: { type: "project", id: c.entityId },
      projectId: c.projectId,
    }));

  const upcomingDeadlines: BriefItem[] = input.milestones
    .filter((m) => m.status !== "DONE" && m.status !== "CANCELLED" && m.dueDate && m.dueDate.getTime() <= horizon)
    .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime())
    .map((m) => ({
      title: m.title,
      detail: `${projectName.get(m.projectId) ?? ""}${m.dueDate!.getTime() < now ? " · overdue" : ""}${m.isCritical ? " · critical" : ""}`,
      at: iso(m.dueDate!),
      ref: { type: "milestone", id: m.id },
      projectId: m.projectId,
    }));

  const decisionsRequired: BriefItem[] = input.decisions
    .filter((d) => d.status === "PENDING")
    .map((d) => ({
      title: d.title,
      detail: d.projectId ? projectName.get(d.projectId) : undefined,
      at: iso(d.createdAt),
      ref: { type: "decision", id: d.id },
      projectId: d.projectId,
    }));

  const helpRequests: BriefItem[] = input.updates
    .filter((u) => u.helpNeeded && u.helpNeeded.trim() && inWindow(u.publishedAt))
    .map((u) => ({
      title: u.helpNeeded!.trim(),
      detail: `${u.authorName}${u.projectId ? ` · ${projectName.get(u.projectId) ?? ""}` : ""}`,
      at: iso(u.publishedAt),
      ref: { type: "update", id: u.id },
      projectId: u.projectId,
    }));

  const pendingActionItems: BriefItem[] = input.actionItems
    .filter((a) => a.status === "OPEN")
    .map((a) => ({
      title: a.title,
      detail: `Owner: ${a.ownerName}${a.dueDate ? ` · due ${a.dueDate.toISOString().slice(0, 10)}` : ""}`,
      at: a.dueDate ? iso(a.dueDate) : undefined,
      ref: { type: "actionItem", id: a.id },
      projectId: a.projectId,
    }));

  const updatedProjects = new Set(input.updates.filter((u) => inWindow(u.publishedAt)).map((u) => u.projectId));
  const missingInformation: BriefItem[] = [
    ...input.projects
      .filter((p) => !updatedProjects.has(p.id))
      .map((p) => ({
        title: `No progress update on ${p.name} in this period`,
        ref: { type: "project", id: p.id } as BriefRef,
        projectId: p.id,
      })),
    ...input.expectedReporters
      .filter((r) => !r.lastPublishedAt || r.lastPublishedAt.getTime() < since)
      .map((r) => ({
        title: `${r.name} has not shared an update in this period`,
        ref: { type: "member", id: r.id } as BriefRef,
      })),
  ];

  return [
    { key: "workCompleted", title: "Work completed", items: workCompleted },
    { key: "milestonesReached", title: "Milestones reached", items: milestonesReached },
    { key: "newBlockers", title: "New blockers", items: newBlockers },
    { key: "unresolvedBlockers", title: "Still unresolved", items: unresolvedBlockers },
    { key: "resolvedBlockers", title: "Blockers resolved", items: resolvedBlockers },
    { key: "statusChanges", title: "Project status changes", items: statusChanges },
    { key: "upcomingDeadlines", title: "Upcoming deadlines", items: upcomingDeadlines },
    { key: "decisionsRequired", title: "Decisions required", items: decisionsRequired },
    { key: "helpRequests", title: "Help requests", items: helpRequests },
    { key: "pendingActionItems", title: "Pending action items", items: pendingActionItems },
    { key: "missingInformation", title: "Missing information", items: missingInformation },
  ];
}

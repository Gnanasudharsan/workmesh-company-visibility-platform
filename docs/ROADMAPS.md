# Goals, roadmaps and dependencies

## Hierarchy

`CompanyGoal → Initiative → Project → Milestone → WorkItem`, each with owner, status, priority, dates, visibility and history. Projects also have an owning team, lead, members, explicit grants, a `discoverable` flag and an optional owner-reported progress estimate.

## State machines (`packages/core/src/transitions.ts`)

| Machine | Transitions |
| --- | --- |
| Project | Proposed → Planned/Cancelled · Planned → In progress/Proposed/Cancelled · In progress → In review/Blocked/Completed/Cancelled · In review → In progress/Completed/Blocked · Blocked → In progress/Cancelled · Completed → In progress · Cancelled → Proposed |
| Milestone | Planned ↔ In progress → Done; any → Cancelled; Done → In progress |
| Work item | To do → In progress → In review → Done, Blocked from active states, Cancelled |
| Blocker | Open → Assigned/Investigating/Waiting/Resolved → … → Resolved → Reopened |
| Goal | Draft → Active → Achieved/Missed → Archived |

Invalid transitions return **422 `INVALID_TRANSITION`**; the UI only offers valid ones. A project cannot be completed while a critical milestone is open (`CRITICAL_MILESTONES_OPEN`). Multi-record changes (e.g. blocker resolution resuming its work item) happen in the request's single transaction.

## Progress — never invented

Two numbers are kept strictly separate:

- **Computed progress** — if the project has milestones: weighted share of non-cancelled milestones that are Done, **critical milestones weigh 2, others 1**. Otherwise: Done ÷ (total − cancelled) work items. Otherwise: *not enough data*.
- **Owner-reported estimate** — what the owner explicitly reported, shown with its date and labelled as reported.

Goal/initiative progress = mean computed progress of the projects *the viewer* can see (documented in the UI).

## Health (`packages/core/src/health.ts`)

Rule-based with reasons:

1. Cancelled → Cancelled; Completed → Done.
2. **Blocked** if status is Blocked, an open critical blocker exists, or an upstream dependency (visible to the viewer) is Blocked.
3. **Off track** if a *critical* milestone is overdue or the target date has passed.
4. **At risk** if a normal milestone is overdue, a critical milestone due within 14 days hasn't started, an open high-severity blocker exists, an upstream dependency is at risk, or elapsed schedule exceeds computed progress by more than 35 points.
5. Proposed/Planned → Not started; otherwise On track.

So a project with many completed easy tasks and an overdue critical milestone is **Off track** (unit-tested).

## Views

Timeline (health-colored bars grouped by initiative, milestone diamonds, today line, computed-progress fill), board by status, sortable table (TanStack Table), milestone tracker (overdue/upcoming/reached) and goal hierarchy — all from `/api/roadmap` and `/api/goals`, i.e. the same records.

## Dependencies (`packages/core/src/dependencies.ts`)

Edge semantics: *downstream depends on upstream*. The graph must stay acyclic: `dependencyWouldCreateCycle` checks whether `upstream` is reachable downstream of `downstream` (BFS, O(V+E)), considering **all** edges in the org, including ones the viewer can't see.

`analyzeImpact` separates:

- **Confirmed** problems — project Blocked, an open high/critical blocker, or waiting on a Blocked dependency.
- **Potential** downstream impact — projects reachable from a confirmed problem through unresolved edges, with hop distance, path and whether the path is critical.

WorkMesh shows **slack evidence** (days between the upstream target date and the downstream need-by date) instead of predicting a missed deadline.

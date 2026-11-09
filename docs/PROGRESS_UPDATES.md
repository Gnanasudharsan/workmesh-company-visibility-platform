# Progress updates & blockers

The original problem: managers asking "what are you working on?" over and over. Updates are designed to take under a minute.

## Update fields

| Field | Notes |
| --- | --- |
| Currently working on | required, the only required field |
| Stage | Planning, Development, Testing, Review, Blocked, Completed |
| Next step | quick mode |
| Completed recently, help needed (+ from whom), confidence 1–5, milestone | detailed mode |
| Project / milestone / work item | links must belong to a project the author can see in detail |
| Audience | `PRIVATE` (draft-like, author only), `MANAGER`, `PROJECT`, `TEAM`, `ORG` |

Lifecycle: **draft** (always author-only) → **published**. Editing a published update snapshots the previous version into `update_revisions` and sets `editedAt`; the detail page shows the edit history. Acknowledgements and comments inherit the update's visibility. Deleting is allowed for drafts only.

"I'm blocked" in the composer creates a linked **blocker** in the same request/transaction.

## Who sees an update

See [AUTHORIZATION.md](AUTHORIZATION.md): author always; nobody else for drafts/private; otherwise the audience rule **and** details access to the linked project. Managers see their management line's `MANAGER`/`TEAM`/`PROJECT` updates; project members see `PROJECT` updates even when they don't manage the author.

## Blockers

Fields: title, description, project/milestone/work item, reporter, owner, severity, state, visibility, target date, resolution notes, timestamps.

- Assigning an owner moves Open/Reopened → Assigned and notifies the owner.
- Resolving requires resolution notes. When the last open blocker on a work item is resolved, the work item moves from Blocked back to In progress; reporting a blocker on an active work item moves it to Blocked. Both are recorded as change events.
- Every transition and owner change appends a `blocker_events` row; the detail page renders the full timeline.
- Who can manage: reporter, owner, the reporter's management line, and leads of the linked project.
- Escalation is **opt-in per organization** (`escalateBlockersAfterHours`): unowned high/critical blockers older than N hours notify the reporter's management chain once (`escalatedAt` prevents repeats).

## Team Pulse freshness

Freshness labels describe information, never people: *Updated today*, *Updated this week*, *No recent update* (older than the org's `staleAfterDays`), *No current update*. Managers can "Ask for an update", which sends a neutral notification.

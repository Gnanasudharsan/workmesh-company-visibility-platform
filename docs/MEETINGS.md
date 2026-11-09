# Meetings & meeting briefs

No microphones, recordings or transcripts — and no LLM. Briefs are deterministic summaries of structured changes.

## Records

`Meeting` (title, organizer, participants, team, related projects, date/time, duration, recurrence `NONE|WEEKLY|BIWEEKLY|MONTHLY`, series, visibility `PARTICIPANTS|TEAM|ORG`, status, comparison baseline, notes) with `AgendaItem` (discussed flag), `Decision` (pending/decided/superseded, owner, project, rationale) and `ActionItem` (owner, due date, linked decision/project/blocker).

## Brief generation (`packages/core/src/brief.ts`, `MeetingsService.brief`)

1. **Baseline** — `?since=` override, else the meeting's `compareFrom`, else the previous meeting in the series, else 7 days before.
2. **Scope** — the meeting's projects the *viewer* can see in detail (or the team's active projects), plus participants.
3. **Inputs**, each already filtered by the viewer's permissions: change events, milestones, blockers (`visibilityWhere` + row check), published updates, decisions and open action items in the series or projects, participants with open assigned work and their last published update.
4. **Sections** — work completed, milestones reached, new blockers, still unresolved, blockers resolved, project status changes, upcoming deadlines (14 days, incl. overdue), decisions required, help requests, pending action items, missing information.

Every item carries a `ref` (type + id) and the UI links it to the source record. Because the brief is computed per viewer, two participants with different access receive different briefs; "Share brief" only notifies participants that a brief is ready — each opens their own authorized version.

Complexity: linear in the number of input records.

## During and after

Add/tick agenda items (one click from brief items), notes, record decisions, assign action items with owners and due dates, mark done. **Complete meeting** marks it completed and, for recurring meetings, creates the next occurrence with the same participants/projects, the undiscussed agenda items, and `compareFrom` = this meeting's time.

## Exports

- **Markdown** — `GET /api/meetings/:id/summary.md` (decisions, action items with owners and due dates, follow-ups, project references, notes) — built only from records the requester may see.
- **PDF** — browser print-to-PDF with a print stylesheet (`.no-print`, `.print-area`).

# WorkMesh — Architecture Plan & Implementation Checklist

> Know who's building what. Understand how it all connects.

This file is the persistent plan. `PROGRESS.md` records what has actually been verified.
A box is ticked here only after its behaviour has been verified (tests or manual run), not when a file exists.

## Architecture (modular monolith)

```
apps/web    Next.js 16 (App Router, React 19, Tailwind 4, React Flow, TanStack Query)  :3002
apps/api    NestJS 11 REST + Socket.IO gateway + BullMQ worker (inline or standalone)  :8020
packages/core  Pure TypeScript domain logic shared by API and web:
               policy engine, hierarchy/DAG algorithms, state machines, health, change detection
PostgreSQL 16  (docker, :55462)  — two roles: owner (migrations/system) and app (RLS-restricted)
Redis 7        (docker, :56402)  — BullMQ queues, realtime fan-out pub/sub, rate-limit store
```

Key decisions (see `docs/DECISIONS.md`):

1. **Tenant context from the session, never from the client.** The active organization lives on the server-side session; switching orgs re-validates membership.
2. **Defense in depth for tenancy.** Application-level scoping *and* PostgreSQL Row-Level Security. Tenant requests run inside a transaction that sets `app.org_id` with `set_config(..., true)` (transaction-local, safe under connection pooling) using a role without `BYPASSRLS`.
3. **One policy decision point.** `packages/core/src/policy` is a pure, deny-by-default engine (RBAC + ReBAC + ABAC). The API loads an `AuthContext` (memberships, teams, reporting subtree, project roles, grants, delegations) and every controller asks capability questions. Context is cached per `(org, member, org.authzVersion)`; any relationship change bumps `authzVersion` → immediate revocation.
4. **Summary vs. details.** Projects expose a deliberately limited summary to people who may know they exist, and details only to people with a relationship or explicit grant. `RESTRICTED` resources are invisible (no names, counts or edges) without a grant.
5. **Outbox → BullMQ → notifications/realtime.** Durable changes write an outbox row in the same transaction. A worker delivers notifications (with dedupe keys) and realtime invalidation pings, each recipient re-checked against policy. Realtime carries IDs only; clients refetch through the authorized API.
6. **Honest progress.** Health is derived from milestones (critical milestones dominate), blockers, overdue dates and upstream dependencies. Owner-reported progress is shown separately and labelled as reported.

## Checklist

### Phase 1 — Foundation
- [x] Environment inspection, GitHub identity, attribution disabled
- [x] Monorepo (pnpm workspaces), TypeScript strict, ESLint, test runners
- [x] Docker Compose (Postgres + Redis, isolated names/ports)
- [x] Health checks that verify DB + Redis + queue

### Phase 2 — Database & authentication
- [x] Prisma schema + migrations + RLS policies
- [x] Argon2id passwords, HTTP-only sessions, CSRF double-submit, rate limits
- [x] Company registration, invitations (expiry, single-use, resend, revoke), onboarding
- [x] Password reset via local mailbox

### Phase 3 — Organization graph
- [x] Departments, teams, team memberships, positions, profiles
- [x] Reporting lines with history, cycle detection, delegation with expiry

### Phase 4 — Authorization
- [x] Policy engine + capability API
- [x] Authorization matrix tests (pure) + API-level enforcement tests
- [x] Cross-tenant isolation tests (IDs, search, graph, export, sockets)

### Phase 5 — Company Map
- [x] People graph API (progressive expansion) + Work graph API, permission-filtered
- [x] React Flow map: custom nodes, ELK layouts, search, highlight, filters, history, minimap, list view

### Phase 6 — Goals & roadmaps
- [x] Goals → initiatives → projects → milestones → work items
- [x] Validated status transitions, optimistic concurrency
- [x] Timeline, kanban, list, milestone tracker, goal hierarchy views

### Phase 7 — Progress updates & blockers
- [x] Quick/detailed composer, drafts, publish, edit history, acknowledgements, comments
- [x] Blocker lifecycle with full transition history

### Phase 8 — Role-aware workspaces
- [x] Employee, Manager (Team Pulse), Project Lead, Leadership, Admin

### Phase 9 — Dependencies
- [x] Dependency CRUD, cycle prevention, downstream impact, explorer

### Phase 10 — Meetings
- [x] Meetings, agenda, change-based briefs, decisions, action items, Markdown/PDF export

### Phase 11 — Collaboration
- [x] Notifications (prefs, dedupe, deep links), realtime, global search (FTS)

### Phase 12–14 — Polish, verification, delivery
- [x] Accessibility, responsive layouts, empty/error states
- [x] Playwright journeys A–G, screenshots
- [x] Docs, README, CI, secret scanning, publication

### Midnight Edition redesign (Phase 2)
See [docs/UI_REDESIGN_PLAN.md](docs/UI_REDESIGN_PLAN.md).
- [x] Tokens, typography, logo family
- [x] Navy collapsible shell, motion system, command palette, mobile drawer
- [x] Component library (heroes, data visuals, Living Mesh, contribution map, getting-started guide)
- [x] Login, employee home, Team Pulse 2.0, leadership command center
- [x] Company Map navy canvas + camera focus; Dependency Explorer Impact mode; notifications grouping
- [x] Responsive coverage incl. 1024 px; screenshots; docs

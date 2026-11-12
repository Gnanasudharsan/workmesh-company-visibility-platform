# Testing

| Layer | Location | Tool | Tests |
| --- | --- | --- | ---: |
| Domain core | `packages/core/src/*.test.ts` | Vitest | 91 |
| API integration (real Postgres + Redis) | `apps/api/test/*.int.spec.ts` | Jest, Supertest, socket.io-client | 54 |
| Web components & client | `apps/web/src/**/*.test.tsx` | Vitest, Testing Library, jsdom | 16 |
| End-to-end journeys + responsive/a11y checks | `apps/web/e2e/*.spec.ts` | Playwright (Chromium) | 9 |

## Running

```bash
make test        # core + API integration + web unit tests (starts Postgres/Redis)
```

```bash
make e2e         # reseeds demo data, starts API + web if not running, runs journeys A–H
```

Playwright starts the API with `COPILOT_ENABLED=true COPILOT_PROVIDER=fake` (journeys never call a model) and
`AUTH_RATE_LIMIT_PER_MINUTE=200`, because the suite signs in more than 20 times a minute (the integration
suites raise the same limit). If you reuse an API you started yourself, start it with those three variables.

```bash
pnpm --filter @workmesh/api loadtest   # latency measurement against a running API
```

## What is covered

**Core (91)** — hierarchy traversal, depths, dotted lines, chains, cycle detection incl. 20 000-node chains and corrupt data, reporting-change validation; dependency reach, cycle prevention, topological order, impact (confirmed vs potential); every state machine and reachability of every state; computed progress weighting and health rules (incl. "many easy tasks + overdue critical milestone = off track"); freshness buckets; brief sections and windows; notification dedupe/bucketing; **policy matrix** (44 cases: 11 personas × 4 visibility classes × actions, drafts, audiences, blockers, meetings, teams, org capabilities, workspaces).

**API integration (54)** on a dedicated `workmesh_test` database and `wm-test` Redis prefix, reseeded per suite:
- *Tenancy (10)*: 13 foreign URLs → 404, foreign mutations rejected, org switch rejected, lists/search/graphs/export/directory clean in both directions, RLS without context, with context, cross-tenant writes, pooled-connection context, no access to `users`/`sessions`.
- *Authorization (27)*: Examples A–F on seeded data, summary-only payloads, author-only edits, removal and delegation revocation, expired delegation, search/graph/export/dependency filtering, restricted goals, admin-only endpoints, permission inspector, server-derived workspaces, CSRF.
- *Workflows (14)*: new-company registration with validation, structure, goal → initiative → linked project, critical milestone, invited contributor; invitation → acceptance → onboarding; expiry, resend rotation, revoke; update + blocker → manager → owner → resolution with notifications; notifications never reach unauthorized people and hide restricted names; dedupe on re-delivery; dependency impact and cycle rejection; brief → decision → action item → summary → recurrence; reporting cycles and history; optimistic concurrency (parallel edits → 200 + 409); invalid transitions; password reset; health/metrics; CSV formula injection.
- *Realtime (3)*: unauthenticated sockets rejected, cross-tenant subscribe rejected, events reach only authorized members of the tenant and carry no content.

**Web (16)** — status indicators pair color with text, neutral freshness, summary badge; API client sends cookies, CSRF only on writes, surfaces server codes, maps network errors; navigation adapts to server-authorized workspaces; composer validation, quick publish with linked blocker, private drafts; map tree alternative; ELK ordering; brief source links and add-to-agenda.

**E2E (9)** — journeys A–G from the specification against the full stack (see [DEMO.md](DEMO.md)), plus no-overflow checks on 10 pages at 1920/1440/1280/768/390 px and mobile-nav/keyboard-focus checks.

## Results (2026-11-09, local)

Core 91/91 · API 54/54 · Web 16/16 · Playwright 9/9. CI runs the same suites on every push (see the README badge for the current status).

## Bugs found by tests

- Realtime gateway subscribed to Redis before the connection was ready → no events delivered (fixed `e48b000`).
- BullMQ worker connection was never closed → processes (and CI) hung (fixed `c452cae`).
- CSV formula injection (security review, fixed `e0f84ca`).

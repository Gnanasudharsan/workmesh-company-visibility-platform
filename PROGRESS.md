# WorkMesh — Progress Log

Only verified work is recorded here. Each milestone lists what was run and the resulting commit.

## Environment (verified 2026-11-08)

| Item | Result |
| --- | --- |
| `gh api user --jq .login` | `Sreevarshann` (id 85571922) |
| Git author | `Sreevarshann <85571922+Sreevarshann@users.noreply.github.com>` (noreply derived from the API-reported user id) |
| Claude Code | 2.1.117 — `~/.claude/settings.json`: `attribution.commit = ""`, `attribution.pr = ""`, `includeCoAuthoredBy = false`; no project/managed overrides found |
| Machine | Apple Silicon (arm64), 10 cores, 16 GB RAM, macOS 26.6.2, Node 24.13, Docker 29.9 |
| Ports | 3002 (web), 8020 (API), 55462 (Postgres), 56402 (Redis) — all free; other local stacks untouched |

## Milestones

| # | Milestone | Verification | Commit |
| - | --------- | ------------ | ------ |
| 1 | Monorepo, Docker (Postgres 16 + Redis 7), restricted DB role | `docker compose up --wait` healthy; roles verified | `a12d010` |
| 2 | Domain core: hierarchy, DAG, state machines, health, briefs, policy engine | 91 Vitest unit tests (incl. 44-row policy matrix) | `aa7b56e`, `6a5318f` |
| 3 | Schema + RLS migration (35 tenant tables, FORCE RLS) | app role sees 0 rows without context; no access to users/sessions | `143c305` |
| 4 | Auth, sessions, CSRF, invitations, org structure, reporting | curl smoke + integration tests | `90f790d` |
| 5 | Goals → projects → milestones → work items, transitions, concurrency | curl smoke (422 invalid transition, 409 stale version) + integration | `a92e9b1` |
| 6 | Progress updates, blockers lifecycle | curl smoke + integration | `c377800` |
| 7 | Company Map graph API, dependencies, meetings, notifications/realtime, dashboards, search, admin | integration suites | `496826e`…`4c981c1` |
| 8 | Synthetic demo seed (51 people, 12 projects, 98 work items, 33 updates) | `make seed` | `71c1360` |
| 9 | Integration tests: tenancy (10), authorization (27), workflows (12), realtime (3) | **52/52 passing** against real Postgres + Redis | `9587b4e`, `4e55396`, `1e3bae4` |
| 10 | Realtime bug fix found by tests (Redis subscribe before ready) | realtime suite 3/3 | `e48b000` |

| 11 | CI hang fix: BullMQ worker connection closed on shutdown | full API suite exits on its own (52/52 in ~8 s) | `c452cae` |
| 12 | Web app: shell, auth flows, all workspaces, Company Map, roadmaps, projects, updates, blockers, dependencies, meetings, directory, notifications, search, settings, onboarding, admin | `tsc`, ESLint, `next build` (44 routes), manual browser checks | `b74749d` … `970e2a1` |
| 13 | Web unit tests | 16/16 (Vitest) | `18d5558` |
| 14 | Playwright journeys A–G against the full stack | **7/7 passing** | `8b731fd` |
| 15 | Mobile overflow fix, brief polish | screenshots at 390 px re-inspected | `3d24f68` |
| 16 | Dockerfiles; CI web/E2E/Docker jobs | both images build locally | `433b747` |
| 17 | 17 real screenshots | Playwright capture, inspected | `4aa944b` |
| 18 | Security review: CSV formula injection fixed | +1 integration test (53/53) | `e0f84ca` |
| 19 | Load test with measured latencies | see README (zero errors; RSS returns to ~79 MB idle) | `4e2fb8b` |
| 20 | README + 14 docs; Mermaid validated in Chromium (6/6) and added to CI | `make docs-check` | (this commit) |

## Known issues / notes

- Integration suites share one test database and must run serially (`--runInBand`, already the default script).
- `pnpm audit --prod`: 9 high advisories (multer, path-to-regexp via Nest; deepmerge-ts via Prisma) fixed by moving Nest to 11.2.8 and pnpm overrides; audit now clean.

- E2E reseeds the local demo tenants (synthetic data only).
- Known limitations are listed in the README.

## Next

See README "Future roadmap".

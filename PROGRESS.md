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

## Phase 2 — Midnight Edition redesign

| # | Milestone | Verification | Commit |
| --- | --- | --- | --- |
| M1 | UX audit, redesign plan, 22 baseline screenshots | `docs/UI_REDESIGN_PLAN.md`, `docs/screenshots/before-redesign/` | `6cf8828` |
| M2 | Tokens, typography, WorkMesh mark family | tsc, ESLint, Vitest 16/16, browser check | `0383b8f` |
| M3 | Navy collapsible shell, motion system, mobile drawer | Vitest 16/16, Playwright 9/9, 1440 + 390 px browser check | `1eff660` |
| M4 | Component library, login redesign | Playwright 9/9, headless screenshots inspected | `cfd9607` |
| M5 | Employee home, Team Pulse 2.0, leadership command center | Playwright 9/9 (journeys updated to report cards) | `1a2a693`, `6f7ff1e`, `da77714`, `c1f1c2f` |
| M6 | Company Map navy canvas + camera focus; Dependency Impact mode | Vitest, screenshots inspected | `501acff`, `918b570` |
| M7 | Animated tabs/segmented controls; grouped notifications | Playwright 9/9 | `45f8f97`, `c58705d` |
| M8 | Responsive coverage 1920–390 px incl. 1024, 12 pages + login | `e2e/responsive.spec.ts` 2/2 | `d68970c` |
| M9 | Getting-started guide | +2 Vitest (18/18) | `3f79f62` |
| M10 | 24 Midnight Edition screenshots, docs | `make screenshots`, `make docs-check` | `95a241b`, (this commit) |

No new API endpoints were needed: every chart is built from the existing permission-filtered
dashboard payloads (`/dashboard/employee`, `/dashboard/manager`, `/dashboard/leadership`, `/dependencies`).

## Ask the Mesh — permission-safe copilot (fork feature)

Design and threat model: [docs/COPILOT.md](docs/COPILOT.md). Off by default (`COPILOT_ENABLED=false`).
Branch `feat/ask-the-mesh`.

| # | Milestone | Verification | Commit |
| --- | --- | --- | --- |
| C0 | Recon, design, tool → service map, threat model, phase plan | Baseline (2026-11-12, Node 26.8.2): core 91/91, API 54/54, web 18/18; lint 0 errors; typecheck clean; `make docs-check` 7/7 | `0bdaded` |
| C1 | Permission-safe read-only tool layer: facade bound to the request's AuthContext, 8 tools, per-call `READ ONLY` tenant transactions, citation ledger, DEMO-only tool endpoint, `pnpm copilot:try` via real login | API 84/84 (+6 unit, +24 integration: per-persona parity, Atlas ≡ made-up name, Noah isolation, canaries with positive controls, read-only, gating); mutation check: a fabricated field fails parity for every persona; CLI run live as Maya/Daniel/Priya/Elena/Sam/Noah; logs carry metadata only | `49b1dc5` |
| C2 | Agent loop and `POST /api/copilot/ask`: provider interface with fake / ollama / anthropic (`@anthropic-ai/sdk` 1.3.0, pinned), rules-based system prompt, untrusted tool-result envelope, server-side citation validation and hrefs, tool budget and timeout, `--ask` CLI | API 110/110 (+13 unit, +13 integration incl. rate limit), all on the fake provider; live: CLI `--ask` as Daniel/Maya/Priya with the fake provider, a clean 503 with Ollama absent; logs carry metadata only | `a9f72a4` |
| C3 | Ask the Mesh web UI: page, sidebar entry, ⌘K actions, per-workspace suggestions from `GET /api/copilot/status`, citation chips, loading/error/empty/off states, safe Markdown subset, reduced motion, keyboard and screen-reader support | Web 30/30 (+12), API 111/111 (+1), Playwright 12/12 (+3 Journey H; `/ask` in the responsive sweep); found and fixed by tests: citation markers linked to the wrong anchor, and the palette hid "No results you have access to." (Journey G); browser check at 1440 px and 375 px | (this commit) |

Local environment notes (no repo changes):
- Node 25+ ships a built-in `localStorage` that shadows jsdom's and breaks zustand `persist` in web tests;
  run with `NODE_OPTIONS=--no-experimental-webstorage` (CI uses Node 22 and is unaffected).
- The Prisma CLI reads `apps/api/.env`, not the root `.env`; export the root `.env` into the shell
  (`set -a; source .env; set +a`) before `make migrate`/`make seed`. Run `prisma generate` before the first seed.
- corepack isn't bundled with Node 25+; `make … PNPM="npx --yes corepack pnpm"` works without a global install.

## Known issues / notes

- Integration suites share one test database and must run serially (`--runInBand`, already the default script).
- `pnpm audit --prod`: 9 high advisories (multer, path-to-regexp via Nest; deepmerge-ts via Prisma) fixed by moving Nest to 11.2.8 and pnpm overrides; audit now clean.

- E2E reseeds the local demo tenants (synthetic data only).
- Known limitations are listed in the README.

## Next

See README "Future roadmap".

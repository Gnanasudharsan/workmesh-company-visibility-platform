# WorkMesh — Midnight Edition redesign plan

Baseline captured 2026-11-09 in `docs/screenshots/before-redesign/` (22 real screenshots). Baseline tests: core 91, web 16, API 54 — all passing.

## 1. What makes the current UI feel basic

| Problem | Where it shows | Why it hurts |
| --- | --- | --- |
| Uniform white cards on a near-white canvas | every page | No focal point; everything has equal weight |
| Generic blue primary (`#2563EB`) | buttons, links, active nav | Indistinguishable from countless admin templates |
| Light sidebar with a white "pill" for the active item | shell | Navigation and content blend; weak brand presence |
| Stat rows of identical number cards | Team Pulse, Projects, Blockers, Leadership | Numbers without context, trend or explanation |
| Dense tables with truncated text | Team Pulse, admin | Hard to scan; row actions reduced to tiny icons |
| Oversized native selects for filters | Team Pulse, map, roadmap | Filters dominate the page instead of the data |
| Same blue badge for stages and statuses | updates, Team Pulse | "Blocked" stage looked identical to "Development" |
| One chart in the whole product | Leadership | Missed opportunities to explain portfolio, blockers, goals |
| Company Map on a pale canvas, small nodes | map, dependencies | The signature feature doesn't feel like one |
| Login is a form next to a pale gradient | login | Weak first impression |
| No motion system | everywhere | Page changes and data loads feel abrupt |
| No guidance for first-time users | — | Interns must discover workflows alone |

## 2. Visual direction — "a living map of your company"

Hybrid, not a dark app: **midnight navy** for navigation, heroes and graph canvases; **porcelain** workspace; **white** data cards; **electric teal** for interaction and live connections; **violet** and **amber** for data series and attention.

| Token | Value | Use |
| --- | --- | --- |
| `navy-950` | `#091B2D` | sidebar, heroes, graph canvas |
| `navy-900` | `#12324A` | elevated dark cards, dark hover |
| `porcelain` | `#F7F8F5` | page canvas |
| `surface` | `#FFFFFF` | cards, dialogs, tables |
| `teal` | `#37D5C3` | accents on dark, primary button fill (navy text, 10:1) |
| `teal-ink` | `#0B7A6E` | teal text/links on light (≥ 4.5:1) |
| `violet` | `#9D87F5` | secondary series, project/goal relationships |
| `amber` | `#F4AD69` | attention, schedule risk |
| status | success / progress / waiting / blocked / overdue / done / unknown | always paired with icon + text |

Typography: **Geist Variable** for UI and tabular metrics, **Space Grotesk Variable** for display headings and hero metrics, **Geist Mono** for project keys. 4 px spacing scale.

## 3. Component changes

New reusable components in `apps/web/src/components/ui` and `components/brand`:
`MidnightHero`, `BentoGrid`, `MetricCard`/`AnimatedMetric`, `ProgressRing`, `StatusPill`, `SectionHeading`, `ChartCard` (title, explanation, legend, empty/error/loading states), `Donut`, `SegmentedBar`, `InteractiveTimeline`, `TeamMemberCard`, `BlockerCard`, `QuickAction`, `ContextDrawer`, `Skeleton` variants, `MeshMark` logo family, `LivingMesh` decorative SVG network, `ContributionMap` (real data), `Guide` (onboarding tours).

## 4. Page priorities

1. Foundation: tokens, fonts, logo, navy shell with collapsible sidebar and animated active indicator, motion system, primitives restyled.
2. Signature: login, employee home (hero + bento + contribution map), Team Pulse 2.0 (status overview, report cards/list, blocker radar, action queue), leadership command center (portfolio donut, goal progress, department stacked bars, risks, decision center, map preview), Company Map on navy canvas with inspector.
3. Deep: projects (hero, stage stepper, grouped activity timeline), roadmaps (timeline with period control, board, dense/comfortable table), dependency explorer with Impact mode, meetings (change timeline with before/after), directory (department tiles, team cards, org position visual).
4. Supporting: notifications (grouped by day, type icons), administration (section nav, clearer inspector), settings, onboarding tours, search.
5. Refinement: charts, micro-interactions, responsive (1920/1440/1280/1024/768/390), accessibility, reduced motion, performance.
6. Delivery: tests, screenshots `docs/screenshots/midnight-edition/`, docs, CI.

## 5. Data visualisation (real data only)

| Visual | Source | Measure |
| --- | --- | --- |
| Portfolio donut | `/dashboard/leadership` | count of visible active projects by computed health |
| Department stacked bars | `/dashboard/leadership` | projects by health per owning department |
| Goal progress bars | `/dashboard/leadership` | mean computed progress of visible projects |
| Team status overview | `/dashboard/manager` | reports by freshness / blocker / help state |
| Blocker aging | `/blockers` | open blockers bucketed by days open |
| Milestone timeline | `/roadmap`, dashboards | due dates and status |
| Contribution map | `/dashboard/employee` | my work → project → initiative → goal |
| Meeting action completion | `/meetings/:id` | open vs done action items, decisions by status |

No browser-side totals over data the user didn't receive; every chart states what it measures and has an empty state.

## 6. Motion strategy

One module (`lib/motion.ts`): durations 120/200/280 ms, `ease-out-quint` curve, two springs (snappy, soft). Uses: page fade + 6 px rise, staggered section reveal, card hover lift (transform only), tab underline and nav indicator via shared layout animation, count-up metrics (once), progress fills, chart reveals, drawer slide, graph node reveal and camera `fitView`/`setCenter` with duration. The decorative login mesh drifts via CSS transforms only. Everything is disabled under `prefers-reduced-motion` (CSS rule + `useReducedMotion`). No perpetual effects on data screens; pulses only on real selection or real events.

## 7. Accessibility requirements

AA contrast for all text (teal text uses `teal-ink`), visible focus rings on light and dark surfaces, status never color-only, charts with text summaries, graph text-tree alternative kept, dialogs/drawers keep Radix focus management, keyboard-operable sidebar collapse and tours, reduced motion.

## 8. Testing strategy

Keep all existing suites green; update E2E selectors only where copy changed. Add: component tests (StatusPill, AnimatedMetric reduced-motion, ChartCard empty state, Sidebar collapse), Playwright visual journeys (dashboards, map interactions, roadmap views, composer, blocker workflow, meeting brief, mobile nav, chart empty states), responsive overflow check extended to 1024 px, reduced-motion run.

## 9. Milestones (each committed and pushed)

1. Plan + baseline screenshots
2. Tokens, typography, logo
3. Shell (sidebar, top bar, palette) + motion system
4. Component library
5. Login
6. Employee home
7. Team Pulse 2.0
8. Leadership command center
9. Company Map
10. Projects + roadmaps
11. Dependency explorer
12. Meetings + directory
13. Notifications, admin, settings, onboarding tours
14. Responsive + accessibility + reduced motion
15. Tests and visual fixes
16. Screenshots, README and docs

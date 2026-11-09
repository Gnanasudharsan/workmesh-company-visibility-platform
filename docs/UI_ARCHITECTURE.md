# UI architecture — Midnight Edition

The web app (`apps/web`) is a Next.js App Router client. Every screen reads data through the
authorized API (`lib/api.ts` → TanStack Query via `useApi`). **The UI never decides what a user may
see**: navigation filtering, hidden buttons and chart contents all derive from data the server has
already authorized. Hiding something in the browser is a convenience, never a control.

## Layers

```
app/(auth)/*            Sign-in, registration, invitations (navy Living Mesh panel)
app/(app)/layout.tsx    Authenticated shell: Sidebar + Topbar + PageTransition + CommandPalette
app/(app)/*             Workspaces and pages
components/shell        Sidebar, Topbar, WorkspaceSwitcher, CommandPalette, Logo family
components/midnight     Signature components (heroes, data visuals, Living Mesh, guides)
components/motion       Motion primitives (PageTransition, Reveal, AnimatedNumber)
components/ui           Primitives: Button, Badge/StatusPill, Card/Stat, overlays, forms, feedback
components/map          Company Map node renderers, ELK layout, inspector, list alternative
components/work         Domain cards and dialogs (updates, blockers, projects, pickers)
lib/motion.ts           Motion vocabulary (durations, easing, springs, variants)
lib/store.ts            UI-only state (workspace, sidebar, palette, recents, getting-started)
```

## Shell

- **Sidebar** (`components/shell/sidebar.tsx`): navy, collapsible (72 px ↔ 256 px, persisted in
  `useUi`), with groups Overview · Explore · Execution · Workspace. Items requiring a workspace
  (`manager`, `lead`, `leadership`, `admin`) appear only if the server's `/auth/me` grants it. The
  active item has a teal indicator that slides between items using a shared `layoutId`. Collapsed
  items keep their accessible names (screen-reader labels) and gain tooltips.
- **Top bar**: breadcrumb, inline search trigger (⌘K), live-connection pill, Create menu,
  notifications popover and account menu. On < 1024 px the sidebar becomes a navy slide-in drawer.
- **Command palette** (cmdk): server-authorized search results, recents and jump-to pages.

## Signature components (`components/midnight`)

| Component | Purpose | Data |
| --- | --- | --- |
| `MidnightHero`, `HeroMetric` | Navy command surface at the top of Home, Leadership | Real counts from dashboard endpoints |
| `QuickAction` | Shortcut tiles | Every tile navigates or opens a working dialog |
| `LivingMesh` | Decorative signature SVG (login, heroes, map entry card) | None — `aria-hidden`, never presented as activity |
| `ContributionMap` | Task → Project → Initiative → Goal with hover-to-trace | `/dashboard/employee` |
| `ProgressRing`, `Donut`, `Legend`, `SegmentedBar`, `BarRow` | Dependency-free visuals | Caller passes real values; each exposes a text summary |
| `GettingStarted` | First-run guide | Completes from a published update or having opened a view |

## Pages redesigned

| Page | Highlights |
| --- | --- |
| Login | Light form + navy Living Mesh panel; password visibility toggle; demo personas only when the API runs in demo mode |
| Home (employee) | Navy hero with real counts and last update, quick actions, getting-started guide, contribution map, bento of assignments/blockers/milestones/goals |
| Team Pulse | "Your Team, At a Glance" status donut, metric tiles, report cards with a list alternative, blocker radar by severity, action queue, deadline timeline |
| Leadership | Command center hero, goal cards with rings and initiative progress, portfolio donut, department health bars, strategic milestone timeline, decision center, ownership gaps |
| Company Map | Navy canvas, glass nodes, state-colored edges, camera focus on selection, white inspector, list alternative |
| Dependencies | Navy canvas with metric strip; **Impact mode** dims everything except confirmed problems and what they can reach |
| Notifications | Grouped by day, type icons, unread shown by weight + tint + labelled dot |
| All other pages | Re-themed through tokens: cards, stats, headers, tabs (animated underline), segmented controls (sliding pill), skeletons, empty states |

## Data visualisation rules

1. Charts render only values received from the API for the current user. No totals are computed
   from data the user did not receive; Team Pulse's status donut classifies the reports the manager
   was already sent, using what those people chose to share (blocker, help request, freshness).
2. Every chart has a legend with numbers and an accessible summary.
3. "Freshness" describes information, never people. WorkMesh measures no activity volume.

## Accessibility

- Visible focus everywhere (teal ring on navy via `.on-navy`), skip link, landmark roles.
- Status = icon + text + color. Unread = weight + tint + labelled dot.
- Graph views ship an accessible list alternative (`MapList`, Team Pulse list view).
- Reduced motion respected in CSS and every motion component.

## Testing

- Vitest: navigation permission filtering, badges, composer, map list + ELK layout, getting-started guide.
- Playwright journeys A–G exercise the redesigned pages end to end.
- `e2e/responsive.spec.ts`: no horizontal overflow at 1920/1440/1280/1024/768/390 px on 12 pages plus login,
  mobile drawer navigation and visible keyboard focus.
- `e2e/screenshots.capture.ts`: regenerates [the gallery](SCREENSHOTS.md).

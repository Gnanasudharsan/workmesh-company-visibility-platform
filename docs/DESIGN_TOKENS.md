# Design tokens — Midnight Edition

Every color, radius, shadow, duration and easing used by the web app is a Tailwind 4 `@theme` token in
[`apps/web/src/app/globals.css`](../apps/web/src/app/globals.css). Components never hard-code hex values,
except where a third-party renderer needs literal colors (React Flow edge strokes); those use the same
values listed here.

## Color

| Group | Token | Value | Use |
| --- | --- | --- | --- |
| Navy | `navy-950` | `#091B2D` | Sidebar, heroes, map canvas, primary buttons |
| | `navy-900` | `#12324A` | Raised navy surfaces, map nodes |
| | `navy-800` / `navy-700` | | Hover and pressed states on navy |
| | `navy-line` | | Hairlines on navy |
| | `navy-text` / `navy-muted` / `navy-faint` | `#E8EEF4` / `#9BB2C6` / … | Text on navy |
| Workspace | `canvas` | `#F7F8F5` | Porcelain page background |
| | `surface` | `#FFFFFF` | Cards |
| | `subtle` / `sunken` | | Tracks, inset areas, skeletons |
| | `line` / `line-strong` | | Borders |
| Text | `ink` / `ink-soft` / `muted` / `faint` | `#0B1B2B` … | Text hierarchy (`faint` only for non-essential hints) |
| Accent | `teal` / `teal-bright` | `#37D5C3` | Accent on navy, accent buttons, active indicators |
| | `teal-ink` | `#0B7A6E` | Teal text and links on light surfaces (AA) |
| | `teal-soft` | `#E2F7F3` | Tinted backgrounds |
| | `violet-bright` / `violet` / `violet-soft` | `#9D87F5` / `#6A52D6` | Goals, decisions, secondary accent |
| | `amber-bright` | `#F4AD69` | Unread badges, milestones, at-risk dependencies on navy |
| | `coral` | `#F07167` | Blocked states on navy |
| Semantic | `success`, `info`, `warning`, `danger` (+ `-soft`, `-ink`) | | Status pills, health, alerts |
| | `unknown` | | Not started / no data |
| Graph | `graph-person` … `graph-risk` | | Company Map entity accents |
| Charts | `chart-1` … `chart-6` | | Categorical chart series |

**Status is never conveyed by color alone.** Every status pill carries an icon and a text label;
charts pair each segment with a legend entry and an accessible text summary (`role="img"` +
`aria-label` listing every value).

## Typography

| Token | Family | Use |
| --- | --- | --- |
| `--font-sans` | Geist Variable | UI text |
| `--font-display` | Space Grotesk Variable | `h1`, hero titles, large numbers (`.font-display`) |
| `--font-mono` | Geist Mono Variable | Project keys, shortcuts |

Fonts are self-hosted via `@fontsource-variable/*` — no external font requests. Numbers use
`tabular-nums` so counts don't jitter while animating.

## Shape and depth

| Token | Value |
| --- | --- |
| `--radius-control` | 10px — inputs, buttons, segmented controls |
| `--radius-card` | 16px — cards |
| `--radius-panel` | 20px — heroes, map canvas |
| `shadow-card`, `shadow-raised`, `shadow-overlay`, `shadow-glow` | Resting, hover, dialogs, selected map node |

## Motion

| Token | Value |
| --- | --- |
| `--duration-fast` / `base` / `slow` | 120 / 200 / 280 ms |
| `--ease-out-quint` | `cubic-bezier(0.22, 1, 0.36, 1)` |
| JS springs (`lib/motion.ts`) | `SPRING.snappy` (indicators), `SPRING.soft` (panels) |

Only `transform` and `opacity` animate. `prefers-reduced-motion: reduce` disables CSS animations
globally, and every motion component checks `useReducedMotion()` and renders its final state
directly (counts show their value, rings and bars appear filled, the map camera jumps).

## Utilities

- `.surface-midnight` — navy gradient with soft teal/violet glows for heroes and canvases.
- `.on-navy` — switches focus rings to teal for keyboard users on dark surfaces.
- `.skeleton` — shimmer placeholder.
- `.grid-dots` — dotted background.

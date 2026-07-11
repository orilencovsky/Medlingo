# MedLingo UI Redesign — "Clinical Calm" Design System + Dashboard Hub

**Date:** 2026-07-12
**Status:** Approved (pending spec review)

## Goal

Give MedLingo a cohesive, professional visual identity ("Clinical Calm") and
turn the Home page into a real dashboard hub that surfaces every feature. Ship a
small design-token + component layer on Tailwind v4 and restyle all pages on top
of it. No behavioural/data changes — this is presentation only, reusing data the
app already loads.

## Design direction — "Clinical Calm"

Serious, trustworthy, medical. Measured colour, generous white space, clean
type. Chosen over a gamified or cool-neutral look because the audience is
practising clinicians and "professional" was the explicit ask.

### Tokens (Tailwind v4 `@theme` in `src/index.css`, exposed as CSS variables)

Light theme now; variables named semantically so a dark theme can be added later
without touching components (dark is out of scope for this pass).

- **Primary (teal):** `--color-primary: #0f766e`, `--color-primary-strong: #155e63`, `--color-primary-tint: #ecfdf5`, `--color-primary-soft: #99d2cc`
- **Ink (slate):** `--color-ink: #0f172a` (headings), `--color-ink-muted: #475569` (body), `--color-ink-subtle: #64748b` (labels)
- **Surface:** `--color-bg: #f1f5f6`, `--color-surface: #ffffff`, `--color-border: #e2e8f0`, `--color-track: #eef2f4`
- **Accent:** `--color-amber: #f59e0b` (streak), `--color-info: #0369a1` / `--color-info-bg: #f0f9ff` (in-progress)
- **Radius:** `--radius-sm 8px / -md 12px / -lg 16px / -xl 20px`
- **Shadow:** `--shadow-card 0 1px 2px rgba(15,23,42,.04)`, `--shadow-raised 0 6px 16px rgba(15,118,110,.25)` (primary CTA)
- **Type scale:** 20/17/15/13/11 px with weights 800 (display), 700 (heading), 600 (label), 400 (body); system font stack (no web-font dependency).
- **Spacing:** Tailwind default 4px grid.

### Icons

Adopt **`lucide-react`** (single lightweight dep, tree-shakeable, RTL-mirrorable).
Replaces ad-hoc emoji. Emoji stay only where they are content, not UI (e.g. 🔥
streak may remain or become a lucide `Flame` — implementer picks one and is
consistent). Directional icons (chevrons, arrows) flip under RTL.

## Shared component set

New `src/components/ui/` — small, single-purpose, presentational, each with one
responsibility and a typed prop interface:

- `Button` — variants `primary` (filled teal), `secondary` (outline), `ghost`; sizes `md`/`sm`; optional leading icon; renders `<button>` or, via `as`, a router `Link`.
- `Card` — surface container (radius-lg, border, shadow-card, padding); optional `interactive` (hover state) and `muted` (dimmed, for locked/not-started).
- `StatTile` — icon + value + label; optional `emphasis` (primary colour) and `as`-link.
- `ProgressBar` — single fill; props `value` (0–100), `tone` (`primary`/`success`).
- `SegmentedBar` — the combined overall bar: `covered` and `mastered` percentages rendered as two nested fills (mastered dark, covered soft) in one track, RTL-anchored (`inset-inline-start`).
- `PageHeader` — logo + `LanguagePicker` + profile avatar; used across pages.
- `SectionTitle` — heading + optional trailing action link.

`StatsStrip` is refactored to compose `StatTile`. `He` is unchanged.

## Dashboard hub (`HomePage`)

Vertical, mobile-first, RTL. Sections top-to-bottom:

1. **PageHeader** — logo, language switcher, profile avatar.
2. **Greeting** — "שלום, {display_name}" + one-line due summary.
3. **Overall progress (`SegmentedBar`)** — hero card. `covered%` (light) and `mastered%` (dark) nested in one track, with a legend showing both counts and the course total. Definitions below.
4. **Stat tiles** — streak / due today / mastered / learned (existing values via `StatTile`). Due tile links to `/review`.
5. **Daily review CTA** — filled primary card: due count + rough time estimate; links `/review`. In the caught-up state it collapses to the existing "all caught up" + extra-practice, styled.
6. **AI drill card** — icon + title + "new" badge + one-line description; links `/drill`. Rendered only when `drillEnabled()` (existing flag) — keeps parity with the current gating.
7. **Units** — `SectionTitle` + a `Card` per unit: state icon, title, per-unit coverage `ProgressBar` + `covered/total · N%`, draft badge for admins.

### Metrics (all reuse already-loaded data — no new queries)

Let `entryIds` = distinct entry ids across all **published** units (from the
existing `loadUnitEntryIds`, filtered to published units), `total = |entryIds|`.
From already-loaded `cards`:

- **covered** = entries with `reps > 0`. `coveredPct = round(100·covered/total)`.
- **mastered** = entries with `state === 'review' && stability >= 7` (the existing `KNOWN_STABILITY_DAYS`). `masteredPct = round(100·mastered/total)`.
- Invariant `mastered ≤ covered ≤ total`; the segmented bar draws mastered over covered so nesting always holds.
- `total === 0` → both 0%, empty track (new user).

Per-unit bars keep the current coverage definition (unchanged).

## Other pages (restyle on the same tokens/components)

Presentation only, no logic changes:

- **AuthPage / OnboardingPage** — centered `Card`, `PageHeader` (logo only), `Button` primary; labelled inputs.
- **UnitPage** — exercise shells (`Cloze`/`Recognition`/`Recall`/`Feedback`) reflow to `Card` + `Button` tiles; progress/step indicator; keep `He` usage and all exercise logic.
- **ReviewPage** — session UI and summary on `Card`; verdict rows use tokens; the drill link stays flag-gated.
- **DrillPage** — chat bubbles, coaching panel, and summary restyled with tokens; disclaimer kept prominent; Hebrew via `He`.

## RTL & responsive

- All directional spacing/positioning uses logical properties (`inset-inline`, `ms/me`, `ps/pe`), never physical `left/right`. The i18n review already confirmed the codebase is free of physical directional classes — keep it that way.
- Directional icons mirror under `dir="rtl"`.
- Mobile-first: single column ≤ 640px; from `sm` up, stat tiles and unit cards may use wider spacing / two-column where it reads better. Content max-width caps the layout on desktop.

## Out of scope

- Dark mode (tokens are structured for it; not built/tested this pass).
- Any data model, SRS, routing, or backend change.
- New product features (this surfaces existing ones).
- Content changes.

## Testing

- Component unit tests (Vitest + Testing Library) for each `ui/` component: variants render, `SegmentedBar` nests mastered ≤ covered and clamps, `ProgressBar` clamps 0–100, `Button` `as`-link navigates.
- `HomePage` tests extended: overall bar computes covered/mastered/total from mocked cards + entryIds (incl. `total===0`), drill card respects the flag, all sections present.
- Existing page tests updated for new markup while preserving their behavioural assertions (testids kept stable where tests depend on them).
- Visual pass in the browser preview at mobile width, RTL (he) and LTR (en), including an Arabic RTL check.
- Full suite + `tsc -b` green.

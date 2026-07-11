# Learner Dashboard on HomePage — Design

**Date:** 2026-07-11
**Status:** Approved (pending spec review)
**Scope:** Learner-facing only. Admin dashboard is a separate future feature.

## Goal

Consolidate the learner's progress signals into a clear dashboard at the top of
HomePage, and add per-unit progress bars to the unit list. Everything is derived
from data that already exists; no schema changes, no new routes, no new tables.

## Background

HomePage already computes and displays streak, "words learned", "words known",
per-unit status badges, and a due-count on the review CTA — but scattered, not
presented as a coherent dashboard. Unit progress is only a 3-state enum
(`unit_progress.status`); there is no percentage.

## Design

### Stats strip

A row of four stat tiles rendered at the top of HomePage, above the unit list:

| Tile | Source | Notes |
|---|---|---|
| Streak | `profiles.streak_current` | already loaded via `loadProfile` |
| Words due today | count of `loadDueCards()` result | tapping the tile navigates to ReviewPage |
| Words mastered | cards with `state === 'review' && stability >= 7` days | reuses the existing `KNOWN_STABILITY_DAYS = 7` definition ("words known") |
| Words learned | cards with `reps > 0` | already computed on HomePage |

All four values come from data HomePage already fetches (`loadProfile`,
`loadAllCards`, `loadDueCards`). No additional network requests for the tiles.

### Per-unit progress bar

Each unit card in the list gains a progress bar showing **coverage**:

```
percent = (unit entries with user_card_state.reps > 0) / (total unit_items) × 100
```

Implementation: fetch `unit_items` (entry_id per unit_slug) once, join
client-side against the already-loaded `user_card_state` rows. This is the only
new query. The existing status badge (not started / in progress / completed)
stays alongside the bar.

Rationale for coverage over mastery (stability threshold): rewarding-fast,
matches the `in_progress` semantics already in `unit_progress`, and cheap to
compute. Mastery-based percentage was considered and rejected for the main bar;
it may return later as a secondary indicator.

### Edge cases

- Unit with 0 items → 0%, no division by zero.
- All items covered → 100% even if `unit_progress.status` is still
  `in_progress` (status flips on the existing completion flow, not from this bar).
- No card state at all (new user) → all bars 0%, due-today 0, mastered 0.

### i18n

New strings (tile labels) added to all four locale files. `en` required;
`ar`/`ru`/`fr` translated best-effort per pilot policy (en fallback allowed).

### Testing

Extend `src/pages/HomePage.test.tsx`:
- tile values computed correctly from mocked card states,
- unit percentage: 0 items, all done, none started, partial,
- due-today tile navigates to review.

## Out of scope

- Admin/content dashboard (separate feature).
- Charts, history graphs, review-log analytics.
- Mastery-based unit percentage.
- Any schema or backend change.

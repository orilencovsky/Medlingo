# MedLingo — Engineering Onboarding

## The idea

MedLingo teaches medical Hebrew to immigrant clinicians (olim physicians/nurses) working in
Israeli healthcare. Core loop: learn 10–15 words/phrases in a realistic clinical scenario
("unit") → spaced-repetition review (FSRS) on a daily streak. Pilot success metric is
**retention**, not feature breadth — a handful of real clinicians completing one unit and
returning across several days proves the format works.

Content is authored by a language-expert partner as git-versioned TSVs (never touches the app
or DB directly); a script imports it into Supabase. `id` is permanent identity — content fields
can be corrected in place without losing a learner's review history.

Full product spec (34-finding-reviewed): [docs/superpowers/specs/2026-07-10-medlingo-pilot-design.md](superpowers/specs/2026-07-10-medlingo-pilot-design.md).
Revised MVP direction (audio + voice + game mechanics move into scope): [docs/superpowers/specs/2026-07-17-medlingo-mvp-vision-update.md](superpowers/specs/2026-07-17-medlingo-mvp-vision-update.md).
Implementation plans: [docs/superpowers/plans/](superpowers/plans/).

## Stack

- **Frontend**: Vite + React + TypeScript SPA, Tailwind
- **Backend**: Supabase (Postgres, eu-central-1) — Postgres RLS is the authorization layer,
  no separate API server
- **Auth**: Supabase magic link + Google OAuth
- **Hosting**: Cloudflare Pages, continuous deploy from `main` → https://medlingo.pages.dev
- **Scheduling**: `ts-fsrs` (pinned version, fuzz disabled) — card state is recomputable from
  `review_logs` + pinned config, so it's a cheap correctness check
- **Content pipeline**: `content/dictionary.tsv` + `content/units/*.tsv` → `scripts/import-content.ts`
  (zod-validated) → Supabase, idempotent upsert by `id`

## Repo & environment

- `github.com/orilencovsky/Medlingo`, local clone at `~/Desktop/Medlingo`
- `npm run dev` — local dev server · `npm test` — vitest · `npm run test:e2e` — Playwright
- `npm run import:content` — reimport `content/` into Supabase (needs `.env.content` with
  `DATABASE_URL`) · `npm run metrics` — pilot retention SQL views · `npm run verify:rls`

## Status as of 2026-08-03

- **Phase 1 (core loop) shipped and live**: auth, onboarding, FSRS-scheduled review, streak,
  offline support
- **Dictionary**: 2122 entries — grew roughly 2x since 2026-07-18 with a second batch of 935
  partner word-list entries (AI-enriched). 101 entries carry `category = medical_loanword`. Still
  needs a broad language-expert review pass; a review spreadsheet is out with the content partner.
- **Medical-loanword study area**: widely-used foreign-origin clinical terms written in Hebrew
  script (ספסיס/sepsis, קרפיטציות/crepitations), each with its formal Hebrew equivalent in
  `everyday_synonym` where one exists. See
  [docs/superpowers/plans/2026-07-18-medical-loanword-area.md](superpowers/plans/2026-07-18-medical-loanword-area.md).
- **4 units, all `published`** (`unit-01-intake`, `unit-02-vitals`, `unit-03-physical-exam`,
  `unit-04-discharge-meds`) — all level 1, unchanged since 2026-07-18. Publish/retire = flip
  `status` in `content/units.tsv` + reimport.
- **Phase 2 (AI-backed drill practice)** — built (Edge Function, streaming, UI, e2e); gated
  behind `VITE_ENABLE_DRILL` — confirm it is enabled in production. See
  [docs/superpowers/plans/2026-07-10-medlingo-pilot-phase2-drill.md](superpowers/plans/2026-07-10-medlingo-pilot-phase2-drill.md).
- **Dictionary tab + moderated reviewer console** (shipped 2026-07-18): learners can browse the
  full dictionary outside of unit review; `is_admin` accounts get a moderation console for
  content corrections. See
  [docs/superpowers/plans/2026-07-18-dictionary-tab-and-reviewer-console.md](superpowers/plans/2026-07-18-dictionary-tab-and-reviewer-console.md).
- **Dictionary topics** (shipped 2026-07-19): browse dictionary entries grouped by clinical
  subject area (`TopicPage`). See
  [docs/superpowers/plans/2026-07-19-dictionary-topics.md](superpowers/plans/2026-07-19-dictionary-topics.md).
- **Anatomy tab** (shipped 2026-07-20): learner-facing and admin anatomy browsing with
  dual-source images (`AnatomyPage` / `AdminAnatomyPage`). See
  [docs/superpowers/plans/2026-07-20-anatomy-tab.md](superpowers/plans/2026-07-20-anatomy-tab.md).

## Data model (core tables)

`dictionary_entries` (incl. optional `category` study-area tag — first value `medical_loanword`),
`units`, `unit_items` (unit ↔ dictionary + context sentences), `user_card_state`,
`review_logs` (append-only), `profiles` (incl. `is_admin`), `unit_progress`.
RLS: signed-in users read published units + their own state; `is_admin` also reads drafts.

## Revised MVP direction (2026-07-17)

The owner's updated MVP note widens the vision toward **speaking** professional Hebrew:
audio (hear the word), a **voice conversation** that opens each unit, and light **game
mechanics** (Wordle-/Scrabble-style, rewards) alongside streaks. These three were "out of
scope, seams designed in" in the 2026-07-10 spec and are now planned features. The core
loop (learn-a-unit → FSRS review → drill) is unchanged. Full write-up:
[docs/superpowers/specs/2026-07-17-medlingo-mvp-vision-update.md](superpowers/specs/2026-07-17-medlingo-mvp-vision-update.md).

## Where to plug in next

1. Confirm the drill Edge Function is deployed and `VITE_ENABLE_DRILL` is on in production
2. Apply the content partner's corrections from the review spreadsheet back to
   `content/dictionary.tsv`, reimport
3. Scale content beyond the current 4-unit / ~2,100-word slice toward ~3,000 words across
   3 levels and more units
4. **New scope** — write per-feature plans for audio/pronunciation, then voice conversation,
   then one game surface (see the 2026-07-17 vision update)

## Access this partner needs (owner grants manually — not code)

- [ ] GitHub repo collaborator
- [ ] Supabase project member
- [ ] Google Drive folder `MedLingo/` (content spreadsheets)
- [ ] Cloudflare Pages project (only if deploy config changes are needed)

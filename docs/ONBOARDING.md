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

## Status as of 2026-07-11

- **Phase 1 (core loop) shipped and live**: auth, onboarding, FSRS-scheduled review, streak,
  offline support, one **published** unit (`unit-01-intake`)
- **Dictionary**: 1097 entries (12 dev-sample + 1085 imported from the partner's word list,
  AI-enriched — nikud/POS/level/gender/plural/root/English). Needs a language-expert review
  pass; a review spreadsheet is out with the content partner. Known gap: no entry yet for
  "side effect" (תופעת לוואי).
- **3 more units authored as `draft`** (vitals, physical exam, discharge/meds) — visible only
  to `is_admin` accounts for preview; publish = flip `draft`→`published` in `content/units.tsv`
  + reimport.
- **Phase 2 (AI-backed drill practice)** — built (Edge Function, streaming, UI, e2e); gated
  behind `VITE_ENABLE_DRILL` — confirm it is enabled in production. See
  [docs/superpowers/plans/2026-07-10-medlingo-pilot-phase2-drill.md](superpowers/plans/2026-07-10-medlingo-pilot-phase2-drill.md).

## Data model (core tables)

`dictionary_entries`, `units`, `unit_items` (unit ↔ dictionary + context sentences),
`user_card_state`, `review_logs` (append-only), `profiles` (incl. `is_admin`), `unit_progress`.
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
3. Publish the remaining draft units once admin-reviewed in-app
4. Scale content beyond the current ~1,100-word slice toward ~3,000 across 3 levels
5. **New scope** — write per-feature plans for audio/pronunciation, then voice conversation,
   then one game surface (see the 2026-07-17 vision update)

## Access this partner needs (owner grants manually — not code)

- [ ] GitHub repo collaborator
- [ ] Supabase project member
- [ ] Google Drive folder `MedLingo/` (content spreadsheets)
- [ ] Cloudflare Pages project (only if deploy config changes are needed)

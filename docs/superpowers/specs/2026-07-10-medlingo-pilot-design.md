# MedLingo — Pilot Design

**Date:** 2026-07-10
**Status:** Approved design, pending implementation plan

## 1. Overview

MedLingo teaches **medical Hebrew** to immigrant clinicians in Israel — new olim physicians and nurses, and foreign medical graduates beginning to work in Israeli healthcare. The platform is language-flexible by design but launches Hebrew-first. Learner support languages: English, Arabic, Russian, French.

**Entry assumption:** learners read Hebrew script and have basic conversational Hebrew (roughly ulpan aleph/bet). MedLingo teaches the *medical layer*, not general Hebrew.

**Tone:** serious and professional, faithful to Hebrew medical terminology, with light gamification (streaks, progress, mastery) — no mascots, leaderboards, or lives.

### Pilot scope

The pilot is the **first real slice of the full platform** — nothing is throwaway:

- One complete situation-based learning unit: a clinical scenario with 10–15 new words/phrases taught in context.
- A spaced-repetition review system with three practice forms: flashcards, contextual cloze, AI free-form drill.
- Real user accounts and per-user learning history.
- The full-course data model from day 1 (dictionary of eventually ~3,000 manually-authored entries across 3 levels).
- English UI only, but fully i18n-ready (every string through the i18n layer; all four translation fields in the data model).

### Pilot success criteria

A handful of real target users (immigrant clinicians) **complete the unit and return across several days** for review sessions, and report that the format works. Retention is the key signal; reliability and low-friction daily mobile use matter more than polish.

### Explicitly out of pilot scope (roadmap, seams designed in)

- Audio/listening exercises and voice simulation
- Written/voice simulation of medical intake (anamnesis)
- Social practice between learners
- Additional units, levels 2–3 content, non-English UI
- SEO/marketing landing pages

## 2. Decisions log

| Decision | Choice |
|---|---|
| Pilot framing | First real slice of the platform (accounts, real data model, i18n structure) |
| Platform | Web app, mobile-first, PWA-installable |
| Stack | Vite + React SPA + Supabase, on Cloudflare Pages (won a 3-way evaluated bake-off vs Next.js/Vercel and SvelteKit/Workers) |
| Content creation | Manually authored by owner / language professional; AI used only in the practice experience |
| Entry level | Basic Hebrew assumed (reads script, conversational basics) |
| Review forms | Flashcards + cloze-from-scenario + AI free-form drill (audio deferred) |
| Pilot UI languages | English only, i18n-ready from day 1 |
| Success metric | Real learners complete + return over several days |
| Dictionary entry fields | + grammatical info (gender/plural), + everyday/patient-facing synonym, + root (שורש, where meaningful); no transliteration |
| Repo | github.com/orilencovsky/Medlingo, local clone on Desktop |

## 3. Architecture

Four pieces; only one is custom server code.

```
┌─────────────────────────────┐
│  React SPA (Vite 8, React   │  static assets on Cloudflare Pages
│  19, TS, Tailwind, PWA)     │  (free tier, no commercial-use restriction)
└───────┬─────────────┬───────┘
        │ supabase-js │ SSE
        ▼             ▼
┌───────────────┐  ┌──────────────────────┐
│ Supabase      │  │ Supabase Edge Fn     │
│ Postgres+RLS  │◄─┤ /drill (Deno)        │──► Claude API
│ Auth (magic   │  │ JWT check, rate      │    (Haiku 4.5, prompt-cached
│ link/OTP)     │  │ limit, holds API key │     system prompt)
└───────▲───────┘  └──────────────────────┘
        │ service-role key (local only, never shipped)
┌───────┴──────────────────────┐
│ Content import script (TS)   │  per-unit TSV/CSV in git → Zod
│ validate → transactional     │  validation → idempotent upsert
└──────────────────────────────┘
```

- **SPA** talks to Postgres directly via `supabase-js`; RLS is the authorization layer. No custom backend for CRUD.
- **Supabase project in `eu-central-1`** (Frankfurt) for Israeli latency.
- **`/drill` Edge Function** is the only trusted server code: verifies the caller's JWT, loads due words from Postgres, calls Claude with the server-held `ANTHROPIC_API_KEY`, streams responses via SSE, enforces a per-user daily quota. Written as a **framework-agnostic Request/Response handler** so it can lift unchanged onto a companion service when voice arrives.
- **FSRS scheduling** runs client-side (`ts-fsrs`) for instant grading UX; the append-only `review_logs` table is the server-side source of truth from which state is always recomputable (tamper-resistant, auditable).
- **AI model:** `claude-haiku-4-5` for drill exchanges, with the shared system prompt cached (≈90% input-cost reduction). Individual calls upgradeable to Sonnet-tier with a one-line change.

### Cost profile

- Free tiers: $0 hosting (Cloudflare Pages), $0 Supabase, ~$5–15/mo Claude API at pilot scale (tens of users).
- **Recommended:** Supabase Pro at $25/mo for the pilot — the free tier pauses projects after 7 idle days and has no backups; a retention pilot must not gamble on either. (Also: the free plan caps at 2 active projects and MedBoardIL occupies one slot.)
- Total worst case comfortably under $50/mo with no scaling cliffs before hundreds of users.

## 4. Data model

All tables in Supabase Postgres with RLS. Migrations in git.

### `dictionary_entries` — the course dictionary (~3,000 entries at full scale)

| Field | Notes |
|---|---|
| `id` | stable key, referenced by units and user state |
| `hebrew` | canonical form |
| `hebrew_nikud` | vocalized form |
| `part_of_speech` | noun/verb/adjective/phrase/abbreviation |
| `level` | 1–3 |
| `gender` | ז/נ where applicable |
| `plural` | plural form where applicable |
| `root` | שורש, nullable (many medical terms are loanwords) |
| `everyday_synonym` | patient-facing register pair, nullable (e.g. clinical term ↔ what the patient says) |
| `translations` | `{en, ar, ru, fr}` — all four required from day 1 |
| `notes` | usage notes, nullable |

### `units`

Slug, level, display order, status (`draft`/`published`), title translations, and the scenario dialogue as ordered lines (speaker, Hebrew text, translations per line).

### `unit_items`

Joins a unit to its dictionary entries: `unit_id`, `entry_id`, order, and the entry's **context sentence** from the scenario (Hebrew + translations). The context sentence is the cloze source, so every word is reviewed in its clinical context.

### `user_card_state`

Per user × entry: FSRS memory state — due date, stability, difficulty, reps, lapses, state, last review. PK `(user_id, entry_id)`. RLS: owner only.

### `review_logs` (append-only)

Every review event: `user_id`, `entry_id`, timestamp, practice form (`flashcard_recognition` / `flashcard_recall` / `cloze` / `drill`), derived FSRS rating, scheduling metadata. RLS: owner may insert and read; no update/delete. **Source of truth** — card state must be recomputable from logs alone.

### `profiles`

Display name, UI language, streak counters (current, longest, last active date).

### `unit_progress`

Per user × unit: status (`not_started`/`in_progress`/`completed`), completed_at.

### `drill_usage`

Per user × date: drill message count, for rate limiting in the Edge Function.

### Access rules summary

- Signed-in users: read `dictionary_entries` and **published** `units`/`unit_items`; read/write only their own `user_card_state`, `review_logs` (insert-only), `profiles`, `unit_progress`.
- `drill_usage` written only by the Edge Function (service role).
- Content tables written only by the import script (service role, local).

## 5. Learning experience

### Learning a unit (one-time, ~15–20 min)

1. **Scenario** — learner reads the clinical dialogue (pilot: patient intake/anamnesis). New words highlighted; tapping opens a gloss (meaning, gender/plural, everyday synonym).
2. **Vocabulary introduction** — the 10–15 entries one by one as full cards: Hebrew with nikud, meaning, grammar, register pair, context sentence.
3. **Immediate practice** — a first pass over the new words (flashcards + cloze) while fresh. Words enter the SRS queue only after this.
4. **Completion** — progress feedback; words now live in the review system.

### Daily review sessions (~5–10 min)

`ts-fsrs` selects due words. Exercise form per word depends on maturity:

- **Recognition:** Hebrew term → choose meaning (4 options).
- **Recall:** meaning → produce Hebrew. Word-bank tiles for young words; typed input with forgiving matching (nikud-insensitive, final-letter-form-insensitive) for mature ones.
- **Cloze:** the word's own context sentence with the term blanked.

**Grading:** learners never see FSRS rating buttons. Rating is derived: wrong → Again, correct → Good, fast + correct → Easy.

### AI drill

Available after a review session or on demand; rate-limited to ~3 drills/day.

- Claude plays a **patient**; the learner is the clinician conducting a short written Hebrew exchange (~6–10 turns) that naturally requires the learner's due words (e.g., "שאל את המטופל על אופי הכאב").
- After each learner message: structured feedback — what was right, corrected phrasing if needed, one improvement tip — rendered as a professional coaching panel.
- Word-level outcomes append to `review_logs` (form = `drill`), feeding the SRS state.
- System prompt constrains Claude to language coaching within the scenario; a visible note clarifies the AI patient is simulated and this is language education, not clinical guidance.

### Gamification (serious-adult flavor)

Daily streak, words-learned and mastery counts, unit progress bar. Nothing else in the pilot.

## 6. Content authoring workflow

- Content lives as **spreadsheets versioned in git**: one master dictionary sheet + one small sheet per unit (dialogue lines, entry references, context sentences). The language professional edits spreadsheets, never the app or database.
- A local TypeScript import script (service-role key from local env, never shipped) validates every row with Zod — missing translation, unknown entry reference, duplicate term → hard error with row number — and **transactionally, idempotently upserts**. A validation error anywhere writes nothing.
- Units carry `draft`/`published` status: review a unit in the live app before learners can see it.

## 7. i18n and bidirectional text

Hebrew content (RTL) appears inside the LTR English UI on essentially every screen. Handled by **enforced convention**, not developer memory:

- A single **`<He>` component** wraps every Hebrew run — `dir="rtl"`, `lang="he"`, bidi isolation (`<bdi>` semantics). Used in flashcards, cloze sentences, drill chat, word lists, glosses.
- **CSS logical properties only** (`padding-inline-start`, `text-start`, …); stylelint **fails the build** on physical properties (`margin-left`, …).
- An **eslint rule flags raw Hebrew string literals** outside `<He>`.
- All UI strings through i18next `t()` from day 1 (with ICU plurals — Russian and Arabic plural rules need it later). Adding ar/ru/fr UI later = translation files + `document.dir` flip; layout mirrors automatically thanks to logical properties.
- Budget real manual QA for mixed-direction edge cases (punctuation at Hebrew/English boundaries, numerals adjacent to Hebrew) on iOS Safari and Android Chrome.

## 8. Security & error handling

- **RLS everywhere** per the access rules in §4.
- **Edge Function hardening:** JWT verification on every call; per-user daily drill quota checked in Postgres before any Claude call; input length caps. The Anthropic key exists only in Edge Function secrets.
- **Graceful degradation:** Claude down/slow → drill shows a "practice coach unavailable" state; flashcards and cloze keep working, so a daily review is never blocked by AI availability. Network drop mid-review → completed answers queue and retry; worst case a review repeats (annoying, never harmful).
- **Import safety:** transactional; partial imports impossible.
- **Offline:** full offline review is deferred; the PWA shell caches for fast loads, but reviews require connectivity in the pilot.

## 9. Testing

- **FSRS time-travel tests:** simulated clock drives learn→review sequences across virtual days; assert due dates and state transitions.
- **Recompute invariant:** rebuilding card state from `review_logs` must equal client-computed state.
- **Import fixtures:** one fixture spreadsheet per failure mode; each must fail loudly with a row number.
- **Bidi QA checklist:** manual, on iOS Safari + Android Chrome; visual snapshots of key screens.
- **One E2E path (Playwright):** sign up → learn unit → complete review session → drill with mocked Claude.
- **Drill prompt quality:** iterated manually with test transcripts during the pilot (no automated eval harness yet).

## 10. Success measurement

SQL views over `review_logs` and `unit_progress`: unit completion rate, D1/D3/D7 return rates, reviews per user-day, drill usage. Read via a query script — no admin dashboard in the pilot. Quantitative signals are complemented by direct conversations with the pilot learners.

## 11. Roadmap seams (designed now, built later)

| Future feature | Seam in this design |
|---|---|
| Voice simulation (anamnesis) | Drill handler is framework-agnostic; voice = browser↔voice-API WebRTC with ephemeral tokens minted by an Edge Function, or a small (~$5/mo) companion service. Additive, not a rewrite. |
| Written simulation | Same streaming Edge Function pattern as the drill, longer conversations. |
| Social practice | Supabase Realtime (presence + chat channels) on the platform already in use. |
| 3,000 words / 3 levels / many units | More rows + more spreadsheets; zero new infrastructure. |
| ar/ru/fr UI incl. full Arabic RTL | Translation files + `document.dir` flip; data model already carries all four languages. |
| SEO/marketing | Prerendered landing site at the root domain later; app on a subdomain. |
| Gamification depth | Streak/mastery data already captured in `review_logs`/`profiles`. |

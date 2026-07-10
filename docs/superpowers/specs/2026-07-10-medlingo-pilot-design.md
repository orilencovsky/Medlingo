# MedLingo — Pilot Design

**Date:** 2026-07-10 (rev. 2, after adversarial spec review)
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
- English UI only, but fully i18n-ready (every string through the i18n layer; all four translation columns in the data model — see §4 for what is *populated* in the pilot).

**Implementation phasing.** The pilot builds in two phases so retention validation is never gated on the largest sub-build:

- **Phase 1 — core loop:** accounts + onboarding, content import, learn-a-unit, flashcard/cloze reviews with FSRS, streak/progress, success-metric SQL views. This alone ships to pilot learners and proves the retention metric.
- **Phase 2 — AI drill (fast-follow):** the `/drill` Edge Function and coaching UI, built while Phase 1 is already in front of real learners.

### Pilot success criteria

A handful of real target users (immigrant clinicians) **complete the unit and return across several days** for review sessions, and report that the format works. Retention is the key signal; reliability and low-friction daily mobile use matter more than polish.

### Pilot content prerequisite

The pilot unit itself — the intake/anamnesis dialogue, its 10–15 dictionary entries with all required fields, and English translations — is a **load-bearing deliverable** authored by the owner/language professional in the git-versioned spreadsheets (§6). Definition of ready: dialogue lines complete, every referenced entry fully filled (required fields of §4), English translations present, reviewed once by a clinician-level Hebrew speaker. Authoring proceeds in parallel with the Phase 1 build and gates launch, not development.

### Rollout & partner review

The app deploys **continuously to a public Cloudflare Pages URL from the first working slice**, so the owner's partner — the language professional — can follow progress online throughout the build. The partner receives an account with `is_admin`, letting him preview draft units and vocabulary in the live app before publication (§4 access rules, §6 draft/published workflow).

### Explicitly out of pilot scope (roadmap, seams designed in)

- Audio/listening exercises and voice simulation
- Written/voice simulation of medical intake (anamnesis)
- Social practice between learners
- Additional units, levels 2–3 content, non-English UI
- Typed Hebrew answer input and its forgiving-matching normalizer (pilot input is tap-based; see §5)
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
| Pilot translations | `en` required; `ar`/`ru`/`fr` columns exist from day 1 but are nullable and populated later (no pilot screen renders them) |
| Implementation phasing | Phase 1 core loop → Phase 2 AI drill fast-follow |
| Partner demo | Continuous public deployment from the first slice; language-expert partner gets an `is_admin` preview account |
| Repo | github.com/orilencovsky/Medlingo, local clone on Desktop |

## 3. Architecture

Four pieces; only one is custom server code.

```
┌─────────────────────────────┐
│  React SPA (Vite 8, React   │  static assets on Cloudflare Pages
│  19, TS, Tailwind, PWA)     │  (free tier, no commercial-use restriction)
└───────┬─────────────┬───────┘
        │ supabase-js │ fetch() streaming (SSE-formatted)
        ▼             ▼
┌───────────────┐  ┌──────────────────────┐
│ Supabase      │  │ Supabase Edge Fn     │
│ Postgres+RLS  │◄─┤ /drill (Deno)        │──► Claude API
│ Auth (magic   │  │ JWT check, rate      │    (Haiku 4.5, prompt-cached
│ link)         │  │ limit, holds API key │     system prompt)
└───────▲───────┘  └──────────────────────┘
        │ direct Postgres connection (local only, never shipped)
┌───────┴──────────────────────┐
│ Content import script (TS)   │  per-unit TSV/CSV in git → Zod
│ validate → single DB         │  validation → one BEGIN/COMMIT
│ transaction                  │  transaction, idempotent upsert
└──────────────────────────────┘
```

- **SPA** talks to Postgres directly via `supabase-js`; RLS is the authorization layer. No custom backend for CRUD.
- **Supabase project in `eu-central-1`** (Frankfurt) for Israeli latency.
- **`/drill` Edge Function** is the only trusted server code: verifies the caller's JWT, loads due words from Postgres, calls Claude with the server-held `ANTHROPIC_API_KEY`, streams responses back, and enforces the drill quota (§5). The client consumes the stream via `fetch()` + `ReadableStream` with the JWT in the `Authorization` header of a POST — **never** in a URL query parameter (the native `EventSource` API can't set headers and would leak the token into logs). Written as a **framework-agnostic Request/Response handler** so it can lift unchanged onto a companion service when voice arrives.
- **FSRS scheduling** runs client-side (`ts-fsrs`, version pinned, **interval fuzz disabled**) for instant grading UX. The append-only `review_logs` table plus the pinned FSRS parameter set make card state recomputable and auditable; `user_card_state` is the client-maintained serving cache rebuilt from logs if ever needed. (Server-side recompute/enforcement is roadmap, not pilot.)
- **Content import** connects with a real Postgres driver over the database connection string (service credentials live only in local env) and wraps the entire multi-table import in one `BEGIN`/`COMMIT` — this, not client-library upserts, is what makes "a validation error anywhere writes nothing" actually true.
- **AI model:** `claude-haiku-4-5` for drill exchanges, with the shared system prompt cached (≈90% input-cost reduction). Individual calls upgradeable to Sonnet-tier with a one-line change.

### Cost profile

- Free tiers: $0 hosting (Cloudflare Pages), $0 Supabase, ~$5–15/mo Claude API at pilot scale (tens of users).
- **Recommended:** Supabase Pro at $25/mo for the pilot — the free tier pauses projects after 7 idle days and has no backups; a retention pilot must not gamble on either. (MedLingo would also consume the last free-plan project slot, leaving no headroom for a staging database.)
- Total worst case comfortably under $50/mo with no scaling cliffs before hundreds of users.

## 4. Data model

All tables in Supabase Postgres with RLS. Migrations in git.

### `dictionary_entries` — the course dictionary (~3,000 entries at full scale)

| Field | Notes |
|---|---|
| `id` | stable key, referenced by units and user state; **identity never changes** — content fields may be edited in place |
| `hebrew` | canonical form |
| `hebrew_nikud` | vocalized form |
| `part_of_speech` | noun/verb/adjective/phrase/abbreviation |
| `level` | 1–3 |
| `gender` | ז/נ where applicable |
| `plural` | plural form where applicable |
| `root` | שורש, nullable (many medical terms are loanwords) |
| `everyday_synonym` | patient-facing register pair, nullable (e.g. clinical term ↔ what the patient says) |
| `translations` | `{en, ar, ru, fr}` — **`en` required; `ar`/`ru`/`fr` nullable in the pilot**, populated when those UIs ship |
| `notes` | usage notes, nullable |

### `units`

Slug, level, display order, status (`draft`/`published`), title translations, and the scenario dialogue as ordered lines (speaker, Hebrew text, translations per line — same `en`-required rule).

### `unit_items`

Joins a unit to its dictionary entries: `unit_id`, `entry_id`, order, and the entry's **context sentence(s)** from the scenario (Hebrew + translations). Context sentences are the cloze source, so every word is reviewed in its clinical context. The schema allows more than one context sentence per item (rotated in cloze) — the pilot unit ships with one each; single-sentence cloze memorization is a known limitation mitigated by the maturity bands below (cloze is a mid-maturity form, so no word lives on cloze forever).

### `user_card_state`

Per user × entry: FSRS memory state — due date, stability, difficulty, reps, lapses, state, last review. PK `(user_id, entry_id)`. RLS: owner only. Client-maintained cache; source of truth is `review_logs`.

### `review_logs` (append-only)

Every practice event: `user_id`, `entry_id`, timestamp, practice form (`flashcard_recognition` / `flashcard_recall` / `cloze` / `drill`), derived FSRS rating, answer latency ms, `counts_for_scheduling` (boolean — see drill and extra-practice rules in §5), scheduling metadata. RLS: owner may insert and read; no update/delete.

**Recompute rule:** card state is recomputable from `review_logs` **plus the pinned FSRS configuration** (ts-fsrs version pinned in `package.json`, parameters and desired-retention constants in code, fuzz disabled). Immediate-practice answers during unit learning are logged like any other review, so initial card state is itself derivable from logs.

### `profiles`

Display name, UI language, `is_admin` (owner flag, set manually in DB), streak counters (current, longest, last active date).

### `unit_progress`

Per user × unit: status (`not_started`/`in_progress`/`completed`), completed_at. **Completion trigger:** the learner finishes the immediate-practice pass — every new word practiced at least once; correctness not required. Immediate practice is mandatory for completion.

### `drill_usage`

Per user × date: `sessions_started`, for quota enforcement (§5) by the Edge Function.

### Access rules summary

- Signed-in users: read `dictionary_entries`; read `units`/`unit_items` where `status = published` **or** the reader has `is_admin` (this is what makes in-app draft preview by the owner possible); read/write only their own `user_card_state`, `review_logs` (insert-only), `profiles`, `unit_progress`.
- `drill_usage` written only by the Edge Function (service role).
- Content tables written only by the import script (direct DB connection, local).

## 5. Learning experience

### Sign-in & onboarding

- **Auth:** email magic link (Supabase Auth). No passwords in the pilot.
- **First login:** a single onboarding screen collects display name and (pre-selected: English) UI language → written to `profiles`, together with a one-line consent notice (§8). Then the learner lands on Home.

### Home & navigation

The post-login Home screen is the hub, with three elements:

1. **Unit card** — "Start" (first run) / "Continue" / "Completed ✓" for the pilot unit.
2. **Review card** — "N words due — Review now", or the caught-up state: "All caught up — next review at ~\<time\>", which offers the AI drill (Phase 2) or optional extra practice (logged with `counts_for_scheduling = false`, so ahead-of-schedule practice never distorts FSRS).
3. **Progress strip** — streak, words learned, words known (§ gamification below).

First-run state (signed in, nothing started): the unit card invites starting the unit; the review card explains reviews unlock after learning the first words.

### Learning a unit (one-time, ~15–20 min)

1. **Scenario** — learner reads the clinical dialogue (pilot: patient intake/anamnesis). New words highlighted; tapping opens a gloss (meaning, gender/plural, everyday synonym).
2. **Vocabulary introduction** — the 10–15 entries one by one as full cards: Hebrew with nikud, meaning, grammar, register pair, context sentence.
3. **Immediate practice** — a first pass over the new words (recognition + cloze) while fresh. Every answer is logged to `review_logs` and seeds the word's FSRS state — words enter the SRS queue here.
4. **Completion** — `unit_progress` → `completed`; progress feedback; words now live in the review system.

### Daily review sessions (~5–10 min)

**"Due" is defined as:** a card exists for the user and its FSRS `due ≤ now` — Learning-state cards included (so freshly learned words come back the same/next day per FSRS learning steps).

**Exercise form is selected by FSRS stability** (the one authoritative maturity metric):

| Stability | Form | Input |
|---|---|---|
| < 3 days | Recognition: Hebrew → choose meaning | 4 options |
| 3–10 days | Cloze: the word's context sentence, term blanked | word-bank tiles |
| > 10 days | Recall: meaning → produce the Hebrew | word-bank tiles |

All pilot input is **tap-based** (options or tiles) — typed Hebrew input and its forgiving-matching normalizer (nikud- and final-letter-insensitive) are a fast-follow, since almost no word reaches high maturity within the pilot window anyway.

**Recognition distractors:** 3 meanings drawn at random from same-level, same-part-of-speech dictionary entries (fallback: same level), excluding the answer. Word-bank tiles likewise mix the answer with same-level tiles.

**Grading (learners never see FSRS buttons):**

| Outcome | FSRS rating |
|---|---|
| Wrong | Again |
| Correct | Good |
| Correct and fast — Recognition ≤ 4s, Cloze/Recall ≤ 8s (initial values, tunable; measured render→submit) | Easy |
| — | Hard is deliberately unused in the pilot |

### AI drill (Phase 2)

Available from Home or after a review session.

- **Quota:** 3 drill **sessions**/day (`drill_usage.sessions_started`, incremented by the Edge Function at session start), each capped at 10 learner messages (the function receives the running conversation and rejects beyond the cap). If nothing is due, the drill draws from the most recently learned words instead.
- Claude plays a **patient**; the learner is the clinician conducting a short written Hebrew exchange (~6–10 turns) that naturally requires the target words (e.g., "שאל את המטופל על אופי הכאב").
- After each learner message: structured feedback — what was right, corrected phrasing if needed, one improvement tip — rendered as a professional coaching panel.
- **Word outcomes → SRS:** the Edge Function passes the target-word list to Claude, which must return (via structured output, at session end) a per-word verdict: `used_correctly` / `used_incorrectly` / `not_attempted`. Mapping: `used_correctly` → Good, `used_incorrectly` → Again, `not_attempted` → no log row. Drill never yields Easy (no meaningful latency signal). **Same-day rule:** if a card was already reviewed today, its drill outcome is logged with `counts_for_scheduling = false` (analytics only) — a second same-day grade is not a legitimate *spaced* repetition and would distort the retention metrics.
- System prompt constrains Claude to language coaching within the scenario; a visible note clarifies the AI patient is simulated and this is language education, not clinical guidance.

### Gamification (serious-adult flavor)

- **Streak:** increments on any local-calendar day (device timezone) in which the learner completes a review session *or* visits while fully caught up; a day with due words and no review breaks it. Stored in `profiles`.
- **Words learned:** entries with any card state. **Words known:** FSRS state = Review with stability ≥ 7 days. Both derived from `user_card_state` at read time (recomputable from `review_logs`); not stored in `profiles`.
- Unit progress bar. Nothing else in the pilot.

## 6. Content authoring workflow

- Content lives as **spreadsheets versioned in git**: one master dictionary sheet + one small sheet per unit (dialogue lines, entry references, context sentences). The language professional edits spreadsheets, never the app or database.
- A local TypeScript import script (direct Postgres connection; credentials only in local env, never shipped) validates every row with Zod — missing required field, unknown entry reference, duplicate term → hard error with row number — then performs the entire multi-table upsert **inside a single database transaction**. A validation or write error anywhere rolls back everything.
- **Mutation policy:** `id` is identity and never changes; content fields (spelling, translations, context sentences) may be edited in place — existing `user_card_state` and `review_logs` are preserved (learning history survives content fixes). **The import never deletes:** removing a row from a spreadsheet leaves the DB row in place; retiring content = unpublishing its unit.
- Units carry `draft`/`published` status: the owner (`is_admin`) can review a draft unit in the live app before learners can see it.

## 7. i18n and bidirectional text

Hebrew content (RTL) appears inside the LTR English UI on essentially every screen. Handled by convention plus lightweight enforcement:

- A single **`<He>` component** wraps every Hebrew run — `dir="rtl"`, `lang="he"`, bidi isolation (`<bdi>` semantics). Used in flashcards, cloze sentences, drill chat, word lists, glosses.
- **CSS logical properties only** (`padding-inline-start`, `text-start`, …), enforced by an off-the-shelf stylelint plugin (e.g. `stylelint-use-logical`). A custom eslint rule for raw Hebrew literals is **deferred** — it protects a convention from other developers, and there are none yet.
- All UI strings through i18next `t()` from day 1. ICU-plural wiring is deferred to the milestone that ships ru/ar UI. Adding ar/ru/fr later = translation files + `document.dir` flip; layout mirrors automatically thanks to logical properties.
- Budget real manual QA for mixed-direction edge cases (punctuation at Hebrew/English boundaries, numerals adjacent to Hebrew) on iOS Safari and Android Chrome.

## 8. Security, privacy & error handling

- **RLS everywhere** per the access rules in §4.
- **Edge Function hardening:** JWT verification on every call (header-borne, never query-string); drill session quota checked in Postgres before any Claude call; per-session message cap; input length caps. The Anthropic key exists only in Edge Function secrets.
- **Privacy (pilot-appropriate):** stored personal data = email, display name, learning history. One-line consent notice at onboarding; EU-hosted (Frankfurt); pilot participants can request deletion and the owner removes the auth user + cascaded rows manually. No analytics trackers.
- **Graceful degradation:** Claude down/slow → drill shows a "practice coach unavailable" state; flashcards and cloze keep working, so a daily review is never blocked by AI availability. Network drop mid-review → completed answers queue and retry; worst case a review repeats (annoying, never harmful).
- **Import safety:** one transaction; partial imports impossible (§6).
- **Offline:** full offline review is deferred; the PWA shell caches for fast loads, but reviews require connectivity in the pilot.

## 9. Testing

- **FSRS time-travel tests:** simulated clock drives learn→review sequences across virtual days; assert due dates, state transitions, and form-band selection.
- **Recompute check:** rebuilding card state from `review_logs` + pinned FSRS config equals client-computed state (fuzz disabled makes this deterministic). Kept as a cheap unit test / debugging aid.
- **Import fixtures:** one fixture spreadsheet per failure mode; each must fail loudly with a row number and leave the DB untouched.
- **Bidi QA checklist:** manual, on iOS Safari + Android Chrome; visual snapshots of key screens.
- **One E2E path (Playwright):** sign up → onboard → learn unit → complete review session → (Phase 2) drill with mocked Claude.
- **Drill prompt quality:** iterated manually with test transcripts during the pilot (no automated eval harness yet).

## 10. Success measurement

SQL views over `review_logs` and `unit_progress`: unit completion rate, D1/D3/D7 return rates, reviews per user-day, drill usage. (Views count only `counts_for_scheduling = true` rows for retention math.) Read via a query script — no admin dashboard in the pilot. Quantitative signals are complemented by direct conversations with the pilot learners.

## 11. Roadmap seams (designed now, built later)

| Future feature | Seam in this design |
|---|---|
| Voice simulation (anamnesis) | Drill handler is framework-agnostic; voice = browser↔voice-API WebRTC with ephemeral tokens minted by an Edge Function, or a small (~$5/mo) companion service. Additive, not a rewrite. |
| Written simulation | Same streaming Edge Function pattern as the drill, longer conversations. |
| Social practice | Supabase Realtime (presence + chat channels) on the platform already in use. |
| 3,000 words / 3 levels / many units | More rows + more spreadsheets; zero new infrastructure. |
| ar/ru/fr UI incl. full Arabic RTL | Translation files + `document.dir` flip; nullable translation columns filled per language; ICU plurals wired then. |
| Typed Hebrew input | Recall/cloze gain a typed mode with nikud-/final-letter-insensitive matching; maturity bands already reserve the slot. |
| SEO/marketing | Prerendered landing site at the root domain later; app on a subdomain. |
| Gamification depth | Streak data in `profiles`; mastery/words-known derived from `user_card_state` (recomputable from `review_logs`). |

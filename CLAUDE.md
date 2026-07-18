# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MedLingo teaches medical Hebrew to immigrant clinicians (olim physicians/nurses) working in
Israeli healthcare. Core loop: learn 10–15 words/phrases in a realistic clinical scenario
("unit") → spaced-repetition review (FSRS) on a daily streak. Pilot success metric is
**retention**, not feature breadth.

Deeper context lives in:
- [docs/ONBOARDING.md](docs/ONBOARDING.md) — idea, stack, current build status, where to plug in next
- [docs/superpowers/specs/2026-07-10-medlingo-pilot-design.md](docs/superpowers/specs/2026-07-10-medlingo-pilot-design.md) — full product spec
- [docs/superpowers/plans/](docs/superpowers/plans/) — per-feature implementation plans (dated, one per shipped feature)

Live at https://medlingo.pages.dev, continuously deployed from `main` (Cloudflare Pages).

## Commands

```bash
npm install
cp .env.example .env.local            # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (required for dev/e2e)
cp .env.content.example .env.content  # DATABASE_URL / SUPABASE_SERVICE_ROLE_KEY (content import + e2e only)

npm run dev              # Vite dev server, http://localhost:5173
npm run build            # tsc -b && vite build (type-checks as part of the build — there is no separate typecheck script)
npm test                 # vitest run — unit/integration tests, single pass
npm run test:watch       # vitest watch mode
npm test -- <pattern>    # run a subset, e.g. `npm test -- fsrs` or `npm test -- src/data/cards.test.ts`
npm run test:e2e         # Playwright, boots the dev server itself; needs .env.local + .env.content (see below)
npm run lint:css         # stylelint on src/**/*.css
npm run import:content   # validate content/ TSVs with zod, then upsert into Supabase (needs .env.content)
npm run metrics          # pilot retention SQL views (needs .env.content)
npm run verify:rls       # sanity-check Row Level Security policies (needs .env.content)
```

There is no ESLint config — `tsc -b` (strict, `noUnusedLocals`/`noUnusedParameters`) is the only
JS/TS lint gate; `stylelint` (with `stylelint-use-logical`, enforced `always`) is the CSS gate —
use logical properties (`inset-inline-start`, not `left`) for RTL correctness.

Tests are colocated (`Foo.tsx` + `Foo.test.tsx`) and run through Vitest + jsdom +
`@testing-library/react`, except:
- `e2e/*.spec.ts` — Playwright, excluded from the Vitest glob in `vite.config.ts`. `e2e/global-setup.ts`
  creates/reuses a fixed test user (`e2e@medlingo.test`) via the Supabase admin API, wipes their
  learning-state tables, and writes a signed-in `storageState` so specs start authenticated.
- `supabase/functions/drill/**/*.test.ts` — Deno tests (`Deno.test`, `jsr:`/`npm:` specifiers), also
  excluded from Vitest. Run with `deno test` from inside `supabase/functions/drill/`, not `npm test`.

## Architecture

### Client is the app; Postgres RLS is the API

There is no backend server for CRUD. The React SPA talks to Supabase directly
(`src/lib/supabase.ts`), and **Row Level Security policies are the authorization layer**
(`supabase/migrations/0002_rls.sql`): learners can read published units + their own
`user_card_state`/`review_logs`/`unit_progress`/`profiles` rows; `is_admin` accounts (checked via
a `security definer` SQL function) can additionally read draft units. The one exception is the
`drill` Supabase Edge Function (Deno), which calls out to the Claude API server-side and enforces
a daily session quota — see below.

Schema: `supabase/migrations/*.sql`, applied in order. `dictionary_entries` and `units`/`unit_items`
are the content tables (loaded via the import pipeline, below); `user_card_state`, `review_logs`
(append-only), `unit_progress`, `profiles`, `drill_usage` are per-user state.

### Data flow: `src/data/*` wraps Supabase, `src/lib/*` is pure logic

- `src/lib/fsrs.ts` wraps `ts-fsrs` (pinned version, `enable_fuzz: false`) behind app-shaped
  `CardState`/`Rating` types. Card state is fully recomputable from `review_logs` + this pinned
  config — that's the correctness check `npm run verify:rls`-adjacent scripts rely on. Note
  `learningSteps` must round-trip through Supabase or lapsed learning cards graduate early.
- `src/data/cards.ts` is the review data layer: loads/joins `user_card_state` +
  `dictionary_entries` + `unit_items` context sentences, applies FSRS on rating submission, and
  writes both a `review_logs` row and the updated `user_card_state` row. `submitReview` is
  offline-first: on write failure it queues the review in `localStorage`
  (`medlingo.pendingReviews`) and returns an optimistic locally-computed card state;
  `flushPendingReviews()` drains the queue in order, dropping (not silently retrying forever) an
  item after `MAX_FLUSH_ATTEMPTS` permanent failures.
- `src/data/units.ts`, `profile.ts`, `drill.ts`, `reports.ts` follow the same pattern: thin
  row-mapping functions (snake_case DB rows → camelCase app types) around Supabase queries. Add
  new persistence here, not inline in components/pages.
- `src/lib/types.ts` is the canonical app-level type vocabulary (`DictionaryEntry`, `Unit`,
  `CardState`, `ReviewCard`, `PracticeForm`, `Rating`, ...) — both `src/data/*` and
  `src/components/exercises/*` build on these, not raw DB rows.

### Practice forms and scheduling

`PracticeForm` = `flashcard_recognition | flashcard_recall | cloze | drill`. `selectForm()` in
`src/lib/fsrs.ts` picks recognition/cloze/recall by the card's FSRS stability
(`FORM_BANDS`); `deriveRating()` turns correctness + response latency into an `again/good/easy`
FSRS grade using per-form latency thresholds (`EASY_LATENCY_MS`). Exercise components for each
form live in `src/components/exercises/` (`Recognition.tsx`, `Recall.tsx`, `Cloze.tsx`) and are
driven from `src/pages/ReviewPage.tsx`. `drill` is a separate, AI-backed free-form practice mode
(see next section) gated behind the `VITE_ENABLE_DRILL` flag (`src/lib/flags.ts`) since it
requires the `drill` Edge Function to be deployed.

### The `drill` Edge Function

`supabase/functions/drill/` (Deno) is the one server-side piece: `index.ts` → `handler.ts` →
(quota check against `drill_usage`) → `claude.ts` (calls the Claude API to run an AI coaching
conversation) using target words loaded via `lib.ts`. `verify_jwt = false` in
`supabase/config.toml` — auth is checked manually inside `handler.ts` (via the caller's JWT
against Supabase auth), then a second `service` client (service-role key) is used for
quota/usage writes, matching the RLS-bypass-only-where-necessary pattern. `handleDrillRequest`
is split out from `handler` specifically so it can be tested with an injected fake service
client, without a real network round trip — follow that pattern for new server logic here.

### Content pipeline: TSVs are the source of truth, `id` is permanent

Content (dictionary + units + dialogue + context sentences) is authored as git-versioned TSVs in
`content/` (by a non-technical language-expert partner — see `content/README.md`), never edited
directly in Supabase. `scripts/import-content.ts` validates everything with `zod`
(`scripts/tsv.ts` does the raw TSV parse) before writing anything, then upserts in one
transaction, keyed by `content/dictionary.tsv`'s `id` column — **`id` is permanent identity**, so
correcting a dictionary entry's fields in place never loses a learner's review history tied to
that `id`. The import is idempotent and additive: it never deletes; retiring content means
flipping a unit's `status` from `published` to `draft` in `content/units.tsv` and reimporting.
Validation cross-checks structural invariants beyond types, e.g. `validateItems` requires a
unit item's `context_he` to literally contain the dictionary entry's `hebrew` headword, because
the cloze exercise blanks it by substring match. `dictionary_entries` also carries an optional,
controlled-vocabulary `category` "study area" tag (first value `medical_loanword`); add a new
value by extending both the DB check constraint (`supabase/migrations/*`) and the import zod enum
together — see [docs/superpowers/plans/2026-07-18-medical-loanword-area.md](docs/superpowers/plans/2026-07-18-medical-loanword-area.md).

### i18n / RTL

Five UI languages (`src/locales/{en,ar,ru,fr,he}.json`) via `i18next`/`react-i18next`
(`src/lib/i18n.ts`). `applyLanguage()` also flips `document.documentElement.dir` for `ar`/`he`
(RTL) — this is why CSS must use logical properties (enforced by `stylelint-use-logical`) rather
than physical `left`/`right`. Content translations (`Translations` type: `en` required,
`ar`/`ru`/`fr` optional) are a separate concern from UI strings — they live in the
`dictionary_entries`/`units`/`unit_items` DB rows, not the locale JSON files.

### Routing / auth guard

`src/App.tsx` is the full route table: `/auth` and `/onboarding` are public; everything else is
wrapped in `ProtectedRoute` (redirects unauthenticated users) inside `AppShell` (the persistent
sidebar/nav chrome). `SessionProvider` supplies the Supabase auth session context app-wide.

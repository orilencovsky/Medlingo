# MedLingo — Anatomy Tab

**Date:** 2026-07-19
**Status:** Approved design — ready for implementation plan
**Related:** [2026-07-19 dictionary topics](2026-07-19-dictionary-topics-design.md) (ships first; anatomy words are `topic='anatomy'`), [2026-07-18 reviewer console](2026-07-18-dictionary-tab-and-reviewer-console-design.md)

## Purpose

A standalone, image-rich **anatomy tab** where each anatomy term shows Hebrew (with nikud) +
English + an illustration, grouped by body system under a region navigator. Images come from two
sources side by side — **curated open-license** art and **AI-generated** illustrations — with an
expert choosing which to publish per term.

## Decisions (locked during brainstorming)

- **Layout:** sticky **region navigator** on top (all / head&neck / chest / abdomen / limbs /
  skeleton …); below it, words grouped into titled **system sections** (cardiovascular,
  respiratory …), each a **grid of image cards**. (Region-navigator from option B + system
  card-grids from option A.)
- **Dual image source:** each term can hold multiple images tagged `curated` or `ai`; a small
  badge marks the source; exactly one is `is_primary` (what learners see).
- **AI-gen scope:** curated-first. Ship with curated images; generate AI illustrations for a
  **small trial set (~10-15 terms)** to compare, then decide whether to scale.
- **Admin:** a **dedicated anatomy admin view** (not the text-word console) — richer surface for
  region/system assignment and side-by-side image comparison / primary selection.
- **Sequencing:** the **topics feature ships first**; anatomy terms are the dictionary words
  tagged `topic='anatomy'`.
- **Reuse, don't fork:** anatomy words remain normal `dictionary_entries` (also visible in the
  dictionary/topic grid); anatomy-specific data lives in side tables.

## Architecture

### Data model

Migration `00NN_anatomy.sql` (number assigned after topics' 0012):

- **`anatomy_terms`** — one row per anatomy word:
  `entry_id text pk references dictionary_entries(id)`, `region text` (check over a fixed region
  set), `system text` (check over a fixed system set), `display_order int`. Only anatomy words get
  a row, so region/system stay off the other ~1186 entries.
- **`anatomy_images`** — candidate images per term:
  `id uuid pk`, `entry_id references dictionary_entries(id)`, `storage_path text`,
  `source text check (source in ('curated','ai'))`, `is_primary boolean default false`,
  `credit text` (attribution/license, required for curated), `created_at`. A partial unique index
  enforces at most one `is_primary` per `entry_id`.
- RLS: learners `select` anatomy_terms + anatomy_images (read-only); `is_admin()` writes both.

### Image storage

- A **Supabase Storage** bucket `anatomy` (public read; admin-only write via storage policy).
- Files referenced by `anatomy_images.storage_path`; the app builds the public URL.
- Curated: uploaded by a script from a vetted open-license set (public-domain Gray's Anatomy
  plates; Wikimedia CC-BY). Attribution stored in `credit`.
- AI: generated illustrations uploaded with `source='ai'`, `is_primary=false` until an expert
  approves. **Medical-accuracy caveat:** generated anatomy may be wrong; an AI image is never
  auto-published — it becomes `is_primary` only by explicit expert action.

### AI generation pipeline (trial)

- `scripts/generate-anatomy-images.ts`: for a named trial list of ~10-15 terms, prompts an image
  model (the image-generation tooling available at build time — pluggable; flat, clean,
  educational illustration style, neutral background) and uploads results as `source='ai'`,
  `is_primary=false`. Idempotent per term (skips terms that already have an `ai` image unless
  `--regenerate`). No term is published from this script — it only stages candidates.

### Learner anatomy tab

- Route `/anatomy` under `AppShell`; nav item (anatomy icon) for all learners.
- Data: fetch `anatomy_terms` joined to their `dictionary_entries` + the **primary** image per
  term. **Only terms that have a region, a system, and a primary image appear** — half-built
  terms stay hidden.
- UI (the approved mockup): sticky region navigator (localized chips) filters to the systems in
  that region; each system section renders a card grid (`imgbox` + nikud-primary Hebrew + en).
  Tapping a card can expand detail (en, everyday synonym, notes) — reuse the dictionary detail
  affordance. `all` shows every region.
- i18n: region + system display names localized across 5 locales (label maps, like topics).

### Anatomy admin view

- Route `/admin/anatomy`, gated `is_admin`. Per anatomy term:
  - assign `region` + `system` (localized selects),
  - see all candidate images side by side with `curated`/`ai` badges,
  - **set primary** (one tap; enforces the single-primary invariant),
  - trigger/inspect the AI-generated candidate for the trial terms.
- Direct writes (like the topic field) — image/primary selection is operational metadata, not the
  moderated content flow. Data fns: `fetchAnatomyAdmin()`, `setAnatomyMeta(entryId, region, system)`,
  `setPrimaryImage(imageId)`.
- Progress: coverage counter — anatomy terms that are publish-ready (region + system + primary
  image) vs total `topic='anatomy'` words.

## Testing

- **Migration:** region/system/source CHECKs reject invalid values; the single-`is_primary`
  partial unique index rejects a second primary for one entry; RLS (learner read-only, admin
  write) via `verify-rls.ts`.
- **Learner tab:** a term missing region/system/primary image does NOT render; region nav filters
  sections; card grid shows nikud-primary; i18n region/system label parity across 5 locales.
- **Admin:** `setPrimaryImage` flips the primary and clears the prior one; `setAnatomyMeta` writes
  region/system; coverage counter reflects publish-ready count.
- **AI pipeline:** `generate-anatomy-images` uploads with `source='ai'`, `is_primary=false`, is
  idempotent per term, and never sets a primary.

## Out of scope

- Interactive labeled body SVG (tap-a-region-on-a-figure) — the earlier option B/flagship; revisit
  after the card-grid tab proves out.
- Audio pronunciation on anatomy cards — seam left (a later audio feature), not built here.
- Scaling AI generation beyond the trial set — decided after the ~10-15-term comparison.
- Anatomy quizzing / practice integration (FSRS) — anatomy is browse/reference for now.

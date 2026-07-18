# Medical-loanword dictionary area

**Date:** 2026-07-18
**Status:** Shipped (merged to `main`, applied to production DB)

## Goal

Give the dictionary a first-class, filterable "study area" for **widely-used foreign-origin
clinical terms written in Hebrew script** — ספסיס (sepsis), קרפיטציות (crepitations),
ביופסיה (biopsy), אנמנזה (anamnesis) — the jargon an olim clinician hears daily on the ward
but that has no native-Hebrew root. This turns a loose `notes` convention into a real category
the app can later filter and build a dedicated learning/game surface on.

## Design decision

Modeled as a **nullable, controlled-vocabulary `category` column** on `dictionary_entries`,
not a freetext note and not an overload of `level`/`part_of_speech`:

- A column is queryable and validated; a note is neither.
- `level` is a difficulty axis (1–3) and `part_of_speech` a grammatical one — neither should
  carry a topical/register grouping.
- First (and currently only) value: `medical_loanword`. The column is extensible — add a value
  by extending both the DB check constraint and the import zod enum together.

Deliberately **not** tagged: general-vocabulary loanwords (אוטובוס/bus, בננה/banana). The area
is clinical terminology only, even though the whole dictionary is a medical course.

## Changes

- **Schema** — `supabase/migrations/0009_dictionary_category.sql`: `alter table dictionary_entries
  add column category text check (category in ('medical_loanword'))`. Nullable; most entries carry
  no category. Backwards-compatible (the deployed app's `select *` simply ignores it).
- **Import pipeline** — `scripts/import-content.ts`: `category` in the `DictRow` zod schema
  (`z.enum(['medical_loanword']).nullable()`), in the nullable-coercion list, and in the
  insert/upsert. Convention documented in `content/README.md`.
- **App types** — `EntryCategory` + `DictionaryEntry.category` in `src/lib/types.ts`, mapped in the
  `src/data/cards.ts` and `src/data/units.ts` row mappers (for future UI/filtering; no UI yet).
- **Content** — `content/dictionary.tsv`: 98 entries tagged `medical_loanword`.

## Content provenance

- **8 backfilled** from pre-existing entries (anamnesis, allergy, biopsy, cast, chronic, virus,
  procedure, allergic).
- **90 new** across three batches: a manual seed (sepsis, crepitations, saturation, symptom,
  diagnosis, …), then two harvested from the owner's sample admission notes (קבלות רפואיות) in
  Google Drive — respiratory/cardiac/neuro symptoms, lab terms, and high-frequency clinical
  adjectives (cardiac, pleural, pericardial, viral, respiratory, distal/proximal, systolic/
  diastolic, …).
- Each carries its formal Hebrew equivalent in `everyday_synonym` where one exists
  (ספסיס→אלח דם, קרפיטציות→חרחורים).
- **Owner-reviewed** via a generated review spreadsheet, round-tripped by `id`; the reviewer's
  Hebrew-equivalent edits were merged back into the TSV.

## Deployment

Migration applied to the MedLingo production DB, then `npm run import:content` upserted all 1187
dictionary rows. Verified: `select count(*) from dictionary_entries where category =
'medical_loanword'` → 98. Merged to `main` (PR #5) so the source of truth matches the live DB.

## Follow-ups (not built)

- A learner-facing surface that filters or drills the area (the column exists to enable this).
- Abbreviation terms (TAVI, POCUS, CRP, DVT, ACS) — a distinct register; would likely be a new
  category value + `part_of_speech = abbreviation`.
- Continued language-expert polish of nikud / register pairings (safe in-place by `id`).

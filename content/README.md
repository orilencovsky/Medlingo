# MedLingo content

Authoring lives here as TSV spreadsheets (tab-separated, UTF-8, header row).
Edit in Google Sheets/Excel and export as TSV, or edit in place.
Adding words to an existing dictionary: append the rows to `dictionary.tsv` and run
`npm run seed:new-entries` — it inserts only ids the DB does not have yet and leaves
reviewer-owned rows untouched. Topics live only in the DB (not in this TSV); ship them
with a manifest such as `topics-second-thousand.tsv` and `npm run apply:topics <file>`,
which fills `topic` only where it is still null.

Import with `npm run import:content` (validates everything first; writes all-or-nothing; never deletes — retire content by setting a unit's status to draft).

**The current unit-01-intake content is a DEV SAMPLE written for development.
Replace with professionally authored content before pilot launch.**

Empty cells: leave the cell empty (do not write "null"). `ar`/`ru`/`fr` may be empty during the pilot; `en` is required.

## The `level` column (dictionary.tsv)

`level` records which vocabulary file (batch) a word arrived in — it is the learner-facing
level division, not a per-word difficulty grade:

- `1` — the first word list (plus the pre-list dev seeds and the medical-loanword batch
  shipped alongside it)
- `2` — the second thousand
- `3` — reserved for the third word list (append its rows with `level` 3 when it lands)

When a new word file arrives, append all of its rows with the next level number. The TSV
is authoritative for `level` even though reviewers own the other fields in the DB: after
changing levels, run `npm run apply:levels`, which rewrites only the `level` column and
leaves reviewer edits to everything else untouched. The per-level counts are asserted in
`scripts/import-content.test.ts` — update them in the same commit that adds a batch.

## The `category` column (dictionary.tsv)

Optional tag that groups an entry into a study "area". Leave empty for ordinary
entries. Allowed values (controlled — a typo fails the import):

- `medical_loanword` — a widely-used **foreign-origin clinical term written in
  Hebrew script** that has no native-Hebrew root: e.g. ספסיס (sepsis),
  קרפיטציות (crepitations), ביופסיה (biopsy), אנמנזה (anamnesis). These are
  words an olim clinician hears daily on the ward. Conventions for such a row:
  leave `root` empty (there is none), and put the formal Hebrew equivalent in
  `everyday_synonym` where one exists (ספסיס → אלח דם, קרפיטציות → חרחורים).
  Do **not** tag general-vocabulary loanwords (אוטובוס/bus, בננה/banana) — the
  area is clinical terminology only.

Add a new value only alongside a migration extending the `category` check
constraint on `dictionary_entries` and the zod enum in `scripts/import-content.ts`.

## Anatomy images (`anatomy-curated.tsv` + `anatomy-images/`)

Illustrations for the anatomy tab live as files in this repo and are uploaded by
`npm run seed:anatomy-images`, driven by the `anatomy-curated.tsv` manifest
(columns: `entry_id`, `file`, `credit`, `is_primary`, `source`). There is no
image-generation API anywhere in the product — images come from exactly two places:

- **`source=ai`** — illustrations drawn out-of-band in an AI agent session and
  committed under `anatomy-images/` as `<entry_id>.webp` (1024×1024 source,
  exported webp, target ≲200 KB). Drawing recipe (keep every batch in the same
  style): *"flat medical-textbook illustration of the human `<English term>`,
  anatomically accurate, plain white background, soft muted colors, no text,
  no labels, no letters, no arrows"*. `credit` may be left empty. An AI image is
  seeded with `is_primary=false` and only becomes learner-visible after the
  expert approves it in `/admin/anatomy`.
- **`source=curated`** (the default) — vetted open-license art (public-domain
  Gray's Anatomy plates, Wikimedia CC-BY, ...). `credit` is required — the DB
  rejects an uncredited curated image.

`is_primary=true` in the manifest is an operator's explicit per-row choice; the
default leaves primary-picking to the expert in `/admin/anatomy`. Re-running the
seed is idempotent; `--regenerate` re-uploads existing rows.

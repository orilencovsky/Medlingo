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

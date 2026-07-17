-- A nullable "study area" tag on dictionary entries. The first value marks
-- widely-used foreign-origin clinical terms written in Hebrew script
-- (e.g. ספסיס/sepsis, קרפיטציות/crepitations) — jargon an olim clinician hears
-- daily but that has no native-Hebrew root. Nullable: most entries carry no
-- category. Controlled vocabulary (the same set is enforced in the import
-- script's zod schema) so the column can drive a real filterable area, not a
-- freetext note. Extend the check when a new category is added.
alter table public.dictionary_entries
  add column category text check (category in ('medical_loanword'));

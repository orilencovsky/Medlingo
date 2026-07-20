-- One clinical subject per word, for browse-by-topic. Nullable = untagged.
-- Controlled vocabulary; keep this CHECK, src/lib/topics.ts, and the locale
-- topics.* label maps in sync when the set changes.
-- topic is intentionally OMITTED from guard_entry_content_update's blocked-column
-- list (0010) so reviewers set it directly (no entry_edits draft), like review_state.
alter table public.dictionary_entries
  add column topic text check (topic in (
    'anatomy','symptoms','cardiology','respiratory','gastro','neuro','msk',
    'genitourinary','endocrine','dermatology','medications','procedures',
    'lab_imaging','emergency','mental_health','obgyn','pediatrics','infectious','general'));

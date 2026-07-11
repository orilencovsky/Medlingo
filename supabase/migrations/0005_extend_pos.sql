alter table public.dictionary_entries
  drop constraint dictionary_entries_part_of_speech_check;

alter table public.dictionary_entries
  add constraint dictionary_entries_part_of_speech_check
  check (part_of_speech in (
    'noun','verb','adjective','phrase','abbreviation',
    'adverb','pronoun','preposition','conjunction','numeral','interjection','particle'
  ));

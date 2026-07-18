import type { DictionaryEntry } from '../lib/types';

export type EntryRow = {
  id: string; hebrew: string; hebrew_nikud: string; part_of_speech: DictionaryEntry['partOfSpeech'];
  level: 1 | 2 | 3; gender: 'ז' | 'נ' | null; plural: string | null; root: string | null;
  everyday_synonym: string | null; translations: DictionaryEntry['translations']; notes: string | null;
  category: DictionaryEntry['category'];
};

export function mapEntryRow(r: EntryRow): DictionaryEntry {
  return {
    id: r.id, hebrew: r.hebrew, hebrewNikud: r.hebrew_nikud, partOfSpeech: r.part_of_speech,
    level: r.level, gender: r.gender, plural: r.plural, root: r.root,
    everydaySynonym: r.everyday_synonym, translations: r.translations, notes: r.notes,
    category: r.category ?? null,
  };
}

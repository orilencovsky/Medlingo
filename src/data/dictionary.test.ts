import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({ supabase: {} }));
import { filterEntries } from './dictionary';
import type { DictionaryEntry } from '../lib/types';

function e(id: string, hebrew: string, en: string, synonym: string | null = null): DictionaryEntry {
  return {
    id, hebrew, hebrewNikud: hebrew, partOfSpeech: 'noun', level: 1, gender: null,
    plural: null, root: null, everydaySynonym: synonym, translations: { en }, notes: null, category: null, topic: null,
  };
}
const pool = [e('a', 'תלונה', 'complaint', 'מה מפריע'), e('b', 'חום', 'fever'), e('c', 'ספסיס', 'sepsis')];

describe('filterEntries', () => {
  it('returns all entries for an empty query', () => {
    expect(filterEntries(pool, '').length).toBe(3);
  });
  it('matches on Hebrew headword', () => {
    expect(filterEntries(pool, 'חום').map((x) => x.id)).toEqual(['b']);
  });
  it('matches on English gloss, case-insensitive', () => {
    expect(filterEntries(pool, 'SEPSIS').map((x) => x.id)).toEqual(['c']);
  });
  it('matches on everyday synonym', () => {
    expect(filterEntries(pool, 'מפריע').map((x) => x.id)).toEqual(['a']);
  });
  it('trims whitespace', () => {
    expect(filterEntries(pool, '  חום  ').map((x) => x.id)).toEqual(['b']);
  });
});

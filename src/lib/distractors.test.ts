import { describe, it, expect } from 'vitest';
import { pickDistractors } from './distractors';
import type { DictionaryEntry } from './types';

function entry(id: string, level: 1 | 2 | 3, pos: DictionaryEntry['partOfSpeech'], en: string): DictionaryEntry {
  return {
    id, hebrew: id, hebrewNikud: id, partOfSpeech: pos, level,
    gender: null, plural: null, root: null, everydaySynonym: null,
    translations: { en }, notes: null,
  };
}

const answer = entry('keev', 1, 'noun', 'pain');
const rng = () => 0.42; // deterministic

describe('pickDistractors', () => {
  it('prefers same level + same part of speech', () => {
    const pool = [
      answer,
      entry('a', 1, 'noun', 'fever'), entry('b', 1, 'noun', 'pulse'), entry('c', 1, 'noun', 'nausea'),
      entry('d', 2, 'noun', 'surgery'), entry('e', 1, 'verb', 'to breathe'),
    ];
    const picked = pickDistractors(answer, pool, 3, rng);
    expect(picked.map((p) => p.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('falls back to same level, then anything, and never includes the answer or duplicate meanings', () => {
    const pool = [
      answer,
      entry('a', 1, 'verb', 'to cough'),
      entry('b', 2, 'noun', 'pain'),         // duplicate meaning of the answer — excluded
      entry('c', 3, 'phrase', 'blood test'),
      entry('d', 2, 'noun', 'infection'),
    ];
    const picked = pickDistractors(answer, pool, 3, rng);
    expect(picked).toHaveLength(3);
    expect(picked.some((p) => p.id === 'keev')).toBe(false);
    expect(picked.some((p) => p.translations.en === 'pain')).toBe(false);
  });
});

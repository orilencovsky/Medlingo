import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({ supabase: {} }));
import { entryToPayload } from './reviewConsole';
import type { AdminEntry } from '../lib/types';

const base: AdminEntry = {
  id: 'x', hebrew: 'חום', hebrewNikud: 'חוֹם', partOfSpeech: 'noun', level: 2, gender: 'ז',
  plural: null, root: null, everydaySynonym: null, translations: { en: 'fever', ar: null },
  notes: null, category: null, reviewState: 'unreviewed', reviewPriority: 0, isDeprecated: false,
};

describe('entryToPayload', () => {
  it('maps camelCase entry fields to the snake_case RPC payload', () => {
    expect(entryToPayload(base)).toEqual({
      id: 'x', hebrew: 'חום', hebrew_nikud: 'חוֹם', part_of_speech: 'noun', level: 2,
      gender: 'ז', plural: null, root: null, everyday_synonym: null,
      translations: { en: 'fever', ar: null }, notes: null, category: null,
    });
  });
});

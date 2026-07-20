import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({ supabase: {} }));
import { entryToPayload, setTopic } from './reviewConsole';
import type { AdminEntry } from '../lib/types';

const base: AdminEntry = {
  id: 'x', hebrew: 'חום', hebrewNikud: 'חוֹם', partOfSpeech: 'noun', level: 2, gender: 'ז',
  plural: null, root: null, everydaySynonym: null, translations: { en: 'fever', ar: null },
  notes: null, category: null, topic: null, reviewState: 'unreviewed', reviewPriority: 0, isDeprecated: false,
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

describe('setTopic', () => {
  it('writes the topic directly to the entry row', async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    const { supabase } = await import('../lib/supabase');
    (supabase.from as unknown as ReturnType<typeof vi.fn>) = vi.fn(() => ({ update }));
    await setTopic('a', 'cardiology');
    expect(update).toHaveBeenCalledWith({ topic: 'cardiology' });
    expect(eq).toHaveBeenCalledWith('id', 'a');
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';

const rangeMock = vi.fn();
const singleMock = vi.fn();
const inMock = vi.fn();
// select() returns this one chain node. fetchAnatomyCards: order→order→range→returns.
// fetchAnatomyWord: eq→maybeSingle. fetchSceneLabels: in.
const chain: {
  order: () => typeof chain;
  range: (...a: unknown[]) => { returns: () => ReturnType<typeof rangeMock> };
  eq: () => { maybeSingle: typeof singleMock };
  in: (...a: unknown[]) => ReturnType<typeof inMock>;
} = {
  order: () => chain,
  range: (...a: unknown[]) => ({ returns: () => rangeMock(...a) }),
  eq: () => ({ maybeSingle: singleMock }),
  in: (...a: unknown[]) => inMock(...a),
};
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(() => chain) })),
    storage: { from: vi.fn(() => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) })) },
  },
}));

import { fetchAnatomyCards, fetchAnatomyWord, fetchSceneLabels } from './anatomy';

const ROW = (overrides: Record<string, unknown> = {}) => ({
  entry_id: 'heart', region: 'chest', system: 'cardiovascular', display_order: 0,
  dictionary_entries: {
    id: 'heart', hebrew: 'לב', hebrew_nikud: 'לֵב', part_of_speech: 'noun', level: 1,
    gender: 'ז', plural: null, root: null, everyday_synonym: null,
    translations: { en: 'heart' }, notes: null, category: null, topic: 'anatomy',
  },
  anatomy_images: [{ id: 'img1', storage_path: 'heart/1.png', source: 'curated', is_primary: true, credit: 'Gray\'s Anatomy' }],
  ...overrides,
});

beforeEach(() => { rangeMock.mockReset(); });

describe('fetchAnatomyCards', () => {
  it('maps a complete row to a card with a built public image URL', async () => {
    rangeMock.mockResolvedValueOnce({ data: [ROW()], error: null });
    const cards = await fetchAnatomyCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      region: 'chest', system: 'cardiovascular', imageCredit: "Gray's Anatomy",
      entry: { id: 'heart', hebrewNikud: 'לֵב' },
    });
    expect(cards[0].imageUrl).toContain('heart/1.png');
  });

  it('drops a term that has no primary image', async () => {
    rangeMock.mockResolvedValueOnce({
      data: [ROW({ anatomy_images: [{ id: 'img1', storage_path: 'heart/1.png', source: 'ai', is_primary: false, credit: null }] })],
      error: null,
    });
    const cards = await fetchAnatomyCards();
    expect(cards).toHaveLength(0);
  });

  it('drops a term missing region/system', async () => {
    rangeMock.mockResolvedValueOnce({ data: [ROW({ region: null })], error: null });
    const cards = await fetchAnatomyCards();
    expect(cards).toHaveLength(0);
  });
});

const ENTRY = (id = 'heart') => ({
  id, hebrew: 'לב', hebrew_nikud: 'לֵב', part_of_speech: 'noun', level: 1, gender: 'ז',
  plural: null, root: null, everyday_synonym: null, translations: { en: 'heart' },
  notes: null, category: null, topic: 'anatomy',
});

describe('fetchAnatomyWord', () => {
  it('returns the entry with a primary image url when one exists', async () => {
    singleMock.mockResolvedValueOnce({
      data: { ...ENTRY(), anatomy_images: [{ storage_path: 'heart/1.png', is_primary: true, credit: 'Gray' }] },
      error: null,
    });
    const w = await fetchAnatomyWord('heart');
    expect(w?.entry.id).toBe('heart');
    expect(w?.imageUrl).toContain('heart/1.png');
    expect(w?.imageCredit).toBe('Gray');
  });

  it('returns the entry with null image when the word has no primary image', async () => {
    singleMock.mockResolvedValueOnce({
      data: { ...ENTRY(), anatomy_images: [{ storage_path: 'heart/1.png', is_primary: false, credit: null }] },
      error: null,
    });
    const w = await fetchAnatomyWord('heart');
    expect(w?.entry.id).toBe('heart');
    expect(w?.imageUrl).toBeNull();
  });

  it('returns null when the entry does not exist', async () => {
    singleMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchAnatomyWord('ghost')).toBeNull();
  });
});

describe('fetchSceneLabels', () => {
  it('returns an empty map for an empty id list without querying', async () => {
    expect(await fetchSceneLabels([])).toEqual({});
    expect(inMock).not.toHaveBeenCalled();
  });

  it('maps entry ids to their hebrew + english labels', async () => {
    inMock.mockResolvedValueOnce({
      data: [{ id: 'heart', hebrew_nikud: 'לֵב', translations: { en: 'heart' } }], error: null,
    });
    const labels = await fetchSceneLabels(['heart']);
    expect(labels.heart).toEqual({ he: 'לֵב', en: 'heart' });
  });
});

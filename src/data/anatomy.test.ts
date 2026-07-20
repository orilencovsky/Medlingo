import { describe, expect, it, vi, beforeEach } from 'vitest';

const rangeMock = vi.fn();
// fetchAnatomyCards chains .select().order().order().range() — mock that shape.
// .order() is idempotent so any number of chained calls lands on the same
// { order, range } node before .range() resolves the query.
const orderChain: { order: () => typeof orderChain; range: (...args: unknown[]) => { returns: () => ReturnType<typeof rangeMock> } } = {
  order: () => orderChain,
  range: (...args: unknown[]) => ({ returns: () => rangeMock(...args) }),
};
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(() => orderChain) })),
    storage: { from: vi.fn(() => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) })) },
  },
}));

import { fetchAnatomyCards } from './anatomy';

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

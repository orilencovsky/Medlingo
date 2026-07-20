import { describe, expect, it, vi, beforeEach } from 'vitest';

// vi.mock factories are hoisted above the file's own top-level consts, so the
// mocks referenced directly (not inside a closure) must themselves be created
// inside vi.hoisted() — otherwise reading them at factory-execution time hits
// a TDZ error ("Cannot access '...' before initialization").
const { rangeMock, upsertMock, rpcMock, fromMock, storageMock } = vi.hoisted(() => {
  const rangeMock = vi.fn();
  const upsertMock = vi.fn(async () => ({ error: null }));
  const rpcMock = vi.fn(async () => ({ error: null }));
  const fromMock = vi.fn((table: string) => {
    if (table === 'dictionary_entries') return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ range: rangeMock })) })) })) };
    if (table === 'anatomy_terms') return { upsert: upsertMock };
    throw new Error(`unexpected table ${table}`);
  });
  const storageMock = { from: vi.fn(() => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) })) };
  return { rangeMock, upsertMock, rpcMock, fromMock, storageMock };
});
vi.mock('../lib/supabase', () => ({ supabase: { from: fromMock, rpc: rpcMock, storage: storageMock } }));

import { fetchAnatomyAdmin, setAnatomyMeta, setPrimaryImage } from './anatomyAdmin';

const ROW = (overrides: Record<string, unknown> = {}) => ({
  id: 'heart', hebrew: 'לב', hebrew_nikud: 'לֵב', part_of_speech: 'noun', level: 1,
  gender: 'ז', plural: null, root: null, everyday_synonym: null,
  translations: { en: 'heart' }, notes: null, category: null, topic: 'anatomy',
  anatomy_terms: null, anatomy_images: [],
  ...overrides,
});

beforeEach(() => { rangeMock.mockReset(); upsertMock.mockClear(); rpcMock.mockClear(); });

describe('fetchAnatomyAdmin', () => {
  it('includes anatomy words with no region/system/images yet', async () => {
    rangeMock.mockResolvedValueOnce({ data: [ROW()], error: null });
    const rows = await fetchAnatomyAdmin();
    expect(rows).toEqual([{ entry: expect.objectContaining({ id: 'heart' }), region: null, system: null, images: [] }]);
  });

  it('maps a row with terms and images', async () => {
    rangeMock.mockResolvedValueOnce({
      data: [ROW({
        anatomy_terms: { region: 'chest', system: 'cardiovascular' },
        anatomy_images: [{ id: 'img1', storage_path: 'heart/1.png', source: 'curated', is_primary: true, credit: 'Gray' }],
      })],
      error: null,
    });
    const rows = await fetchAnatomyAdmin();
    expect(rows[0].region).toBe('chest');
    expect(rows[0].images).toEqual([{ id: 'img1', url: expect.stringContaining('heart/1.png'), source: 'curated', isPrimary: true, credit: 'Gray' }]);
  });
});

describe('setAnatomyMeta', () => {
  it('upserts region/system for the entry', async () => {
    await setAnatomyMeta('heart', 'chest', 'cardiovascular');
    expect(upsertMock).toHaveBeenCalledWith(
      { entry_id: 'heart', region: 'chest', system: 'cardiovascular' },
      { onConflict: 'entry_id' },
    );
  });
});

describe('setPrimaryImage', () => {
  it('calls the set_primary_anatomy_image RPC', async () => {
    await setPrimaryImage('img1');
    expect(rpcMock).toHaveBeenCalledWith('set_primary_anatomy_image', { image_id: 'img1' });
  });
});

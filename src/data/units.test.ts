import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
const responses: Record<string, unknown[]> = {};

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => Promise.resolve({ data: responses[table] ?? [], error: null }),
        maybeSingle: () => Promise.resolve({ data: (responses[table] ?? [])[0] ?? null, error: null }),
        in: () => Promise.resolve({ data: responses[table] ?? [], error: null }),
        upsert: (payload: unknown) => {
          calls.push({ table, op: 'upsert', payload });
          return Promise.resolve({ data: payload, error: null });
        },
        then: (res: (v: { data: unknown[]; error: null }) => void) =>
          Promise.resolve({ data: responses[table] ?? [], error: null }).then(res),
      };
      return chain;
    },
  },
}));

import { loadUnitProgress, loadAllUnitProgress, startUnit, completeUnit, loadUnitEntryIds } from './units';

describe('units data layer', () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(responses)) delete responses[k];
  });

  it('loadUnitProgress defaults to not_started', async () => {
    expect(await loadUnitProgress('unit-01-intake')).toBe('not_started');
  });

  it('loadAllUnitProgress maps unit slugs to statuses', async () => {
    responses['unit_progress'] = [
      { unit_slug: 'unit-01-intake', status: 'completed' },
      { unit_slug: 'unit-02-vitals', status: 'in_progress' },
    ];
    expect(await loadAllUnitProgress()).toEqual({
      'unit-01-intake': 'completed',
      'unit-02-vitals': 'in_progress',
    });
  });

  it('loadAllUnitProgress returns an empty map with no rows', async () => {
    responses['unit_progress'] = [];
    expect(await loadAllUnitProgress()).toEqual({});
  });

  it('startUnit upserts in_progress', async () => {
    await startUnit('unit-01-intake');
    const call = calls.find((c) => c.table === 'unit_progress')!;
    expect(call.payload).toMatchObject({ status: 'in_progress', unit_slug: 'unit-01-intake', user_id: 'u1' });
  });

  it('completeUnit upserts completed with a timestamp', async () => {
    await completeUnit('unit-01-intake');
    const call = calls.find((c) => c.table === 'unit_progress')!;
    expect(call.payload).toMatchObject({ status: 'completed' });
    expect((call.payload as { completed_at: string }).completed_at).toBeTruthy();
  });
});

describe('loadUnitEntryIds', () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(responses)) delete responses[k];
  });

  it('groups entry ids by unit slug', async () => {
    responses['unit_items'] = [
      { unit_slug: 'u1', entry_id: 'a' },
      { unit_slug: 'u1', entry_id: 'b' },
      { unit_slug: 'u2', entry_id: 'c' },
    ];
    const map = await loadUnitEntryIds();
    expect(map).toEqual({ u1: ['a', 'b'], u2: ['c'] });
  });

  it('returns empty object when there are no rows', async () => {
    responses['unit_items'] = [];
    expect(await loadUnitEntryIds()).toEqual({});
  });
});

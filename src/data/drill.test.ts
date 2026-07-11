import { describe, it, expect, vi, beforeEach } from 'vitest';

const submitReview = vi.fn().mockResolvedValue({});
const todaysCountingLogs: string[] = [];

vi.mock('./cards', () => ({
  submitReview: (...a: unknown[]) => submitReview(...a),
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'jwt' } } }),
      getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => Promise.resolve({
              data: todaysCountingLogs.map((entry_id) => ({ entry_id })), error: null,
            }),
          }),
        }),
      }),
    }),
  },
}));

import { parseSseChunks, applyDrillVerdicts } from './drill';

describe('parseSseChunks', () => {
  it('parses events split across chunk boundaries', () => {
    const events = parseSseChunks([
      'event: delta\ndata: {"te',
      'xt":"שלום"}\n\nevent: done\ndata: {}\n\n',
    ]);
    expect(events).toEqual([
      { type: 'delta', payload: { text: 'שלום' } },
      { type: 'done', payload: {} },
    ]);
  });
});

describe('applyDrillVerdicts', () => {
  beforeEach(() => {
    submitReview.mockClear();
    todaysCountingLogs.length = 0;
  });

  it('maps verdicts to drill reviews and skips not_attempted', async () => {
    await applyDrillVerdicts([
      { entryId: 'keev', verdict: 'used_correctly' },
      { entryId: 'chom', verdict: 'used_incorrectly' },
      { entryId: 'dofek', verdict: 'not_attempted' },
    ]);
    expect(submitReview).toHaveBeenCalledTimes(2);
    expect(submitReview).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'keev', form: 'drill', correct: true }),
    );
    expect(submitReview).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'chom', form: 'drill', correct: false }),
    );
  });

  it('marks entries already reviewed today as analytics-only', async () => {
    todaysCountingLogs.push('keev');
    await applyDrillVerdicts([{ entryId: 'keev', verdict: 'used_correctly' }]);
    expect(submitReview).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'keev', countsForScheduling: false }),
    );
  });
});

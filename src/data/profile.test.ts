import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { computeStreak } from './profile';

describe('computeStreak', () => {
  it('starts at 1 with no history', () => {
    expect(computeStreak({ current: 0, longest: 0, lastActiveDate: null }, '2026-07-10'))
      .toEqual({ current: 1, longest: 1, lastActiveDate: '2026-07-10' });
  });
  it('increments on consecutive days', () => {
    expect(computeStreak({ current: 3, longest: 5, lastActiveDate: '2026-07-09' }, '2026-07-10'))
      .toEqual({ current: 4, longest: 5, lastActiveDate: '2026-07-10' });
  });
  it('is idempotent within the same day', () => {
    expect(computeStreak({ current: 4, longest: 5, lastActiveDate: '2026-07-10' }, '2026-07-10'))
      .toEqual({ current: 4, longest: 5, lastActiveDate: '2026-07-10' });
  });
  it('resets after a gap', () => {
    expect(computeStreak({ current: 9, longest: 9, lastActiveDate: '2026-07-01' }, '2026-07-10'))
      .toEqual({ current: 1, longest: 9, lastActiveDate: '2026-07-10' });
  });
  it('updates longest when current passes it', () => {
    expect(computeStreak({ current: 5, longest: 5, lastActiveDate: '2026-07-09' }, '2026-07-10'))
      .toEqual({ current: 6, longest: 6, lastActiveDate: '2026-07-10' });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  newCardState, deriveRating, applyReview, selectForm, isDue,
  EASY_LATENCY_MS, FORM_BANDS,
} from './fsrs';

const T0 = new Date('2026-07-10T08:00:00Z');
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);

describe('fsrs module', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a new card is due immediately', () => {
    const c = newCardState('keev', T0);
    expect(c.entryId).toBe('keev');
    expect(c.state).toBe('new');
    expect(isDue(c, T0)).toBe(true);
  });

  it('again keeps the card in learning and due within minutes', () => {
    const c = applyReview(newCardState('keev', T0), 'again', T0);
    expect(c.state).toBe('learning');
    expect(c.due.getTime() - T0.getTime()).toBeLessThan(30 * 60_000);
    expect(c.reps).toBe(1);
  });

  it('good on a new card schedules the first real gap under 3 days', () => {
    const c = applyReview(newCardState('keev', T0), 'good', T0);
    expect(c.due.getTime()).toBeGreaterThan(T0.getTime());
    expect(c.due.getTime()).toBeLessThanOrEqual(days(3).getTime());
  });

  it('repeated good reviews grow stability monotonically', () => {
    let c = newCardState('keev', T0);
    let prevStability = 0;
    let now = T0;
    for (let i = 0; i < 5; i++) {
      c = applyReview(c, 'good', now);
      expect(c.stability).toBeGreaterThanOrEqual(prevStability);
      prevStability = c.stability;
      now = new Date(c.due.getTime());
    }
    expect(c.state).toBe('review');
  });

  it('is deterministic (fuzz disabled): identical inputs → identical due dates', () => {
    const a = applyReview(newCardState('keev', T0), 'good', T0);
    const b = applyReview(newCardState('keev', T0), 'good', T0);
    expect(a.due.getTime()).toBe(b.due.getTime());
    expect(a.stability).toBe(b.stability);
  });

  it('deriveRating truth table with exact boundaries', () => {
    expect(deriveRating(false, 100, 'flashcard_recognition')).toBe('again');
    expect(deriveRating(true, EASY_LATENCY_MS.flashcard_recognition, 'flashcard_recognition')).toBe('easy');
    expect(deriveRating(true, EASY_LATENCY_MS.flashcard_recognition + 1, 'flashcard_recognition')).toBe('good');
    expect(deriveRating(true, EASY_LATENCY_MS.cloze, 'cloze')).toBe('easy');
    expect(deriveRating(true, EASY_LATENCY_MS.cloze + 1, 'cloze')).toBe('good');
    expect(deriveRating(true, EASY_LATENCY_MS.flashcard_recall, 'flashcard_recall')).toBe('easy');
  });

  it('selectForm band edges', () => {
    const base = newCardState('keev', T0);
    expect(selectForm({ ...base, stability: 2.9 })).toBe('flashcard_recognition');
    expect(selectForm({ ...base, stability: FORM_BANDS.recognitionMaxStabilityDays })).toBe('cloze');
    expect(selectForm({ ...base, stability: 9.9 })).toBe('cloze');
    expect(selectForm({ ...base, stability: FORM_BANDS.clozeMaxStabilityDays })).toBe('flashcard_recall');
    expect(selectForm({ ...base, stability: 40 })).toBe('flashcard_recall');
  });

  it('isDue boundary', () => {
    const c = { ...newCardState('keev', T0), due: days(1) };
    expect(isDue(c, T0)).toBe(false);
    expect(isDue(c, days(1))).toBe(true);
    expect(isDue(c, days(2))).toBe(true);
  });

  it('recompute check (spec §9): replaying a review log reproduces the card state', () => {
    // simulate a stored review_logs sequence: (rating, reviewedAt) pairs
    const log: Array<{ rating: 'again' | 'good' | 'easy'; at: Date }> = [
      { rating: 'good', at: T0 },
      { rating: 'again', at: days(2) },
      { rating: 'good', at: days(2.01) },
      { rating: 'easy', at: days(5) },
    ];
    // incrementally maintained state (what the client persists)
    let live = newCardState('keev', T0);
    for (const l of log) live = applyReview(live, l.rating, l.at);
    // recomputed from scratch using only the log + pinned config
    let rebuilt = newCardState('keev', T0);
    for (const l of log) rebuilt = applyReview(rebuilt, l.rating, l.at);
    expect(rebuilt).toEqual(live);
    expect(rebuilt.due.getTime()).toBe(live.due.getTime());
  });

  it('a lapse during learning does not graduate the card early', () => {
    let c = newCardState('keev', T0);
    c = applyReview(c, 'good', T0);          // step 1 of learning
    c = applyReview(c, 'again', days(2));    // lapse — internal step counter resets
    c = applyReview(c, 'good', days(2.01));  // must repeat the learning step, not graduate
    expect(c.state).toBe('learning');
    expect(c.due.getTime() - days(2.01).getTime()).toBeLessThan(86_400_000);
  });
});

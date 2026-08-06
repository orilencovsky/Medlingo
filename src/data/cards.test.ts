import { describe, it, expect, vi, beforeEach } from 'vitest';

const tables: Record<string, { rows: unknown[]; insertError: Error | null }> = {};
function resetDb() {
  for (const t of ['user_card_state', 'dictionary_entries', 'unit_items', 'review_logs']) {
    tables[t] = { rows: [], insertError: null };
  }
}

// Minimal chainable supabase mock: from(t).select().in()/eq() resolves rows;
// insert/upsert append; thrown insertError simulates network failure.
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) },
    from: (table: string) => {
      const t = () => tables[table];
      const result = (rows: unknown[]) => Promise.resolve({ data: rows, error: null });
      const chain = {
        select: () => chain,
        in: (_c: string, ids: string[]) =>
          result(t().rows.filter((r) => ids.includes((r as { id?: string; entry_id?: string }).id ?? (r as { entry_id: string }).entry_id))),
        eq: () => chain,
        then: (res: (v: { data: unknown[]; error: null }) => void) =>
          Promise.resolve({ data: t().rows, error: null }).then(res),
        insert: (row: unknown) => {
          if (t().insertError) return Promise.resolve({ data: null, error: t().insertError });
          t().rows.push(row);
          return Promise.resolve({ data: row, error: null });
        },
        upsert: (row: unknown, _opts?: unknown) => {
          if (t().insertError) return Promise.resolve({ data: null, error: t().insertError });
          t().rows.push(...(Array.isArray(row) ? row : [row]));
          return Promise.resolve({ data: row, error: null });
        },
      };
      return chain;
    },
  },
}));

import {
  seedNewCards, submitReview, flushPendingReviews, loadDueCards,
} from './cards';

const T0 = new Date('2026-07-10T08:00:00Z');

describe('cards data layer', () => {
  beforeEach(() => {
    resetDb();
    localStorage.clear();
  });

  it('seedNewCards upserts a new-state row per entry', async () => {
    await seedNewCards(['keev', 'chom'], T0);
    expect(tables.user_card_state.rows).toHaveLength(2);
  });

  it('submitReview writes a log and updates card state', async () => {
    await seedNewCards(['keev'], T0);
    const next = await submitReview(
      { entryId: 'keev', form: 'flashcard_recognition', correct: true, latencyMs: 2000 }, T0,
    );
    expect(tables.review_logs.rows).toHaveLength(1);
    const log = tables.review_logs.rows[0] as { rating: string; counts_for_scheduling: boolean };
    expect(log.rating).toBe('easy');
    expect(log.counts_for_scheduling).toBe(true);
    expect(next.reps).toBe(1);
  });

  it('countsForScheduling=false logs but does not touch card state', async () => {
    await seedNewCards(['keev'], T0);
    const before = tables.user_card_state.rows.length;
    await submitReview(
      { entryId: 'keev', form: 'cloze', correct: true, latencyMs: 9000, countsForScheduling: false }, T0,
    );
    expect(tables.review_logs.rows).toHaveLength(1);
    expect(tables.user_card_state.rows).toHaveLength(before);
  });

  it('network failure enqueues; flushPendingReviews drains', async () => {
    await seedNewCards(['keev'], T0);
    tables.review_logs.insertError = new Error('fetch failed');
    await submitReview({ entryId: 'keev', form: 'cloze', correct: true, latencyMs: 5000 }, T0);
    expect(JSON.parse(localStorage.getItem('medlingo.pendingReviews')!)).toHaveLength(1);

    tables.review_logs.insertError = null;
    const flushed = await flushPendingReviews();
    expect(flushed).toBe(1);
    expect(JSON.parse(localStorage.getItem('medlingo.pendingReviews')!)).toHaveLength(0);
  });

  it('loadDueCards returns only due cards joined with entries', async () => {
    tables.user_card_state.rows = [
      { user_id: 'u1', entry_id: 'keev', due: T0.toISOString(), stability: 1, difficulty: 5,
        reps: 1, lapses: 0, state: 'learning', last_review: null },
      { user_id: 'u1', entry_id: 'chom', due: new Date(T0.getTime() + 86_400_000).toISOString(),
        stability: 1, difficulty: 5, reps: 1, lapses: 0, state: 'learning', last_review: null },
    ];
    tables.dictionary_entries.rows = [
      { id: 'keev', hebrew: 'כאב', hebrew_nikud: 'כְּאֵב', part_of_speech: 'noun', level: 1,
        gender: 'ז', plural: 'כאבים', root: null, everyday_synonym: null,
        translations: { en: 'pain' }, notes: null },
    ];
    tables.unit_items.rows = [
      { unit_slug: 'unit-01-intake', entry_id: 'keev', display_order: 2,
        context_sentences: [{ he: 'יש לי כאב', translations: { en: 'I have pain' } }] },
    ];
    const due = await loadDueCards(T0);
    expect(due).toHaveLength(1);
    expect(due[0].entry.translations.en).toBe('pain');
    expect(due[0].contextSentences[0].he).toBe('יש לי כאב');
  });

  it('drops a queued review after 3 failed flush attempts so it cannot block the queue', async () => {
    await seedNewCards(['keev', 'chom'], T0);
    tables.review_logs.insertError = new Error('fetch failed');
    await submitReview({ entryId: 'keev', form: 'cloze', correct: true, latencyMs: 5000 }, T0);
    await submitReview({ entryId: 'chom', form: 'cloze', correct: true, latencyMs: 5000 }, T0);
    expect(JSON.parse(localStorage.getItem('medlingo.pendingReviews')!)).toHaveLength(2);

    // three flushes while still failing: head item accumulates attempts, then drops
    expect(await flushPendingReviews()).toBe(0);
    expect(await flushPendingReviews()).toBe(0);
    expect(await flushPendingReviews()).toBe(0);
    expect(JSON.parse(localStorage.getItem('medlingo.pendingReviews')!)).toHaveLength(1);

    // queue unblocked: the surviving item flushes once the network is back
    tables.review_logs.insertError = null;
    expect(await flushPendingReviews()).toBe(1);
    expect(JSON.parse(localStorage.getItem('medlingo.pendingReviews')!)).toHaveLength(0);
  });
});

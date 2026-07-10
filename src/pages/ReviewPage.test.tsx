import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import type { ReviewCard, DictionaryEntry } from '../lib/types';

function entry(id: string, hebrew: string, en: string): DictionaryEntry {
  return {
    id, hebrew, hebrewNikud: hebrew, partOfSpeech: 'noun', level: 1,
    gender: null, plural: null, root: null, everydaySynonym: null,
    translations: { en }, notes: null,
  };
}
function reviewCard(id: string, hebrew: string, en: string): ReviewCard {
  return {
    card: {
      entryId: id, due: new Date('2026-07-10T00:00:00Z'), stability: 1, difficulty: 5,
      reps: 1, lapses: 0, learningSteps: 0, state: 'learning', lastReview: null,
    },
    entry: entry(id, hebrew, en),
    contextSentences: [{ he: `משפט עם ${hebrew}.`, translations: { en: `sentence with ${en}` } }],
  };
}

const db = {
  due: [] as ReviewCard[],
  upcoming: [] as ReviewCard[],
  pool: [
    entry('keev', 'כאב', 'pain'), entry('chom', 'חום', 'fever'),
    entry('dofek', 'דופק', 'pulse'), entry('bchila', 'בחילה', 'nausea'),
    entry('trufa', 'תרופה', 'medication'),
  ],
  submitted: [] as Array<{ entryId: string; countsForScheduling?: boolean }>,
};

vi.mock('../data/cards', () => ({
  loadDueCards: () => Promise.resolve(db.due),
  loadUpcomingCards: () => Promise.resolve(db.upcoming),
  loadEntryPool: () => Promise.resolve(db.pool),
  submitReview: (input: { entryId: string; countsForScheduling?: boolean }) => {
    db.submitted.push(input);
    return Promise.resolve(reviewCard(input.entryId, 'x', 'x').card);
  },
  flushPendingReviews: () => Promise.resolve(0),
}));
const touchStreak = vi.fn().mockResolvedValue(undefined);
vi.mock('../data/profile', () => ({ touchStreak: () => touchStreak() }));

import { ReviewPage } from './ReviewPage';

async function answerCurrent(correct: boolean, correctHebrewOrEnglish: string) {
  const buttons = await screen.findAllByTestId(/exercise-(option|tile)-/);
  const target = correct
    ? buttons.find((b) => b.textContent === correctHebrewOrEnglish)!
    : buttons.find((b) => b.textContent !== correctHebrewOrEnglish)!;
  await userEvent.click(target);
  await userEvent.click(screen.getByTestId('exercise-continue'));
}

describe('ReviewPage', () => {
  beforeEach(() => {
    db.due = [];
    db.upcoming = [];
    db.submitted = [];
    touchStreak.mockClear();
  });

  it('runs through due cards and shows the summary', async () => {
    db.due = [reviewCard('keev', 'כאב', 'pain')];
    render(<MemoryRouter><ReviewPage /></MemoryRouter>);
    await answerCurrent(true, 'pain'); // stability 1 → recognition form
    expect(await screen.findByTestId('review-summary')).toBeInTheDocument();
    expect(db.submitted).toHaveLength(1);
    expect(touchStreak).toHaveBeenCalledOnce();
  });

  it('requeues a wrong answer once', async () => {
    db.due = [reviewCard('keev', 'כאב', 'pain')];
    render(<MemoryRouter><ReviewPage /></MemoryRouter>);
    await answerCurrent(false, 'pain');           // wrong → requeued
    await answerCurrent(true, 'pain');            // asked again
    expect(await screen.findByTestId('review-summary')).toBeInTheDocument();
    expect(db.submitted).toHaveLength(2);
  });

  it('shows caught-up state with extra practice when nothing is due', async () => {
    db.upcoming = [reviewCard('chom', 'חום', 'fever')];
    render(<MemoryRouter><ReviewPage /></MemoryRouter>);
    expect(await screen.findByTestId('review-caught-up')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('review-extra-practice'));
    await answerCurrent(true, 'fever');
    expect(await screen.findByTestId('review-summary')).toBeInTheDocument();
    expect(db.submitted[0].countsForScheduling).toBe(false);
  });
});

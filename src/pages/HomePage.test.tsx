import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import type { CardState } from '../lib/types';

const intakeUnit = {
  slug: 'unit-01-intake', level: 1, displayOrder: 1, status: 'published',
  title: { en: 'Patient intake' }, dialogue: [],
};
const db = {
  progress: 'not_started' as 'not_started' | 'in_progress' | 'completed',
  due: [] as unknown[],
  upcoming: [] as Array<{ card: CardState }>,
  cards: [] as CardState[],
  units: [intakeUnit] as unknown[],
};
const touchStreak = vi.fn().mockResolvedValue(undefined);

vi.mock('../data/units', () => ({
  loadUnits: () => Promise.resolve(db.units),
  loadUnitProgress: () => Promise.resolve(db.progress),
}));
vi.mock('../data/cards', () => ({
  loadDueCards: () => Promise.resolve(db.due),
  loadUpcomingCards: () => Promise.resolve(db.upcoming),
  loadAllCards: () => Promise.resolve(db.cards),
}));
vi.mock('../data/profile', () => ({
  getProfile: () => Promise.resolve({
    userId: 'u1', displayName: 'Dr. Test', uiLanguage: 'en', isAdmin: false,
    streakCurrent: 3, streakLongest: 5, lastActiveDate: '2026-07-09',
  }),
  touchStreak: () => touchStreak(),
}));

import { HomePage } from './HomePage';

function card(entryId: string, state: CardState['state'], stability: number, reps: number): CardState {
  return {
    entryId, due: new Date(), stability, difficulty: 5, reps, lapses: 0,
    learningSteps: 0, state, lastReview: null,
  };
}

describe('HomePage', () => {
  beforeEach(() => {
    db.progress = 'not_started'; db.due = []; db.upcoming = []; db.cards = [];
    db.units = [intakeUnit];
    touchStreak.mockClear();
  });

  it('first run: prompts to start the unit', async () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByTestId('home-unit-card')).toHaveTextContent('Start');
    expect(screen.getByText('Start your first unit to begin learning.')).toBeInTheDocument();
  });

  it('shows due count and progress counts', async () => {
    db.progress = 'completed';
    db.due = [1, 2, 3];
    db.cards = [
      card('a', 'review', 8, 5),   // known + learned
      card('b', 'learning', 1, 2), // learned
      card('c', 'new', 0, 0),      // neither
    ];
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByTestId('home-review-card')).toHaveTextContent('3 words due');
    expect(screen.getByTestId('home-streak')).toHaveTextContent('3-day streak');
    expect(screen.getByText('2 learned')).toBeInTheDocument();
    expect(screen.getByText('1 known')).toBeInTheDocument();
  });

  it('caught-up state touches the streak and offers extra practice', async () => {
    db.progress = 'completed';
    db.due = [];
    db.cards = [card('a', 'review', 8, 5)];
    db.upcoming = [{ card: card('a', 'review', 8, 5) }];
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByTestId('home-review-card')).toHaveTextContent('All caught up');
    expect(touchStreak).toHaveBeenCalledOnce();
    expect(screen.getByText('Extra practice')).toBeInTheDocument();
  });

  it('renders a card per visible unit, marking drafts', async () => {
    db.units = [
      intakeUnit,
      { slug: 'unit-02-vitals', level: 1, displayOrder: 2, status: 'draft',
        title: { en: 'Vital signs' }, dialogue: [] },
      { slug: 'unit-03-physical-exam', level: 1, displayOrder: 3, status: 'draft',
        title: { en: 'Physical examination' }, dialogue: [] },
    ];
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    const cards = await screen.findAllByTestId('home-unit-card');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveTextContent('Patient intake');
    expect(cards[1]).toHaveTextContent('Vital signs');
    expect(cards[1]).toHaveTextContent('Draft');
    expect(cards[0]).not.toHaveTextContent('Draft');
  });

  it('caught-up visit touches the streak exactly once under StrictMode', async () => {
    db.progress = 'completed';
    db.due = [];
    db.cards = [card('a', 'review', 8, 5)];
    db.upcoming = [{ card: card('a', 'review', 8, 5) }];
    render(
      <StrictMode>
        <MemoryRouter><HomePage /></MemoryRouter>
      </StrictMode>,
    );
    await screen.findByTestId('home-review-card');
    expect(touchStreak).toHaveBeenCalledTimes(1);
  });
});

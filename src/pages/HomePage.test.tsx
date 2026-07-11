import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import i18n, { applyLanguage } from '../lib/i18n';
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
  entryIds: {} as Record<string, string[]>,
};
const touchStreak = vi.fn().mockResolvedValue(undefined);
const setUiLanguage = vi.fn().mockResolvedValue(undefined);
const profile = {
  userId: 'u1', displayName: 'Dr. Test', uiLanguage: 'en', isAdmin: false,
  streakCurrent: 3, streakLongest: 5, lastActiveDate: '2026-07-09',
};

vi.mock('../data/units', () => ({
  loadUnits: () => Promise.resolve(db.units),
  loadUnitProgress: () => Promise.resolve(db.progress),
  loadUnitEntryIds: () => Promise.resolve(db.entryIds),
}));
vi.mock('../data/cards', () => ({
  loadDueCards: () => Promise.resolve(db.due),
  loadUpcomingCards: () => Promise.resolve(db.upcoming),
  loadAllCards: () => Promise.resolve(db.cards),
}));
vi.mock('../data/profile', () => ({
  getProfile: () => Promise.resolve(profile),
  touchStreak: () => touchStreak(),
  setUiLanguage: (lang: string) => setUiLanguage(lang),
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
    db.entryIds = {};
    touchStreak.mockClear();
    setUiLanguage.mockClear();
    profile.uiLanguage = 'en';
  });

  afterEach(async () => {
    await applyLanguage('en');
  });

  it('applies the profile ui language on load', async () => {
    profile.uiLanguage = 'ru';
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    await screen.findByTestId('home-review-card');
    await vi.waitFor(() => expect(i18n.language).toBe('ru'));
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
    const strip = screen.getByTestId('stats-strip');
    expect(strip).toHaveTextContent('3');
    expect(strip).toHaveTextContent('Day streak');
    expect(strip).toHaveTextContent('2');
    expect(strip).toHaveTextContent('Learned');
    expect(strip).toHaveTextContent('1');
    expect(strip).toHaveTextContent('Mastered');
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

  it('hides the drill link by default and shows it when VITE_ENABLE_DRILL is set', async () => {
    db.progress = 'completed';
    db.due = [];
    db.cards = [card('a', 'review', 8, 5)];
    db.upcoming = [{ card: card('a', 'review', 8, 5) }];
    const { unmount } = render(<MemoryRouter><HomePage /></MemoryRouter>);
    await screen.findByText('Extra practice');
    expect(screen.queryByText('AI practice drill')).not.toBeInTheDocument();
    unmount();

    vi.stubEnv('VITE_ENABLE_DRILL', 'true');
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByText('AI practice drill')).toBeInTheDocument();
    vi.unstubAllEnvs();
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

describe('dashboard', () => {
  beforeEach(() => {
    db.progress = 'not_started'; db.due = []; db.upcoming = []; db.cards = [];
    db.units = [intakeUnit];
    db.entryIds = {};
    touchStreak.mockClear();
  });

  it('renders the stats strip with due, mastered, and learned counts', async () => {
    db.cards = [
      card('a', 'review', 10, 3),  // mastered + learned
      card('b', 'learning', 1, 1), // learned only
      card('c', 'new', 0, 0),      // neither
    ];
    db.due = [{}, {}];
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    const strip = await screen.findByTestId('stats-strip');
    expect(strip).toHaveTextContent('Day streak');
    expect(screen.getByTestId('stat-due')).toHaveTextContent('2');
    expect(strip).toHaveTextContent('Mastered');
    expect(strip).toHaveTextContent('Learned');
  });

  it('shows coverage percent per unit', async () => {
    db.entryIds = { 'unit-01-intake': ['a', 'b', 'c', 'd'] };
    db.cards = [card('a', 'learning', 1, 2), card('b', 'review', 8, 5)];
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByTestId('unit-progress-text')).toHaveTextContent('2/4 · 50%');
    expect(screen.getByTestId('unit-progress-fill')).toHaveStyle({ width: '50%' });
  });

  it('shows 0% when the unit has no started entries', async () => {
    db.entryIds = { 'unit-01-intake': ['a', 'b'] };
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByTestId('unit-progress-text')).toHaveTextContent('0/2 · 0%');
  });

  it('renders no progress bar for a unit with zero items', async () => {
    db.entryIds = {};
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    await screen.findByTestId('home-unit-card');
    expect(screen.queryByTestId('unit-progress-bar')).not.toBeInTheDocument();
  });
});

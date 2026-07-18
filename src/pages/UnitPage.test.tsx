import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import '../lib/i18n';
import type { DictionaryEntry } from '../lib/types';

function entry(id: string, hebrew: string, en: string): DictionaryEntry {
  return {
    id, hebrew, hebrewNikud: hebrew, partOfSpeech: 'noun', level: 1,
    gender: 'ז', plural: null, root: null, everydaySynonym: null,
    translations: { en }, notes: null, category: null,
  };
}

const unitData = {
  unit: {
    slug: 'unit-01-intake', level: 1 as const, displayOrder: 1, status: 'published' as const,
    title: { en: 'Patient intake' },
    dialogue: [
      { order: 1, speaker: 'רופאה', he: 'יש לך כאב?', translations: { en: 'Do you have pain?' } },
      { order: 2, speaker: 'מטופל', he: 'כן, יש לי חום.', translations: { en: 'Yes, I have fever.' } },
    ],
  },
  items: [
    { entryId: 'keev', displayOrder: 1, entry: entry('keev', 'כאב', 'pain'),
      contextSentences: [{ he: 'יש לך כאב?', translations: { en: 'Do you have pain?' } }] },
    { entryId: 'chom', displayOrder: 2, entry: entry('chom', 'חום', 'fever'),
      contextSentences: [{ he: 'כן, יש לי חום.', translations: { en: 'Yes, I have fever.' } }] },
  ],
};

const seedNewCards = vi.fn().mockResolvedValue(undefined);
const submitReview = vi.fn().mockResolvedValue({});
const completeUnit = vi.fn().mockResolvedValue(undefined);
const startUnit = vi.fn().mockResolvedValue(undefined);

vi.mock('../data/units', () => ({
  loadUnit: () => Promise.resolve(unitData),
  loadUnitProgress: () => Promise.resolve('not_started'),
  startUnit: (...a: unknown[]) => startUnit(...a),
  completeUnit: (...a: unknown[]) => completeUnit(...a),
}));
vi.mock('../data/cards', () => ({
  seedNewCards: (...a: unknown[]) => seedNewCards(...a),
  submitReview: (...a: unknown[]) => submitReview(...a),
  loadEntryPool: () => Promise.resolve(unitData.items.map((i) => i.entry)),
}));

import { UnitPage } from './UnitPage';

async function completeExercise() {
  const buttons = await screen.findAllByTestId(/exercise-(option|tile)-/);
  await userEvent.click(buttons[0]);
  await userEvent.click(screen.getByTestId('exercise-continue'));
}

describe('UnitPage', () => {
  beforeEach(() => {
    seedNewCards.mockClear(); submitReview.mockClear();
    completeUnit.mockClear(); startUnit.mockClear();
  });

  it('walks scenario → vocab → practice → completion', async () => {
    render(
      <MemoryRouter initialEntries={['/unit/unit-01-intake']}>
        <Routes><Route path="/unit/:slug" element={<UnitPage />} /></Routes>
      </MemoryRouter>,
    );
    // scenario
    expect(await screen.findByText('Do you have pain?')).toBeInTheDocument();
    expect(startUnit).toHaveBeenCalledWith('unit-01-intake');
    await userEvent.click(screen.getByTestId('unit-start'));
    // vocab intro: 2 cards
    await userEvent.click(await screen.findByTestId('unit-vocab-continue'));
    await userEvent.click(await screen.findByTestId('unit-vocab-continue'));
    // practice begins → seeded once
    expect(seedNewCards).toHaveBeenCalledTimes(1);
    expect(seedNewCards.mock.calls[0][0]).toEqual(['keev', 'chom']);
    // 2 entries × (recognition + cloze) = 4 exercises
    for (let i = 0; i < 4; i++) await completeExercise();
    expect(submitReview).toHaveBeenCalledTimes(4);
    // completion
    expect(await screen.findByTestId('unit-complete')).toBeInTheDocument();
    expect(completeUnit).toHaveBeenCalledWith('unit-01-intake');
  });

  it('opens a gloss when tapping a unit word in the dialogue', async () => {
    render(
      <MemoryRouter initialEntries={['/unit/unit-01-intake']}>
        <Routes><Route path="/unit/:slug" element={<UnitPage />} /></Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Do you have pain?');
    const glossButtons = screen.getAllByTestId('unit-gloss');
    await userEvent.click(glossButtons[0]);
    expect(await screen.findByTestId('unit-gloss-panel')).toHaveTextContent('pain');
  });

  it('double-clicking the final vocab Continue seeds cards exactly once', async () => {
    render(
      <MemoryRouter initialEntries={['/unit/unit-01-intake']}>
        <Routes><Route path="/unit/:slug" element={<UnitPage />} /></Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Do you have pain?');
    await userEvent.click(screen.getByTestId('unit-start'));
    await userEvent.click(await screen.findByTestId('unit-vocab-continue')); // card 1 → card 2
    const finalContinue = await screen.findByTestId('unit-vocab-continue');
    fireEvent.click(finalContinue);
    fireEvent.click(finalContinue); // second tap lands before enterPractice's await resolves
    await screen.findAllByTestId(/exercise-(option|tile)-/); // practice phase reached
    expect(seedNewCards).toHaveBeenCalledTimes(1);
  });
});

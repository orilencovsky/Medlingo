import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import '../lib/i18n';
import { AnatomyPage } from './AnatomyPage';

const seedNewCards = vi.fn(async (_ids: string[]) => {});
vi.mock('../data/cards', () => ({
  // heart is already in the learner's review; femur is not
  loadAllCards: vi.fn(async () => [{ entryId: 'heart' }]),
  seedNewCards: (ids: string[]) => seedNewCards(ids),
}));

vi.mock('../data/anatomy', () => ({
  fetchAnatomyCards: vi.fn(async () => [
    {
      entry: { id: 'heart', hebrew: 'לב', hebrewNikud: 'לֵב', partOfSpeech: 'noun', level: 1,
        gender: 'ז', plural: null, root: null, everydaySynonym: null,
        translations: { en: 'heart' }, notes: null, category: null, topic: 'anatomy' },
      region: 'chest', system: 'cardiovascular', imageUrl: 'https://example.test/heart.png', imageCredit: null,
    },
    {
      entry: { id: 'femur', hebrew: 'עצם ירך', hebrewNikud: 'עֶצֶם יָרֵךְ', partOfSpeech: 'noun', level: 1,
        gender: null, plural: null, root: null, everydaySynonym: null,
        translations: { en: 'femur' }, notes: null, category: null, topic: 'anatomy' },
      region: 'limbs', system: 'musculoskeletal', imageUrl: 'https://example.test/femur.png', imageCredit: null,
    },
  ]),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/anatomy']}>
      <Routes><Route path="/anatomy" element={<AnatomyPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('AnatomyPage', () => {
  it('shows every card grouped by system when region is "all"', async () => {
    renderPage();
    expect(await screen.findByText('heart')).toBeInTheDocument();
    expect(screen.getByText('femur')).toBeInTheDocument();
  });

  it('filters to one region when a region chip is clicked', async () => {
    renderPage();
    await screen.findByText('heart');
    await userEvent.click(screen.getByRole('button', { name: /limbs|גפיים/i }));
    expect(screen.getByText('femur')).toBeInTheDocument();
    expect(screen.queryByText('heart')).not.toBeInTheDocument();
  });

  it('seeds only the not-yet-added shown terms into review', async () => {
    seedNewCards.mockClear();
    renderPage();
    await screen.findByText('heart');
    await userEvent.click(screen.getByTestId('anatomy-add-to-review'));
    expect(seedNewCards).toHaveBeenCalledWith(['femur']);
    // after seeding everything shown, the button flips to the all-in-review state
    expect(screen.getByTestId('anatomy-add-to-review')).toBeDisabled();
  });

  it('marks already-added terms and highlights the selected region zone', async () => {
    renderPage();
    await screen.findByText('heart');
    expect(screen.getAllByText(/In review|בחזרה/)).not.toHaveLength(0);
    expect(screen.queryByTestId('body-zone-chest')).not.toHaveAttribute('data-active');
    await userEvent.click(screen.getByRole('button', { name: /chest|בית חזה/i }));
    expect(screen.getByTestId('body-zone-chest')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('body-zone-limbs')).not.toHaveAttribute('data-active');
  });
});

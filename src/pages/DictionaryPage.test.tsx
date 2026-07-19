import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import type { DictionaryEntry } from '../lib/types';

const entries: DictionaryEntry[] = [
  { id: 'a', hebrew: 'תלונה', hebrewNikud: 'תְּלוּנָה', partOfSpeech: 'noun', level: 1, gender: 'נ',
    plural: 'תלונות', root: null, everydaySynonym: null, translations: { en: 'complaint' }, notes: null, category: null, topic: 'cardiology' },
  { id: 'b', hebrew: 'חום', hebrewNikud: 'חוֹם', partOfSpeech: 'noun', level: 1, gender: 'ז',
    plural: null, root: null, everydaySynonym: null, translations: { en: 'fever' }, notes: null, category: null, topic: 'symptoms' },
];
vi.mock('../data/dictionary', () => ({
  fetchDictionary: vi.fn(async () => entries),
  filterEntries: (list: DictionaryEntry[], q: string) =>
    q.trim() === '' ? list : list.filter((e) => (e.hebrew + ' ' + e.translations.en).toLowerCase().includes(q.toLowerCase())),
}));

import { DictionaryPage } from './DictionaryPage';

function renderPage() {
  return render(<MemoryRouter><DictionaryPage /></MemoryRouter>);
}

describe('DictionaryPage', () => {
  beforeEach(() => vi.clearAllMocks());
  it('renders a card per non-empty topic with counts and links to the topic', async () => {
    renderPage();
    const card = await screen.findByRole('link', { name: /Cardiology/i });
    expect(card.getAttribute('href')).toBe('/dictionary/cardiology');
  });
  it('always offers an all-words card', async () => {
    renderPage();
    const all = await screen.findByRole('link', { name: /all words/i });
    expect(all.getAttribute('href')).toBe('/dictionary/all');
  });
});

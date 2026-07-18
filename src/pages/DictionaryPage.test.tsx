import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import type { DictionaryEntry } from '../lib/types';

const entries: DictionaryEntry[] = [
  { id: 'a', hebrew: 'תלונה', hebrewNikud: 'תְּלוּנָה', partOfSpeech: 'noun', level: 1, gender: 'נ',
    plural: 'תלונות', root: null, everydaySynonym: null, translations: { en: 'complaint' }, notes: null, category: null },
  { id: 'b', hebrew: 'חום', hebrewNikud: 'חוֹם', partOfSpeech: 'noun', level: 1, gender: 'ז',
    plural: null, root: null, everydaySynonym: null, translations: { en: 'fever' }, notes: null, category: null },
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
  it('lists fetched words', async () => {
    renderPage();
    expect(await screen.findByText('תלונה')).toBeTruthy();
    expect(screen.getByText('חום')).toBeTruthy();
    expect(screen.getByText('complaint')).toBeTruthy();
  });
  it('filters as the user types', async () => {
    renderPage();
    await screen.findByText('תלונה');
    await userEvent.type(screen.getByRole('searchbox'), 'fever');
    expect(screen.queryByText('תלונה')).toBeNull();
    expect(screen.getByText('חום')).toBeTruthy();
  });
});

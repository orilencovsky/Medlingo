import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import type { DictionaryEntry } from '../lib/types';

const entries: DictionaryEntry[] = [
  { id: 'a', hebrew: 'תלונה', hebrewNikud: 'תְּלוּנָה', partOfSpeech: 'noun', level: 1, gender: 'נ',
    plural: 'תלונות', root: null, everydaySynonym: null, translations: { en: 'complaint' }, notes: null, category: null, topic: null },
  { id: 'b', hebrew: 'חום', hebrewNikud: 'חוֹם', partOfSpeech: 'noun', level: 1, gender: 'ז',
    plural: null, root: null, everydaySynonym: null, translations: { en: 'fever' }, notes: null, category: null, topic: null },
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
  it('lists fetched words with nikud as the primary heading', async () => {
    renderPage();
    expect(await screen.findByText('תְּלוּנָה')).toBeTruthy();
    expect(screen.getByText('חוֹם')).toBeTruthy();
    expect(screen.getByText('complaint')).toBeTruthy();
    // plain hebrew still renders as the secondary line since it differs from the nikud form
    expect(screen.getByText('תלונה')).toBeTruthy();
    expect(screen.getByText('חום')).toBeTruthy();
  });
  it('filters as the user types', async () => {
    renderPage();
    await screen.findByText('תְּלוּנָה');
    await userEvent.type(screen.getByRole('searchbox'), 'fever');
    expect(screen.queryByText('תְּלוּנָה')).toBeNull();
    expect(screen.getByText('חוֹם')).toBeTruthy();
  });
});

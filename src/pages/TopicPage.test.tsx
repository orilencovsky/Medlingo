import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import '../lib/i18n';
import type { DictionaryEntry } from '../lib/types';

function e(id: string, hebrew: string, en: string, topic: DictionaryEntry['topic']): DictionaryEntry {
  return { id, hebrew, hebrewNikud: hebrew, partOfSpeech: 'noun', level: 1, gender: null,
    plural: null, root: null, everydaySynonym: null, translations: { en }, notes: null, category: null, topic };
}
const entries = [e('a', 'לב', 'heart', 'cardiology'), e('b', 'חום', 'fever', 'symptoms')];
vi.mock('../data/dictionary', () => ({
  fetchDictionary: vi.fn(async () => entries),
  filterEntries: (list: DictionaryEntry[], q: string) =>
    q.trim() === '' ? list : list.filter((x) => (x.hebrew + ' ' + x.translations.en).toLowerCase().includes(q.toLowerCase())),
}));
import { TopicPage } from './TopicPage';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/dictionary/:topic" element={<TopicPage />} /></Routes>
  </MemoryRouter>);
}

describe('TopicPage', () => {
  beforeEach(() => vi.clearAllMocks());
  it('shows only the requested topic', async () => {
    renderAt('/dictionary/cardiology');
    expect(await screen.findByText('לב')).toBeTruthy();
    expect(screen.queryByText('חום')).toBeNull();
  });
  it('all shows every word', async () => {
    renderAt('/dictionary/all');
    expect(await screen.findByText('לב')).toBeTruthy();
    expect(screen.getByText('חום')).toBeTruthy();
  });
  it('an unknown topic renders no word rows and does not crash', async () => {
    renderAt('/dictionary/not-a-real-topic');
    expect(await screen.findByText(/no words match/i)).toBeTruthy();
    expect(screen.queryByText('לב')).toBeNull();
    expect(screen.queryByText('חום')).toBeNull();
  });
  it('filters results as the user types in the searchbox', async () => {
    renderAt('/dictionary/all');
    await screen.findByText('לב');
    expect(screen.getByText('חום')).toBeTruthy();
    await userEvent.type(screen.getByRole('searchbox'), 'לב');
    expect(screen.getByText('לב')).toBeTruthy();
    expect(screen.queryByText('חום')).toBeNull();
  });
});

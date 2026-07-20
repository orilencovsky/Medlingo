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
const entries = [
  e('a', 'לב', 'heart', 'cardiology'), e('b', 'חום', 'fever', 'symptoms'),
  e('c', 'עצם', 'bone', 'anatomy'), e('d', 'ריאה', 'lung', 'respiratory'),
  e('e', 'משהו', 'something', null),
];
vi.mock('../data/dictionary', () => ({
  fetchDictionary: vi.fn(async () => entries),
  filterEntries: (list: DictionaryEntry[], q: string) =>
    q.trim() === '' ? list : list.filter((x) => (x.hebrew + ' ' + x.translations.en).toLowerCase().includes(q.toLowerCase())),
}));
import { TopicPage } from './TopicPage';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/dictionary" element={<div>GRID</div>} />
      <Route path="/dictionary/:topic" element={<TopicPage />} />
    </Routes>
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
  it('an unknown topic redirects to the grid', async () => {
    renderAt('/dictionary/not-a-real-topic');
    expect(await screen.findByText('GRID')).toBeTruthy();
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
  it('groups the all-words list under topic headers, alphabetical, with untagged words pinned last', async () => {
    const { container } = renderAt('/dictionary/all');
    await screen.findByText('לב');
    const text = container.textContent ?? '';
    const order = ['Anatomy', 'Cardiology', 'Respiratory', 'Symptoms', 'Miscellaneous']
      .map((label) => text.indexOf(label));
    expect(order.every((i) => i >= 0)).toBe(true);
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });
  it('does not sort the untagged section alphabetically among the rest', async () => {
    // Respiratory ('R') sorts after Miscellaneous ('M') alphabetically — a naive
    // alpha-only sort would place Miscellaneous BEFORE Respiratory. Pinning it last
    // means Respiratory must still precede Miscellaneous.
    const { container } = renderAt('/dictionary/all');
    await screen.findByText('לב');
    const text = container.textContent ?? '';
    expect(text.indexOf('Respiratory')).toBeLessThan(text.indexOf('Miscellaneous'));
  });
  it('omits a topic header when search leaves no matching words in that group', async () => {
    renderAt('/dictionary/all');
    await screen.findByText('לב');
    await userEvent.type(screen.getByRole('searchbox'), 'bone');
    expect(await screen.findByText('Anatomy')).toBeTruthy();
    expect(screen.queryByText('Cardiology')).toBeNull();
    expect(screen.queryByText('Symptoms')).toBeNull();
    expect(screen.queryByText('Respiratory')).toBeNull();
    expect(screen.queryByText('Miscellaneous')).toBeNull();
  });
});

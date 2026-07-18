import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import type { AdminEntry } from '../lib/types';

const entries: AdminEntry[] = [
  { id: 'a', hebrew: 'תלונה', hebrewNikud: 'תְּלוּנָה', partOfSpeech: 'noun', level: 1, gender: 'נ',
    plural: null, root: null, everydaySynonym: null, translations: { en: 'complaint' }, notes: null,
    category: null, reviewState: 'unreviewed', reviewPriority: 1, isDeprecated: false },
];
const { saveEditDraft, markReviewed } = vi.hoisted(() => ({
  saveEditDraft: vi.fn(async () => {}),
  markReviewed: vi.fn(async () => {}),
}));
vi.mock('../data/reviewConsole', () => ({
  fetchAdminEntries: vi.fn(async () => entries),
  entryToPayload: (e: AdminEntry) => ({ id: e.id, hebrew: e.hebrew, hebrew_nikud: e.hebrewNikud,
    part_of_speech: e.partOfSpeech, level: e.level, gender: e.gender, plural: e.plural, root: e.root,
    everyday_synonym: e.everydaySynonym, translations: e.translations, notes: e.notes, category: e.category }),
  saveEditDraft, markReviewed, createEntryDraft: vi.fn(), flagDelete: vi.fn(),
}));

import { AdminDictionaryPage } from './AdminDictionaryPage';

describe('AdminDictionaryPage', () => {
  beforeEach(() => vi.clearAllMocks());
  it('shows the word list and a progress count', async () => {
    render(<MemoryRouter><AdminDictionaryPage /></MemoryRouter>);
    expect(await screen.findByText('תלונה')).toBeTruthy();
    expect(screen.getByText(/0 \/ 1/)).toBeTruthy();
  });
  it('marks a word reviewed', async () => {
    render(<MemoryRouter><AdminDictionaryPage /></MemoryRouter>);
    await screen.findByText('תלונה');
    await userEvent.click(screen.getByRole('button', { name: /mark reviewed/i }));
    expect(markReviewed).toHaveBeenCalledWith('a');
  });
});

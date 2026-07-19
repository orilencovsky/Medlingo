import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import type { AdminEntry, EntryPayload } from '../lib/types';

const entries: AdminEntry[] = [
  { id: 'a', hebrew: 'תלונה', hebrewNikud: 'תְּלוּנָה', partOfSpeech: 'noun', level: 1, gender: 'נ',
    plural: null, root: null, everydaySynonym: null, translations: { en: 'complaint' }, notes: null,
    category: null, reviewState: 'unreviewed', reviewPriority: 1, isDeprecated: false },
];
const { saveEditDraft, markReviewed, createEntryDraft, flagDelete, fetchPendingEdits, decideEdit, getProfile } =
  vi.hoisted(() => ({
    saveEditDraft: vi.fn(async (_entryId: string, _payload: EntryPayload, _note: string | null) => {}),
    markReviewed: vi.fn(async (_id: string) => {}),
    createEntryDraft: vi.fn(async (_payload: EntryPayload, _note: string | null) => {}),
    flagDelete: vi.fn(async (_entryId: string, _note: string | null) => {}),
    fetchPendingEdits: vi.fn(async () => [] as import('../lib/types').EntryEdit[]),
    decideEdit: vi.fn(async (_editId: string, _decision: 'approved' | 'rejected') => {}),
    // Reviewer console tests don't need approver access; the one owner-view test below opts in per-call.
    getProfile: vi.fn(async (): Promise<{ canApprove: boolean } | null> => null),
  }));
vi.mock('../data/reviewConsole', () => ({
  fetchAdminEntries: vi.fn(async () => entries),
  entryToPayload: (e: AdminEntry) => ({ id: e.id, hebrew: e.hebrew, hebrew_nikud: e.hebrewNikud,
    part_of_speech: e.partOfSpeech, level: e.level, gender: e.gender, plural: e.plural, root: e.root,
    everyday_synonym: e.everydaySynonym, translations: e.translations, notes: e.notes, category: e.category }),
  saveEditDraft, markReviewed, createEntryDraft, flagDelete, fetchPendingEdits, decideEdit,
}));
vi.mock('../data/profile', () => ({ getProfile }));

import { AdminDictionaryPage } from './AdminDictionaryPage';

describe('AdminDictionaryPage', () => {
  beforeEach(() => vi.clearAllMocks());
  it('shows the word list and a progress count', async () => {
    render(<MemoryRouter><AdminDictionaryPage /></MemoryRouter>);
    expect(await screen.findByText('תְּלוּנָה')).toBeTruthy();
    // plain hebrew still renders as the secondary line since it differs from the nikud form
    expect(screen.getByText('תלונה')).toBeTruthy();
    expect(screen.getByText(/0 \/ 1/)).toBeTruthy();
  });
  it('marks a word reviewed', async () => {
    render(<MemoryRouter><AdminDictionaryPage /></MemoryRouter>);
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: /mark reviewed/i }));
    expect(markReviewed).toHaveBeenCalledWith('a');
  });
  it('editing a row and saving calls saveEditDraft with the entry id and payload', async () => {
    render(<MemoryRouter><AdminDictionaryPage /></MemoryRouter>);
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await userEvent.click(await screen.findByRole('button', { name: /save draft/i }));
    expect(saveEditDraft).toHaveBeenCalledTimes(1);
    const [entryId, payload, note] = saveEditDraft.mock.calls[0];
    expect(entryId).toBe('a');
    expect(payload).toEqual(expect.objectContaining({ hebrew: expect.any(String) }));
    expect(note === null || typeof note === 'string').toBe(true);
  });
  it('add word: empty id is blocked, typed id+hebrew calls createEntryDraft with that id', async () => {
    render(<MemoryRouter><AdminDictionaryPage /></MemoryRouter>);
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: /add word/i }));

    const saveButton = await screen.findByRole('button', { name: /save draft/i });
    expect(saveButton).toBeDisabled();
    await userEvent.click(saveButton);
    expect(createEntryDraft).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/id/i), 'new-word');
    await userEvent.type(screen.getByLabelText('hebrew'), 'מילה');
    expect(saveButton).not.toBeDisabled();
    await userEvent.click(saveButton);

    expect(createEntryDraft).toHaveBeenCalledTimes(1);
    const [payload] = createEntryDraft.mock.calls[0];
    expect(payload.id).toBeTruthy();
    expect(payload.id).toBe('new-word');
  });
  it('add word: trims leading/trailing whitespace from the typed id before saving', async () => {
    render(<MemoryRouter><AdminDictionaryPage /></MemoryRouter>);
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: /add word/i }));

    await userEvent.type(screen.getByLabelText(/id/i), '  new-word  ');
    await userEvent.type(screen.getByLabelText('hebrew'), 'מילה');
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    expect(createEntryDraft).toHaveBeenCalledTimes(1);
    const [payload] = createEntryDraft.mock.calls[0];
    expect(payload.id).toBe('new-word');
  });
  it('flagging a row for deletion calls flagDelete with the entry id and null note', async () => {
    render(<MemoryRouter><AdminDictionaryPage /></MemoryRouter>);
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: /flag for deletion/i }));
    expect(flagDelete).toHaveBeenCalledWith('a', null);
  });
  it('does not show the review queue for a non-approver', async () => {
    render(<MemoryRouter><AdminDictionaryPage /></MemoryRouter>);
    await screen.findByText('תְּלוּנָה');
    expect(screen.queryByText(/pending edits/i)).toBeNull();
  });
  it('shows the review queue for an approver', async () => {
    getProfile.mockResolvedValueOnce({ canApprove: true });
    render(<MemoryRouter><AdminDictionaryPage /></MemoryRouter>);
    await screen.findByText('תְּלוּנָה');
    expect(await screen.findByText(/pending edits/i)).toBeTruthy();
  });
});

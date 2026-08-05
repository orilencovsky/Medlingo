import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import type { AdminEntry, EntryEdit, EntryPayload } from '../lib/types';

const entries: AdminEntry[] = [
  { id: 'a', hebrew: 'תלונה', hebrewNikud: 'תְּלוּנָה', partOfSpeech: 'noun', level: 1, gender: 'נ',
    plural: null, root: null, everydaySynonym: null, translations: { en: 'complaint' }, notes: null,
    category: null, topic: null, reviewState: 'unreviewed', reviewPriority: 1, isDeprecated: false },
];

const pendingUpdate: EntryEdit = {
  id: 'ed1', entryId: 'a', changeType: 'update', status: 'pending', editorId: 'u2',
  editorNote: 'fix nikud', createdAt: '2026-08-01T00:00:00Z',
  payload: { id: 'a', hebrew: 'תלונה', hebrew_nikud: 'תְּלוּנָּה', part_of_speech: 'noun', level: 1,
    gender: 'נ', plural: null, root: null, everyday_synonym: null, translations: { en: 'complaint' },
    notes: null, category: null },
};

const {
  fetchAdminEntries, fetchPendingEdits, saveEditDraft, markReviewed, markUnreviewed,
  createEntryDraft, flagDelete, decideEdit, withdrawEdit, setTopic, getProfile,
} = vi.hoisted(() => ({
  fetchAdminEntries: vi.fn(),
  fetchPendingEdits: vi.fn(),
  saveEditDraft: vi.fn(),
  markReviewed: vi.fn(),
  markUnreviewed: vi.fn(),
  createEntryDraft: vi.fn(),
  flagDelete: vi.fn(),
  decideEdit: vi.fn(),
  withdrawEdit: vi.fn(),
  setTopic: vi.fn(),
  getProfile: vi.fn(),
}));
vi.mock('../data/reviewConsole', () => ({
  fetchAdminEntries, fetchPendingEdits,
  entryToPayload: (e: AdminEntry) => ({ id: e.id, hebrew: e.hebrew, hebrew_nikud: e.hebrewNikud,
    part_of_speech: e.partOfSpeech, level: e.level, gender: e.gender, plural: e.plural, root: e.root,
    everyday_synonym: e.everydaySynonym, translations: e.translations, notes: e.notes, category: e.category }),
  saveEditDraft, markReviewed, markUnreviewed, createEntryDraft, flagDelete, decideEdit, withdrawEdit, setTopic,
}));
vi.mock('../data/profile', () => ({ getProfile }));
vi.mock('../data/dictionary', () => ({
  filterEntries: (list: AdminEntry[], q: string) =>
    q.trim() === ''
      ? list
      : list.filter((e) => (e.hebrew + ' ' + e.translations.en).toLowerCase().includes(q.trim().toLowerCase())),
}));
// The page reads only the user id from the session context.
vi.mock('../components/SessionProvider', () => ({
  useSession: () => ({ session: { user: { id: 'u1' } }, loading: false }),
}));

import { AdminDictionaryPage } from './AdminDictionaryPage';

function renderPage() {
  return render(<MemoryRouter><AdminDictionaryPage /></MemoryRouter>);
}

describe('AdminDictionaryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAdminEntries.mockImplementation(async () => entries);
    fetchPendingEdits.mockImplementation(async () => [] as EntryEdit[]);
    getProfile.mockImplementation(async () => null);
    saveEditDraft.mockImplementation(async () => 'ed-new');
    createEntryDraft.mockImplementation(async () => 'ed-new');
    flagDelete.mockImplementation(async () => 'ed-new');
    markReviewed.mockImplementation(async () => {});
    markUnreviewed.mockImplementation(async () => {});
    decideEdit.mockImplementation(async () => {});
    withdrawEdit.mockImplementation(async () => {});
    setTopic.mockImplementation(async () => {});
  });

  it('shows the word list, progress counts, and state filter chips', async () => {
    renderPage();
    expect(await screen.findByText('תְּלוּנָה')).toBeTruthy();
    // plain hebrew still renders as the secondary line since it differs from the nikud form
    expect(screen.getByText('תלונה')).toBeTruthy();
    expect(screen.getByText(/0 \/ 1 reviewed/)).toBeTruthy();
    expect(screen.getByText(/0 \/ 1 tagged/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All (1)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unreviewed (1)' })).toBeTruthy();
  });

  it('search narrows the list', async () => {
    fetchAdminEntries.mockImplementation(async () => [
      ...entries,
      { ...entries[0], id: 'b', hebrew: 'חום', hebrewNikud: 'חוֹם', translations: { en: 'fever' } },
    ]);
    renderPage();
    await screen.findByText('תְּלוּנָה');
    await userEvent.type(screen.getByRole('searchbox'), 'fever');
    expect(screen.queryByText('תְּלוּנָה')).toBeNull();
    expect(screen.getByText('חוֹם')).toBeTruthy();
  });

  it('state filter chips narrow the list', async () => {
    renderPage();
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: 'Reviewed (0)' }));
    expect(screen.queryByText('תְּלוּנָה')).toBeNull();
    expect(screen.getByText(/no words match/i)).toBeTruthy();
  });

  it('marks a word reviewed', async () => {
    renderPage();
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: /mark reviewed/i }));
    expect(markReviewed).toHaveBeenCalledWith('a');
  });

  it('unmarks a reviewed word', async () => {
    fetchAdminEntries.mockImplementation(async () => [{ ...entries[0], reviewState: 'reviewed' as const }]);
    renderPage();
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: /unmark reviewed/i }));
    expect(markUnreviewed).toHaveBeenCalledWith('a');
  });

  it('save is disabled until a field changes, then saves a draft for a reviewer', async () => {
    renderPage();
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    const save = await screen.findByRole('button', { name: /save draft/i });
    expect(save).toBeDisabled();
    const hebrew = screen.getByLabelText('hebrew');
    await userEvent.clear(hebrew);
    await userEvent.type(hebrew, 'כאב');
    expect(save).not.toBeDisabled();
    await userEvent.click(save);
    expect(saveEditDraft).toHaveBeenCalledTimes(1);
    const [entryId, payload, note] = saveEditDraft.mock.calls[0] as [string, EntryPayload, string | null];
    expect(entryId).toBe('a');
    expect(payload.hebrew).toBe('כאב');
    expect(note).toBeNull();
    expect(decideEdit).not.toHaveBeenCalled();
    expect(await screen.findByRole('status')).toHaveTextContent(/draft saved/i);
  });

  it('an approver saves & applies in one step', async () => {
    getProfile.mockImplementation(async () => ({ canApprove: true }));
    renderPage();
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    const hebrew = await screen.findByLabelText('hebrew');
    await userEvent.type(hebrew, 'x');
    await userEvent.click(screen.getByRole('button', { name: /save & apply/i }));
    expect(saveEditDraft).toHaveBeenCalledTimes(1);
    expect(decideEdit).toHaveBeenCalledWith('ed-new', 'approved');
    expect(await screen.findByRole('status')).toHaveTextContent(/saved and applied/i);
  });

  it('add word: empty id or hebrew is blocked, typed id+hebrew calls createEntryDraft with that id', async () => {
    renderPage();
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: /add word/i }));

    const saveButton = await screen.findByRole('button', { name: /save draft/i });
    expect(saveButton).toBeDisabled();
    await userEvent.click(saveButton);
    expect(createEntryDraft).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/id/i), 'new-word');
    expect(saveButton).toBeDisabled();
    await userEvent.type(screen.getByLabelText('hebrew'), 'מילה');
    expect(saveButton).not.toBeDisabled();
    await userEvent.click(saveButton);

    expect(createEntryDraft).toHaveBeenCalledTimes(1);
    const [payload] = createEntryDraft.mock.calls[0] as [EntryPayload];
    expect(payload.id).toBe('new-word');
  });

  it('add word: trims leading/trailing whitespace from the typed id before saving', async () => {
    renderPage();
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: /add word/i }));

    await userEvent.type(screen.getByLabelText(/id/i), '  new-word  ');
    await userEvent.type(screen.getByLabelText('hebrew'), 'מילה');
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));

    expect(createEntryDraft).toHaveBeenCalledTimes(1);
    const [payload] = createEntryDraft.mock.calls[0] as [EntryPayload];
    expect(payload.id).toBe('new-word');
  });

  it('deleting asks for confirmation before flagging', async () => {
    renderPage();
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: /flag for deletion/i }));
    expect(flagDelete).not.toHaveBeenCalled();
    expect(screen.getByText(/delete “תלונה”\?/i)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /request deletion/i }));
    expect(flagDelete).toHaveBeenCalledWith('a', null);
    expect(decideEdit).not.toHaveBeenCalled();
  });

  it('an approver confirms deletion and it applies immediately', async () => {
    getProfile.mockImplementation(async () => ({ canApprove: true }));
    renderPage();
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: /flag for deletion/i }));
    await userEvent.click(screen.getByRole('button', { name: /delete now/i }));
    expect(flagDelete).toHaveBeenCalledWith('a', null);
    expect(decideEdit).toHaveBeenCalledWith('ed-new', 'approved');
  });

  it('a row with a pending edit shows the pending card instead of edit buttons', async () => {
    fetchPendingEdits.mockImplementation(async () => [pendingUpdate]);
    renderPage();
    await screen.findByText(/fix nikud/);
    expect(screen.getByText(/awaiting approval/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
  });

  it('the author can withdraw their own pending edit from the row', async () => {
    fetchPendingEdits.mockImplementation(async () => [{ ...pendingUpdate, editorId: 'u1' }]);
    renderPage();
    await screen.findByText(/fix nikud/);
    await userEvent.click(screen.getByRole('button', { name: /withdraw/i }));
    expect(withdrawEdit).toHaveBeenCalledWith('ed1');
  });

  it('an approver approves a pending edit inline on the row', async () => {
    getProfile.mockImplementation(async () => ({ canApprove: true }));
    fetchPendingEdits.mockImplementation(async () => [pendingUpdate]);
    renderPage();
    await screen.findByText(/fix nikud/);
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(decideEdit).toHaveBeenCalledWith('ed1', 'approved');
  });

  it('pending create edits render in their own section', async () => {
    fetchPendingEdits.mockImplementation(async () => [{
      ...pendingUpdate, id: 'ed3', entryId: null, changeType: 'create' as const,
      payload: { ...pendingUpdate.payload, id: 'new-word', hebrew: 'מילה' },
    }]);
    renderPage();
    await screen.findByText(/new words awaiting approval/i);
    expect(screen.getByText('New word · מילה')).toBeTruthy();
  });

  it('shows a friendly alert when saveEditDraft fails on a duplicate pending edit', async () => {
    saveEditDraft.mockRejectedValueOnce(
      Object.assign(
        new Error('duplicate key value violates unique constraint "entry_edits_one_open_per_entry"'),
        { code: '23505' },
      ),
    );
    renderPage();
    await screen.findByText('תְּלוּנָה');
    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    const hebrew = await screen.findByLabelText('hebrew');
    await userEvent.type(hebrew, 'x');
    await userEvent.click(screen.getByRole('button', { name: /save draft/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already has a pending edit/i);
  });

  it('sets a topic directly from the row select', async () => {
    renderPage();
    await screen.findByText('תְּלוּנָה');
    const select = screen.getByLabelText(/topic/i);
    await userEvent.selectOptions(select, 'cardiology');
    expect(setTopic).toHaveBeenCalledWith('a', 'cardiology');
  });

  it('shows a friendly alert when setTopic fails', async () => {
    setTopic.mockRejectedValueOnce(new Error('network error'));
    renderPage();
    await screen.findByText('תְּלוּנָה');
    const select = screen.getByLabelText(/topic/i);
    await userEvent.selectOptions(select, 'cardiology');
    expect(await screen.findByRole('alert')).toHaveTextContent(/action failed/i);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../lib/i18n';
import type { AdminEntry, EntryEdit, EntryPayload } from '../../lib/types';

const edits: EntryEdit[] = [{
  id: 'ed1', entryId: 'a', changeType: 'update', status: 'pending', editorNote: 'fix nikud',
  createdAt: '2026-07-18T00:00:00Z',
  payload: { id: 'a', hebrew: 'חום', hebrew_nikud: 'חֹם', part_of_speech: 'noun', level: 2,
    gender: 'ז', plural: null, root: null, everyday_synonym: null, translations: { en: 'fever' },
    notes: null, category: null },
}];
const { fetchPendingEdits, decideEdit } = vi.hoisted(() => ({
  fetchPendingEdits: vi.fn(async () => edits),
  decideEdit: vi.fn(async () => {}),
}));
vi.mock('../../data/reviewConsole', () => ({ fetchPendingEdits, decideEdit }));
import { ReviewQueue } from './ReviewQueue';

const entries: AdminEntry[] = [{
  id: 'a', hebrew: 'חום', hebrewNikud: 'חוֹם', partOfSpeech: 'noun', level: 2, gender: 'ז',
  plural: null, root: null, everydaySynonym: null, translations: { en: 'fever' }, notes: null,
  category: null, topic: null, reviewState: 'edit_pending', reviewPriority: 0, isDeprecated: false,
}];

describe('ReviewQueue', () => {
  beforeEach(() => vi.clearAllMocks());
  it('shows a pending edit and its note', async () => {
    render(<ReviewQueue entries={entries} onDecided={() => {}} />);
    expect(await screen.findByText(/fix nikud/)).toBeTruthy();
  });
  it('approves an edit', async () => {
    render(<ReviewQueue entries={entries} onDecided={() => {}} />);
    await screen.findByText(/fix nikud/);
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(decideEdit).toHaveBeenCalledWith('ed1', 'approved');
  });
  it('resolves the entry hebrew (not the raw id) for a delete edit with an empty payload', async () => {
    fetchPendingEdits.mockResolvedValueOnce([{
      id: 'ed2', entryId: 'a', changeType: 'delete', status: 'pending', editorNote: null,
      createdAt: '2026-07-18T00:00:00Z',
      payload: {} as unknown as EntryPayload,
    }]);
    render(<ReviewQueue entries={entries} onDecided={() => {}} />);
    expect(await screen.findByText('Delete · חום')).toBeTruthy();
  });
  it('shows an inline alert when decideEdit fails', async () => {
    decideEdit.mockRejectedValueOnce(new Error('network blip'));
    render(<ReviewQueue entries={entries} onDecided={() => {}} />);
    await screen.findByText(/fix nikud/);
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/network blip/i);
  });
});

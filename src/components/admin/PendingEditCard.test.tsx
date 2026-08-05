import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../lib/i18n';
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
import { PendingEditCard } from './PendingEditCard';
import type { AdminEntry, EntryEdit, EntryPayload } from '../../lib/types';

const entry: AdminEntry = {
  id: 'a', hebrew: 'חום', hebrewNikud: 'חוֹם', partOfSpeech: 'noun', level: 2, gender: 'ז',
  plural: null, root: null, everydaySynonym: null, translations: { en: 'fever' }, notes: null,
  category: null, topic: null, reviewState: 'edit_pending', reviewPriority: 0, isDeprecated: false,
};

const updateEdit: EntryEdit = {
  id: 'ed1', entryId: 'a', changeType: 'update', status: 'pending', editorId: 'u1',
  editorNote: 'fix nikud', createdAt: '2026-08-01T00:00:00Z',
  payload: { id: 'a', hebrew: 'חום', hebrew_nikud: 'חֹם', part_of_speech: 'noun', level: 2,
    gender: 'ז', plural: null, root: null, everyday_synonym: null, translations: { en: 'high fever' },
    notes: null, category: null },
};

const noop = () => {};

describe('PendingEditCard', () => {
  it('shows the note and a diff of changed fields only, including translations', () => {
    render(<PendingEditCard edit={updateEdit} entry={entry} canApprove currentUserId="owner"
      busy={false} onDecide={noop} onWithdraw={noop} />);
    expect(screen.getByText(/fix nikud/)).toBeTruthy();
    expect(screen.getByText('חֹם')).toBeTruthy();
    expect(screen.getByText('high fever')).toBeTruthy();
    expect(screen.getByText('fever')).toBeTruthy();
    expect(screen.queryByText('plural')).toBeNull();
    expect(screen.queryByText('gender')).toBeNull();
  });

  it('approve and reject call onDecide with the decision', async () => {
    const onDecide = vi.fn();
    render(<PendingEditCard edit={updateEdit} entry={entry} canApprove currentUserId="owner"
      busy={false} onDecide={onDecide} onWithdraw={noop} />);
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onDecide).toHaveBeenCalledWith('ed1', 'approved');
    await userEvent.click(screen.getByRole('button', { name: /reject/i }));
    expect(onDecide).toHaveBeenCalledWith('ed1', 'rejected');
  });

  it('shows only an awaiting-approval hint to a non-approver who is not the author', () => {
    render(<PendingEditCard edit={updateEdit} entry={entry} canApprove={false} currentUserId="someone-else"
      busy={false} onDecide={noop} onWithdraw={noop} />);
    expect(screen.getByText(/awaiting approval/i)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('lets the author withdraw their own pending edit', async () => {
    const onWithdraw = vi.fn();
    render(<PendingEditCard edit={updateEdit} entry={entry} canApprove={false} currentUserId="u1"
      busy={false} onDecide={noop} onWithdraw={onWithdraw} />);
    await userEvent.click(screen.getByRole('button', { name: /withdraw/i }));
    expect(onWithdraw).toHaveBeenCalledWith('ed1');
  });

  it('resolves the entry hebrew for a delete edit and explains the effect', () => {
    const del: EntryEdit = {
      id: 'ed2', entryId: 'a', changeType: 'delete', status: 'pending', editorId: 'u1',
      editorNote: null, createdAt: '2026-08-01T00:00:00Z',
      payload: {} as unknown as EntryPayload,
    };
    render(<PendingEditCard edit={del} entry={entry} canApprove currentUserId="owner"
      busy={false} onDecide={noop} onWithdraw={noop} />);
    expect(screen.getByText('Delete · חום')).toBeTruthy();
    expect(screen.getByText(/hide this word from learners/i)).toBeTruthy();
  });

  it('disables all actions while busy', () => {
    render(<PendingEditCard edit={updateEdit} entry={entry} canApprove currentUserId="u1"
      busy onDecide={noop} onWithdraw={noop} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b).toBeDisabled();
  });
});

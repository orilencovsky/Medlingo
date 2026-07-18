import { supabase } from '../lib/supabase';
import { mapEntryRow, type EntryRow } from './entryMapper';
import type { AdminEntry, EntryEdit, EntryPayload } from '../lib/types';

type AdminEntryRow = EntryRow & { review_state: AdminEntry['reviewState']; review_priority: number; is_deprecated: boolean };
type EditRow = {
  id: string; entry_id: string | null; change_type: EntryEdit['changeType'];
  payload: EntryPayload; editor_note: string | null; status: EntryEdit['status']; created_at: string;
};

function mapAdminEntry(r: AdminEntryRow): AdminEntry {
  return { ...mapEntryRow(r), reviewState: r.review_state, reviewPriority: r.review_priority, isDeprecated: r.is_deprecated };
}
function mapEdit(r: EditRow): EntryEdit {
  return {
    id: r.id, entryId: r.entry_id, changeType: r.change_type, payload: r.payload,
    editorNote: r.editor_note, status: r.status, createdAt: r.created_at,
  };
}

export function entryToPayload(e: AdminEntry): EntryPayload {
  return {
    id: e.id, hebrew: e.hebrew, hebrew_nikud: e.hebrewNikud, part_of_speech: e.partOfSpeech,
    level: e.level, gender: e.gender, plural: e.plural, root: e.root,
    everyday_synonym: e.everydaySynonym, translations: e.translations, notes: e.notes, category: e.category,
  };
}

async function currentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  return user.id;
}

export async function fetchAdminEntries(): Promise<AdminEntry[]> {
  const { data, error } = await supabase
    .from('dictionary_entries').select('*')
    .order('review_priority', { ascending: false }).order('hebrew', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as AdminEntryRow[]).map(mapAdminEntry);
}

export async function fetchPendingEdits(): Promise<EntryEdit[]> {
  const { data, error } = await supabase
    .from('entry_edits').select('*').eq('status', 'pending').order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as EditRow[]).map(mapEdit);
}

export async function saveEditDraft(entryId: string, payload: EntryPayload, note: string | null): Promise<void> {
  const editorId = await currentUserId();
  const { error } = await supabase.from('entry_edits')
    .insert({ entry_id: entryId, change_type: 'update', payload, editor_id: editorId, editor_note: note });
  if (error) throw error;
  const { error: e2 } = await supabase.from('dictionary_entries')
    .update({ review_state: 'edit_pending' }).eq('id', entryId);
  if (e2) throw e2;
}

export async function createEntryDraft(payload: EntryPayload, note: string | null): Promise<void> {
  const editorId = await currentUserId();
  const { error } = await supabase.from('entry_edits')
    .insert({ entry_id: null, change_type: 'create', payload, editor_id: editorId, editor_note: note });
  if (error) throw error;
}

export async function flagDelete(entryId: string, note: string | null): Promise<void> {
  const editorId = await currentUserId();
  const { error } = await supabase.from('entry_edits')
    .insert({ entry_id: entryId, change_type: 'delete', payload: {} as unknown as EntryPayload, editor_id: editorId, editor_note: note });
  if (error) throw error;
  const { error: e2 } = await supabase.from('dictionary_entries')
    .update({ review_state: 'edit_pending' }).eq('id', entryId);
  if (e2) throw e2;
}

export async function markReviewed(entryId: string): Promise<void> {
  const { error } = await supabase.from('dictionary_entries')
    .update({ review_state: 'reviewed' }).eq('id', entryId);
  if (error) throw error;
}

export async function decideEdit(editId: string, decision: 'approved' | 'rejected'): Promise<void> {
  const { error } = await supabase.rpc('apply_entry_edit', { edit_id: editId, decision });
  if (error) throw error;
}

export async function withdrawEdit(editId: string): Promise<void> {
  // Routed through the SECURITY DEFINER RPC (not a raw update) so the entry's
  // edit_pending flag is reverted and decided_by/payload cannot be forged.
  const { error } = await supabase.rpc('withdraw_entry_edit', { edit_id: editId });
  if (error) throw error;
}

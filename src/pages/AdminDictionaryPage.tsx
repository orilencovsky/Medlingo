import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { EntryEditForm } from '../components/admin/EntryEditForm';
import { ReviewQueue } from '../components/admin/ReviewQueue';
import {
  fetchAdminEntries, entryToPayload, saveEditDraft, createEntryDraft, flagDelete, markReviewed,
} from '../data/reviewConsole';
import { getProfile } from '../data/profile';
import type { AdminEntry, EntryPayload } from '../lib/types';

const EMPTY: EntryPayload = {
  id: '', hebrew: '', hebrew_nikud: '', part_of_speech: 'noun', level: 1, gender: null, plural: null,
  root: null, everyday_synonym: null, translations: { en: '' }, notes: null, category: null,
};

export function AdminDictionaryPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AdminEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const describeError = (err: unknown): string => {
    const e = err as { message?: string; code?: string } | null | undefined;
    const message = e?.message ?? String(err);
    const isDuplicate = e?.code === '23505'
      || message.includes('entry_edits_one_open_per_entry')
      || message.includes('duplicate key');
    return isDuplicate ? t('admin.alreadyPending') : t('admin.actionFailed', { message });
  };

  const reload = () => fetchAdminEntries().then(setEntries);
  useEffect(() => {
    reload();
    getProfile().then((p) => setCanApprove(!!p?.canApprove));
  }, []);

  const reviewedCount = useMemo(
    () => entries.filter((e) => e.reviewState === 'reviewed').length, [entries]);

  const onSave = async (entryId: string, payload: EntryPayload, note: string | null) => {
    setError(null);
    try {
      await saveEditDraft(entryId, payload, note);
      setEditingId(null); await reload();
    } catch (err) {
      setError(describeError(err));
    }
  };
  const onCreate = async (payload: EntryPayload, note: string | null) => {
    setError(null);
    if (!payload.id?.trim()) return;
    try {
      await createEntryDraft(payload, note); setAdding(false); await reload();
    } catch (err) {
      setError(describeError(err));
    }
  };
  const onReview = async (id: string) => {
    setError(null);
    try {
      await markReviewed(id); await reload();
    } catch (err) {
      setError(describeError(err));
    }
  };
  const onDelete = async (id: string) => {
    setError(null);
    try {
      await flagDelete(id, null); await reload();
    } catch (err) {
      setError(describeError(err));
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={t('admin.dictionary')} />
      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          {t('admin.progress', { reviewed: reviewedCount, total: entries.length })}
        </p>
        <button className="rounded-md border border-border px-3 py-1 text-sm"
          onClick={() => setAdding(true)}>{t('admin.addWord')}</button>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button type="button" className="ms-2 font-semibold underline" onClick={() => setError(null)}>
            {t('admin.dismiss')}
          </button>
        </p>
      )}
      {adding && <div className="mt-3"><EntryEditForm initial={EMPTY} onSave={onCreate} onCancel={() => setAdding(false)} isCreate /></div>}
      {canApprove && <div className="mt-4"><ReviewQueue entries={entries} onDecided={reload} /></div>}
      <ul className="mt-4 divide-y divide-border">
        {entries.map((e) => (
          <li key={e.id} className="py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-lg font-bold text-ink">{e.hebrewNikud}</span>
                {e.hebrew && e.hebrew !== e.hebrewNikud && (
                  <span className="ms-2 text-sm text-ink-subtle">{e.hebrew}</span>
                )}
                <span className="ms-2 text-sm text-ink-muted">{e.translations.en}</span>
              </div>
              <span className="text-xs text-ink-muted">
                {e.reviewState === 'reviewed' ? t('admin.stateReviewed')
                  : e.reviewState === 'edit_pending' ? t('admin.statePending') : t('admin.stateUnreviewed')}
              </span>
            </div>
            {editingId === e.id ? (
              <div className="mt-2">
                <EntryEditForm initial={entryToPayload(e)}
                  onSave={(payload, note) => onSave(e.id, payload, note)}
                  onCancel={() => setEditingId(null)} isCreate={false} />
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <button className="text-sm text-primary" onClick={() => setEditingId(e.id)}>{t('admin.edit')}</button>
                <button className="text-sm text-ink-muted" onClick={() => onReview(e.id)}>{t('admin.markReviewed')}</button>
                <button className="text-sm text-red-600" onClick={() => onDelete(e.id)}>{t('admin.flagDelete')}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

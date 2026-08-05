import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { EntryEditForm } from '../components/admin/EntryEditForm';
import { PendingEditCard } from '../components/admin/PendingEditCard';
import { useSession } from '../components/SessionProvider';
import {
  fetchAdminEntries, fetchPendingEdits, entryToPayload, saveEditDraft, createEntryDraft,
  flagDelete, markReviewed, markUnreviewed, decideEdit, withdrawEdit, setTopic,
} from '../data/reviewConsole';
import { filterEntries } from '../data/dictionary';
import { getProfile } from '../data/profile';
import { TOPICS } from '../lib/topics';
import type { AdminEntry, EntryEdit, EntryPayload, ReviewState } from '../lib/types';

const EMPTY: EntryPayload = {
  id: '', hebrew: '', hebrew_nikud: '', part_of_speech: 'noun', level: 1, gender: null, plural: null,
  root: null, everyday_synonym: null, translations: { en: '' }, notes: null, category: null,
};

type StateFilter = 'all' | ReviewState;
const FILTERS: StateFilter[] = ['all', 'unreviewed', 'edit_pending', 'reviewed'];

const DANGER_BUTTON_CLASSES =
  'inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold '
  + 'text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:pointer-events-none';

export function AdminDictionaryPage() {
  const { t } = useTranslation();
  const { session } = useSession();
  const uid = session?.user?.id ?? null;
  const [entries, setEntries] = useState<AdminEntry[]>([]);
  const [edits, setEdits] = useState<EntryEdit[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [canApprove, setCanApprove] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');

  const describeError = (err: unknown): string => {
    const e = err as { message?: string; code?: string } | null | undefined;
    const message = e?.message ?? String(err);
    const isDuplicate = e?.code === '23505'
      || message.includes('entry_edits_one_open_per_entry')
      || message.includes('duplicate key');
    return isDuplicate ? t('admin.alreadyPending') : t('admin.actionFailed', { message });
  };

  const reload = () => Promise.all([
    fetchAdminEntries().then(setEntries),
    fetchPendingEdits().then(setEdits),
  ]);
  useEffect(() => {
    reload().finally(() => setLoading(false));
    getProfile().then((p) => setCanApprove(!!p?.canApprove));
  }, []);

  const showFlash = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash((f) => (f === msg ? null : f)), 4000);
  };

  // One action at a time; busyKey (entry or edit id) disables that row's buttons.
  const run = async (busyKey: string, fn: () => Promise<void>, successMsg?: string) => {
    setError(null);
    setBusyId(busyKey);
    try {
      await fn();
      await reload();
      if (successMsg) showFlash(successMsg);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusyId(null);
    }
  };

  const editByEntryId = useMemo(() => {
    const m = new Map<string, EntryEdit>();
    for (const ed of edits) if (ed.entryId) m.set(ed.entryId, ed);
    return m;
  }, [edits]);
  const createEdits = useMemo(() => edits.filter((ed) => ed.changeType === 'create'), [edits]);

  const counts = useMemo(() => ({
    all: entries.length,
    unreviewed: entries.filter((e) => e.reviewState === 'unreviewed').length,
    edit_pending: entries.filter((e) => e.reviewState === 'edit_pending').length,
    reviewed: entries.filter((e) => e.reviewState === 'reviewed').length,
  }), [entries]);

  const shown = useMemo(() => {
    const byQuery = filterEntries(entries, query);
    return stateFilter === 'all' ? byQuery : byQuery.filter((e) => e.reviewState === stateFilter);
  }, [entries, query, stateFilter]);

  const onSave = (entryId: string, payload: EntryPayload, note: string | null) =>
    run(entryId, async () => {
      const editId = await saveEditDraft(entryId, payload, note);
      if (canApprove) await decideEdit(editId, 'approved');
      setEditingId(null);
    }, canApprove ? t('admin.flashApplied') : t('admin.flashDraftSaved'));

  const onCreate = (payload: EntryPayload, note: string | null) => {
    if (!payload.id?.trim()) return;
    return run('new-word', async () => {
      const editId = await createEntryDraft(payload, note);
      if (canApprove) await decideEdit(editId, 'approved');
      setAdding(false);
    }, canApprove ? t('admin.flashApplied') : t('admin.flashDraftSaved'));
  };

  const onDelete = (id: string) => {
    setConfirmDeleteId(null);
    return run(id, async () => {
      const editId = await flagDelete(id, null);
      if (canApprove) await decideEdit(editId, 'approved');
    }, canApprove ? t('admin.flashDeleted') : t('admin.flashDeleteFlagged'));
  };

  const onToggleReviewed = (e: AdminEntry) =>
    run(e.id, () => (e.reviewState === 'reviewed' ? markUnreviewed(e.id) : markReviewed(e.id)));

  const onDecide = (editId: string, decision: 'approved' | 'rejected') =>
    run(editId, () => decideEdit(editId, decision),
      decision === 'approved' ? t('admin.flashApproved') : t('admin.flashRejected'));

  const onWithdraw = (editId: string) =>
    run(editId, () => withdrawEdit(editId), t('admin.flashWithdrawn'));

  const onSetTopic = (entryId: string, value: string) =>
    run(entryId, () => setTopic(entryId, value === '' ? null : (value as typeof TOPICS[number])));

  const filterLabel = (f: StateFilter) =>
    f === 'all' ? t('admin.filterAll')
      : f === 'unreviewed' ? t('admin.stateUnreviewed')
        : f === 'edit_pending' ? t('admin.statePending') : t('admin.stateReviewed');

  const stateChip = (e: AdminEntry) => {
    if (e.isDeprecated) {
      return <span className="whitespace-nowrap rounded-full bg-border px-2 py-0.5 text-xs font-semibold text-ink-muted">{t('admin.stateDeprecated')}</span>;
    }
    const cls = e.reviewState === 'reviewed' ? 'bg-green-100 text-green-800'
      : e.reviewState === 'edit_pending' ? 'bg-amber-100 text-amber-800'
        : 'border border-border text-ink-muted';
    return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{filterLabel(e.reviewState)}</span>;
  };

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={t('admin.dictionary')} />
      <div className="mt-3 flex flex-col gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('admin.searchPlaceholder')}
          aria-label={t('admin.searchPlaceholder')}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('admin.filterLabel')}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={stateFilter === f}
              onClick={() => setStateFilter(f)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                stateFilter === f ? 'bg-primary text-white' : 'border border-border text-ink-muted'}`}
            >
              {filterLabel(f)} ({counts[f]})
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm text-ink-muted">
              {t('admin.progress', { reviewed: counts.reviewed, total: entries.length })}
            </p>
            <p className="text-sm text-ink-muted">
              {t('admin.topicCoverage', {
                tagged: entries.filter((e) => e.topic).length,
                total: entries.length,
              })}
            </p>
          </div>
          <Button size="sm" variant="secondary" icon={<Plus className="size-3.5" />}
            onClick={() => { setAdding(true); setEditingId(null); setConfirmDeleteId(null); }}>
            {t('admin.addWord')}
          </Button>
        </div>
      </div>
      {flash && (
        <p role="status" className="mt-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {flash}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button type="button" className="ms-2 font-semibold underline" onClick={() => setError(null)}>
            {t('admin.dismiss')}
          </button>
        </p>
      )}
      {adding && (
        <div className="mt-3">
          <EntryEditForm initial={EMPTY} onSave={onCreate} onCancel={() => setAdding(false)}
            isCreate applyNow={canApprove} busy={busyId === 'new-word'} />
        </div>
      )}
      {createEdits.length > 0 && (
        <section className="mt-4 space-y-2">
          <h2 className="text-sm font-bold text-ink">{t('admin.newWordsPending')}</h2>
          {createEdits.map((ed) => (
            <PendingEditCard key={ed.id} edit={ed} canApprove={canApprove} currentUserId={uid}
              busy={busyId === ed.id} onDecide={onDecide} onWithdraw={onWithdraw} />
          ))}
        </section>
      )}
      {loading ? (
        <p className="mt-6 text-ink-muted">{t('common.loading')}</p>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-ink-muted">{t('admin.noMatches')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {shown.map((e) => {
            const pending = editByEntryId.get(e.id);
            const busy = busyId === e.id || (pending !== undefined && busyId === pending.id);
            return (
              <li key={e.id} className={`py-3 ${e.isDeprecated ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-lg font-bold text-ink">{e.hebrewNikud}</span>
                    {e.hebrew && e.hebrew !== e.hebrewNikud && (
                      <span className="ms-2 text-sm text-ink-subtle">{e.hebrew}</span>
                    )}
                    <span className="ms-2 text-sm text-ink-muted">{e.translations.en}</span>
                  </div>
                  {stateChip(e)}
                </div>
                {pending ? (
                  <div className="mt-2">
                    <PendingEditCard edit={pending} entry={e} canApprove={canApprove} currentUserId={uid}
                      busy={busy} onDecide={onDecide} onWithdraw={onWithdraw} />
                  </div>
                ) : editingId === e.id ? (
                  <div className="mt-2">
                    <EntryEditForm initial={entryToPayload(e)}
                      onSave={(payload, note) => onSave(e.id, payload, note)}
                      onCancel={() => setEditingId(null)} isCreate={false}
                      applyNow={canApprove} busy={busy} />
                  </div>
                ) : confirmDeleteId === e.id ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-red-50 p-2">
                    <span className="text-sm text-red-700">{t('admin.confirmDeleteQuestion', { word: e.hebrew })}</span>
                    <button type="button" disabled={busy} onClick={() => onDelete(e.id)}
                      className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:pointer-events-none">
                      {canApprove ? t('admin.confirmDeleteNow') : t('admin.confirmDeleteFlag')}
                    </button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                      {t('admin.cancel')}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {!e.isDeprecated && (
                      <>
                        <Button size="sm" variant="secondary" icon={<Pencil className="size-3.5" />} disabled={busy}
                          onClick={() => { setEditingId(e.id); setAdding(false); setConfirmDeleteId(null); }}>
                          {t('admin.edit')}
                        </Button>
                        {e.reviewState === 'reviewed' ? (
                          <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} disabled={busy}
                            onClick={() => onToggleReviewed(e)}>
                            {t('admin.unmarkReviewed')}
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" icon={<Check className="size-3.5" />} disabled={busy}
                            onClick={() => onToggleReviewed(e)}>
                            {t('admin.markReviewed')}
                          </Button>
                        )}
                        <button type="button" className={DANGER_BUTTON_CLASSES} disabled={busy}
                          onClick={() => { setConfirmDeleteId(e.id); setEditingId(null); }}>
                          <Trash2 className="size-3.5" />
                          {t('admin.flagDelete')}
                        </button>
                      </>
                    )}
                    <label className="text-xs text-ink-muted">
                      <span className="sr-only">{t('admin.topicLabel')}</span>
                      <select
                        aria-label={t('admin.topicLabel')}
                        className="ms-2 rounded border border-border px-1 py-0.5 text-xs"
                        value={e.topic ?? ''}
                        disabled={busy}
                        onChange={(ev) => onSetTopic(e.id, ev.target.value)}
                      >
                        <option value="">{t('admin.untagged')}</option>
                        {TOPICS.map((slug) => <option key={slug} value={slug}>{t(`topics.${slug}`)}</option>)}
                      </select>
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

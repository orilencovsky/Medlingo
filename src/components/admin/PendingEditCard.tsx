import { useTranslation } from 'react-i18next';
import { Check, Undo2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { entryToPayload } from '../../data/reviewConsole';
import type { AdminEntry, EntryEdit, EntryPayload } from '../../lib/types';

interface Props {
  edit: EntryEdit;
  entry?: AdminEntry;
  canApprove: boolean;
  currentUserId: string | null;
  busy: boolean;
  onDecide: (editId: string, decision: 'approved' | 'rejected') => void;
  onWithdraw: (editId: string) => void;
}

// Labels intentionally match the TSV column vocabulary used in the edit form.
const SCALAR_FIELDS: Array<[string, keyof EntryPayload]> = [
  ['hebrew', 'hebrew'], ['nikud', 'hebrew_nikud'], ['pos', 'part_of_speech'],
  ['level', 'level'], ['gender', 'gender'], ['plural', 'plural'], ['root', 'root'],
  ['synonym', 'everyday_synonym'], ['notes', 'notes'], ['category', 'category'],
];
const LANGS = ['en', 'ar', 'ru', 'fr'] as const;

type DiffRow = { label: string; before: string; after: string };

function show(v: unknown): string {
  const s = v == null ? '' : String(v);
  return s === '' ? '—' : s;
}

function diffRows(edit: EntryEdit, entry: AdminEntry | undefined): DiffRow[] {
  const current = entry ? entryToPayload(entry) : null;
  const rows: DiffRow[] = [];
  for (const [label, key] of SCALAR_FIELDS) {
    const after = show(edit.payload[key]);
    const before = show(current?.[key]);
    if (after !== before) rows.push({ label, before, after });
  }
  for (const lang of LANGS) {
    const after = show(edit.payload.translations?.[lang]);
    const before = show(current?.translations?.[lang]);
    if (after !== before) rows.push({ label: lang, before, after });
  }
  return rows;
}

export function PendingEditCard({ edit, entry, canApprove, currentUserId, busy, onDecide, onWithdraw }: Props) {
  const { t } = useTranslation();
  const isMine = currentUserId !== null && edit.editorId === currentUserId;
  const word = edit.payload.hebrew || entry?.hebrew || edit.entryId || '';
  const label = edit.changeType === 'create' ? t('admin.changeCreate')
    : edit.changeType === 'delete' ? t('admin.changeDelete') : t('admin.changeUpdate');
  const rows = edit.changeType === 'delete' ? [] : diffRows(edit, entry);

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-amber-900">{label} · {word}</span>
        {!canApprove && (
          <span className="text-xs text-amber-800">{t('admin.awaitingApproval')}</span>
        )}
      </div>
      {edit.editorNote && <p className="mt-1 text-ink-muted">“{edit.editorNote}”</p>}
      {edit.changeType === 'delete' ? (
        <p className="mt-1 text-red-700">{t('admin.deleteEffect')}</p>
      ) : rows.length > 0 ? (
        <table className="mt-2 text-xs">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="pe-3 align-top text-ink-muted">{r.label}</td>
                <td className="pe-3 align-top text-ink-subtle line-through">{r.before}</td>
                <td className="align-top font-semibold">{r.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-1 text-xs text-ink-muted">{t('admin.noChanges')}</p>
      )}
      {(canApprove || isMine) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {canApprove && (
            <>
              <Button size="sm" icon={<Check className="size-3.5" />} disabled={busy}
                onClick={() => onDecide(edit.id, 'approved')}>{t('admin.approve')}</Button>
              <Button size="sm" variant="secondary" icon={<X className="size-3.5" />} disabled={busy}
                onClick={() => onDecide(edit.id, 'rejected')}>{t('admin.reject')}</Button>
            </>
          )}
          {isMine && (
            <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} disabled={busy}
              onClick={() => onWithdraw(edit.id)}>{t('admin.withdraw')}</Button>
          )}
        </div>
      )}
    </div>
  );
}

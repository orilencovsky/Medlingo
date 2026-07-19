import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPendingEdits, decideEdit } from '../../data/reviewConsole';
import type { AdminEntry, EntryEdit } from '../../lib/types';

interface Props { entries: AdminEntry[]; onDecided: () => void; }

const DIFF_FIELDS: Array<[string, keyof EntryEdit['payload']]> = [
  ['hebrew', 'hebrew'], ['nikud', 'hebrew_nikud'], ['pos', 'part_of_speech'],
  ['level', 'level'], ['gender', 'gender'], ['plural', 'plural'], ['root', 'root'],
  ['synonym', 'everyday_synonym'], ['notes', 'notes'],
];

export function ReviewQueue({ entries, onDecided }: Props) {
  const { t } = useTranslation();
  const [edits, setEdits] = useState<EntryEdit[]>([]);
  const byId = new Map(entries.map((e) => [e.id, e]));

  const reload = () => fetchPendingEdits().then(setEdits);
  useEffect(() => { reload(); }, []);

  const decide = async (id: string, d: 'approved' | 'rejected') => {
    await decideEdit(id, d); await reload(); onDecided();
  };
  const currentValue = (edit: EntryEdit, key: string): string => {
    const e = edit.entryId ? byId.get(edit.entryId) : undefined;
    if (!e) return '—';
    const map: Record<string, unknown> = {
      hebrew: e.hebrew, hebrew_nikud: e.hebrewNikud, part_of_speech: e.partOfSpeech, level: e.level,
      gender: e.gender, plural: e.plural, root: e.root, everyday_synonym: e.everydaySynonym, notes: e.notes,
    };
    return String(map[key] ?? '—');
  };

  const label = (c: EntryEdit['changeType']) =>
    c === 'create' ? t('admin.changeCreate') : c === 'delete' ? t('admin.changeDelete') : t('admin.changeUpdate');

  return (
    <div className="rounded-md border border-border p-3">
      <h2 className="text-sm font-bold text-ink">{t('admin.queue')}</h2>
      {edits.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">{t('admin.noPending')}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {edits.map((edit) => (
            <li key={edit.id} className="rounded-md bg-primary-tint p-2 text-sm">
              <div className="font-semibold">{label(edit.changeType)} · {edit.payload.hebrew || byId.get(edit.entryId ?? '')?.hebrew || edit.entryId}</div>
              {edit.editorNote && <div className="text-ink-muted">“{edit.editorNote}”</div>}
              {edit.changeType === 'update' && (
                <table className="mt-1 text-xs">
                  <tbody>
                    {DIFF_FIELDS.map(([lbl, key]) => {
                      const proposed = String(edit.payload[key] ?? '—');
                      const before = currentValue(edit, key as string);
                      if (proposed === before) return null;
                      return (
                        <tr key={key as string}>
                          <td className="pe-2 text-ink-muted">{lbl}</td>
                          <td className="pe-2 line-through">{before}</td>
                          <td className="font-semibold">{proposed}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div className="mt-2 flex gap-2">
                <button className="rounded-md bg-primary px-2 py-1 text-white"
                  onClick={() => decide(edit.id, 'approved')}>{t('admin.approve')}</button>
                <button className="rounded-md border border-border px-2 py-1"
                  onClick={() => decide(edit.id, 'rejected')}>{t('admin.reject')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

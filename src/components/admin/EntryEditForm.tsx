import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import type { EntryPayload, PartOfSpeech } from '../../lib/types';

const POS: PartOfSpeech[] = ['noun', 'verb', 'adjective', 'phrase', 'abbreviation', 'adverb',
  'pronoun', 'preposition', 'conjunction', 'numeral', 'particle', 'interjection'];

interface Props {
  initial: EntryPayload;
  onSave: (payload: EntryPayload, note: string | null) => void;
  onCancel: () => void;
  isCreate?: boolean;
  // Approvers apply the edit immediately (save & apply); reviewers save a draft
  // that waits for approval. The button label tells the user which will happen.
  applyNow?: boolean;
  busy?: boolean;
}

export function EntryEditForm({ initial, onSave, onCancel, isCreate, applyNow, busy }: Props) {
  const { t } = useTranslation();
  const [p, setP] = useState<EntryPayload>(initial);
  const [note, setNote] = useState('');
  const set = (k: keyof EntryPayload, v: unknown) => setP({ ...p, [k]: v });
  const field = (label: string, key: keyof EntryPayload) => (
    <label className="block text-sm">
      <span className="text-ink-muted">{label}</span>
      <input className="mt-1 w-full rounded-md border border-border px-2 py-1"
        value={(p[key] as string) ?? ''} onChange={(e) => set(key, e.target.value || null)} />
    </label>
  );
  const unchanged = !isCreate && JSON.stringify(p) === JSON.stringify(initial);
  const saveBlocked = Boolean(busy) || unchanged
    || (Boolean(isCreate) && (!p.id?.trim() || !(p.hebrew ?? '').trim()));
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      {isCreate && (
        <label className="block text-sm">
          <span className="text-ink-muted">id (slug)</span>
          <input className="mt-1 w-full rounded-md border border-border px-2 py-1"
            value={p.id ?? ''} onChange={(e) => setP({ ...p, id: e.target.value || undefined })} />
        </label>
      )}
      {field('hebrew', 'hebrew')}
      {field('nikud', 'hebrew_nikud')}
      <label className="block text-sm">
        <span className="text-ink-muted">part of speech</span>
        <select className="mt-1 w-full rounded-md border border-border px-2 py-1"
          value={p.part_of_speech} onChange={(e) => set('part_of_speech', e.target.value)}>
          {POS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-ink-muted">level</span>
        <select className="mt-1 w-full rounded-md border border-border px-2 py-1"
          value={p.level} onChange={(e) => set('level', Number(e.target.value))}>
          {[1, 2, 3].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-ink-muted">gender</span>
        <select className="mt-1 w-full rounded-md border border-border px-2 py-1"
          value={p.gender ?? ''} onChange={(e) => set('gender', e.target.value || null)}>
          <option value="">—</option>
          <option value="ז">ז</option>
          <option value="נ">נ</option>
        </select>
      </label>
      {field('plural', 'plural')}
      {field('root', 'root')}
      {field('everyday synonym', 'everyday_synonym')}
      <label className="block text-sm">
        <span className="text-ink-muted">en</span>
        <input className="mt-1 w-full rounded-md border border-border px-2 py-1"
          value={p.translations.en}
          onChange={(e) => set('translations', { ...p.translations, en: e.target.value })} />
      </label>
      {field('notes', 'notes')}
      {!applyNow && (
        <label className="block text-sm">
          <span className="text-ink-muted">{t('admin.note')}</span>
          <input className="mt-1 w-full rounded-md border border-border px-2 py-1"
            value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={saveBlocked}
          onClick={() => onSave(isCreate ? { ...p, id: p.id?.trim() || undefined } : p, note || null)}>
          {applyNow ? t('admin.saveApply') : t('admin.saveDraft')}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>{t('admin.cancel')}</Button>
        {unchanged && <span className="text-xs text-ink-muted">{t('admin.noChangesYet')}</span>}
      </div>
    </div>
  );
}

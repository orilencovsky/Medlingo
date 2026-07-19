import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntryPayload, PartOfSpeech } from '../../lib/types';

const POS: PartOfSpeech[] = ['noun', 'verb', 'adjective', 'phrase', 'abbreviation', 'adverb',
  'pronoun', 'preposition', 'conjunction', 'numeral', 'particle', 'interjection'];

interface Props {
  initial: EntryPayload;
  onSave: (payload: EntryPayload, note: string | null) => void;
  onCancel: () => void;
  isCreate?: boolean;
}

export function EntryEditForm({ initial, onSave, onCancel, isCreate }: Props) {
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
  const saveBlocked = Boolean(isCreate) && !p.id?.trim();
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
      {field('gender (ז/נ)', 'gender')}
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
      <label className="block text-sm">
        <span className="text-ink-muted">{t('admin.note')}</span>
        <input className="mt-1 w-full rounded-md border border-border px-2 py-1"
          value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button className="rounded-md bg-primary px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
          disabled={saveBlocked}
          onClick={() => onSave(isCreate ? { ...p, id: p.id?.trim() || undefined } : p, note || null)}>
          {t('admin.saveDraft')}
        </button>
        <button className="rounded-md border border-border px-3 py-1 text-sm"
          onClick={onCancel}>{t('admin.cancel')}</button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAnatomyWord, type AnatomyWord } from '../../data/anatomy';
import { He } from '../He';

// Modal (desktop) / bottom-sheet (mobile) detail for one anatomy word. Given an
// entryId it fetches the word + its primary image; the image slot is omitted when
// the word has no primary image (text still shows).
export function WordDetailCard({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [word, setWord] = useState<AnatomyWord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setWord(null);
    setLoading(true);
    fetchAnatomyWord(entryId)
      .then((w) => { if (live) { setWord(w); setLoading(false); } })
      .catch(() => { if (live) { setWord(null); setLoading(false); } });
    return () => { live = false; };
  }, [entryId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-surface p-4 shadow-raised sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            {word && <He className="block text-2xl font-bold text-ink">{word.entry.hebrewNikud}</He>}
            {word && <div className="text-sm text-ink-muted">{word.entry.translations.en}</div>}
          </div>
          <button type="button" onClick={onClose}
            className="rounded-md border border-border px-2 py-1 text-sm text-ink-muted">
            {t('anatomy.close')}
          </button>
        </div>
        {loading ? <p className="mt-4 text-ink-muted">{t('common.loading')}</p>
          : !word ? <p className="mt-4 text-ink-muted">{t('anatomy.wordMissing')}</p>
          : (
          <div className="mt-3">
            {word.imageUrl && (
              <figure>
                <img src={word.imageUrl} alt={word.entry.translations.en}
                  className="max-h-64 w-full rounded-md object-contain" />
                {word.imageCredit && <figcaption className="mt-1 text-[10px] text-ink-subtle">{word.imageCredit}</figcaption>}
              </figure>
            )}
            <dl className="mt-3 space-y-1 text-sm">
              {word.entry.everydaySynonym && (
                <div className="flex gap-2"><dt className="text-ink-muted">{t('unit.everyday')}:</dt>
                  <dd className="text-ink">{word.entry.everydaySynonym}</dd></div>
              )}
              {word.entry.gender && (
                <div className="flex gap-2"><dt className="text-ink-muted">{t('unit.gender')}:</dt>
                  <dd className="text-ink">{word.entry.gender}</dd></div>
              )}
              {word.entry.notes && (
                <div className="flex gap-2"><dt className="text-ink-muted">{t('unit.meaning')}:</dt>
                  <dd className="text-ink">{word.entry.notes}</dd></div>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

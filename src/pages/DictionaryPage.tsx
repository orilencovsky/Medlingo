import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchDictionary, filterEntries } from '../data/dictionary';
import { PageHeader } from '../components/ui/PageHeader';
import { He } from '../components/He';
import type { DictionaryEntry } from '../lib/types';

export function DictionaryPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDictionary().then((e) => { setEntries(e); setLoading(false); });
  }, []);

  const shown = useMemo(() => filterEntries(entries, query), [entries, query]);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={t('dictionary.title')} />
      <input
        type="search"
        role="searchbox"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('dictionary.searchPlaceholder')}
        className="mt-4 w-full rounded-md border border-border px-3 py-2 text-sm"
      />
      <p className="mt-2 text-xs text-ink-muted">{t('dictionary.count', { count: shown.length })}</p>
      {loading ? (
        <p className="mt-6 text-ink-muted">{t('common.loading')}</p>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-ink-muted">{t('dictionary.empty')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {shown.map((e) => (
            <li key={e.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <He className="text-lg font-bold text-ink">{e.hebrewNikud}</He>
                <span className="text-xs text-ink-muted">{e.partOfSpeech} · L{e.level}</span>
              </div>
              {e.hebrew && e.hebrew !== e.hebrewNikud && (
                <He className="block text-sm text-ink-subtle">{e.hebrew}</He>
              )}
              <div className="text-sm text-ink-muted">{e.translations.en}</div>
              {e.everydaySynonym && (
                <div className="text-xs text-ink-muted">≈ {e.everydaySynonym}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

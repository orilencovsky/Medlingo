import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { fetchDictionary } from '../data/dictionary';
import { PageHeader } from '../components/ui/PageHeader';
import { TOPICS, type Topic } from '../lib/topics';
import { topicIcon } from '../lib/topicIcons';
import type { DictionaryEntry } from '../lib/types';

export function DictionaryPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDictionary().then((e) => { setEntries(e); setLoading(false); });
  }, []);

  const counts = useMemo(() => {
    const c = {} as Record<Topic, number>;
    for (const e of entries) if (e.topic) c[e.topic] = (c[e.topic] ?? 0) + 1;
    return c;
  }, [entries]);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={t('dictionary.title')} />
      {loading ? <p className="mt-6 text-ink-muted">{t('common.loading')}</p> : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TOPICS.filter((slug) => (counts[slug] ?? 0) > 0).map((slug) => {
            const Icon = topicIcon(slug);
            return (
              <Link key={slug} to={`/dictionary/${slug}`}
                className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 text-center hover:bg-primary-tint">
                <Icon className="size-6 text-primary" />
                <span className="text-sm font-semibold text-ink">{t(`topics.${slug}`)}</span>
                <span className="text-xs text-ink-muted">{t('dictionary.count', { count: counts[slug] ?? 0 })}</span>
              </Link>
            );
          })}
          <Link to="/dictionary/all"
            className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 text-center hover:bg-primary-tint">
            <span className="text-sm font-semibold text-ink">{t('dictionary.allWords')}</span>
            <span className="text-xs text-ink-muted">{t('dictionary.count', { count: entries.length })}</span>
          </Link>
        </div>
      )}
    </div>
  );
}

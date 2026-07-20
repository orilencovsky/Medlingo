import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { fetchDictionary, filterEntries } from '../data/dictionary';
import { PageHeader } from '../components/ui/PageHeader';
import { He } from '../components/He';
import { isTopic } from '../lib/topics';
import type { DictionaryEntry } from '../lib/types';

interface TopicGroup { slug: string; label: string; items: DictionaryEntry[]; }
const MISC = '__misc__';

function EntryRow({ entry: e }: { entry: DictionaryEntry }) {
  return (
    <li className="py-3">
      <div className="flex items-baseline justify-between gap-3">
        <He className="text-lg font-bold text-ink">{e.hebrewNikud}</He>
        <span className="text-xs text-ink-muted">{e.partOfSpeech} · L{e.level}</span>
      </div>
      {e.hebrew && e.hebrew !== e.hebrewNikud && <He className="block text-sm text-ink-subtle">{e.hebrew}</He>}
      <div className="text-sm text-ink-muted">{e.translations.en}</div>
      {e.everydaySynonym && <div className="text-xs text-ink-muted">≈ {e.everydaySynonym}</div>}
    </li>
  );
}

export function TopicPage() {
  const { t, i18n } = useTranslation();
  const { topic } = useParams();
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const validTopic = topic === 'all' || (!!topic && isTopic(topic));

  useEffect(() => {
    if (!validTopic) return;
    setLoading(true);
    fetchDictionary().then((all) => {
      const scoped = topic === 'all' ? all : all.filter((e) => e.topic === topic);
      setEntries(scoped); setLoading(false);
    });
  }, [topic, validTopic]);

  const shown = useMemo(() => filterEntries(entries, query), [entries, query]);

  // "all" groups the list under a header per topic, alphabetical by localized label,
  // with untagged words pinned in a Miscellaneous section at the end (never sorted
  // among the rest — it's a catch-all, not a subject).
  const groups = useMemo<TopicGroup[] | null>(() => {
    if (topic !== 'all') return null;
    const byTopic = new Map<string, DictionaryEntry[]>();
    for (const e of shown) {
      const key = e.topic ?? MISC;
      if (!byTopic.has(key)) byTopic.set(key, []);
      byTopic.get(key)!.push(e);
    }
    const collator = new Intl.Collator(i18n.language);
    const named = [...byTopic.entries()]
      .filter(([slug]) => slug !== MISC)
      .map(([slug, items]) => ({ slug, label: t(`topics.${slug}`), items }))
      .sort((a, b) => collator.compare(a.label, b.label));
    const misc = byTopic.get(MISC);
    return misc ? [...named, { slug: MISC, label: t('dictionary.miscTopic'), items: misc }] : named;
  }, [shown, topic, t, i18n.language]);

  if (!validTopic) return <Navigate to="/dictionary" replace />;

  const title = topic === 'all' ? t('dictionary.allWords') : t(`topics.${topic}`);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={title} />
      <Link to="/dictionary" className="mt-2 inline-block text-sm text-primary">← {t('dictionary.title')}</Link>
      <input type="search" role="searchbox" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={t('dictionary.searchPlaceholder')}
        className="mt-3 w-full rounded-md border border-border px-3 py-2 text-sm" />
      <p className="mt-2 text-xs text-ink-muted">{t('dictionary.count', { count: shown.length })}</p>
      {loading ? <p className="mt-6 text-ink-muted">{t('common.loading')}</p>
        : shown.length === 0 ? <p className="mt-6 text-ink-muted">{t('dictionary.empty')}</p>
        : groups ? (
        <ul className="mt-4">
          {groups.map((g) => (
            <li key={g.slug}>
              <div className="sticky top-0 z-10 bg-bg px-1 py-2 text-xs font-bold uppercase tracking-wide text-ink-muted border-b border-border">
                {g.label}
              </div>
              <ul className="divide-y divide-border">
                {g.items.map((e) => <EntryRow key={e.id} entry={e} />)}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {shown.map((e) => <EntryRow key={e.id} entry={e} />)}
        </ul>
      )}
    </div>
  );
}

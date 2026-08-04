import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { AnatomyBrowse } from './anatomy/AnatomyBrowse';
import { AnatomyExplorer } from '../components/anatomy/AnatomyExplorer';

// /anatomy has two views sharing the same topic='anatomy' words: the card-grid
// ("Browse") and the interactive figure ("Explore"). View is in the URL (?view=explore)
// so it's linkable and survives back/forward; absent = Browse.
export function AnatomyView() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const explore = params.get('view') === 'explore';

  const setView = (v: 'browse' | 'explore') => {
    const next = new URLSearchParams(params);
    if (v === 'explore') next.set('view', 'explore'); else next.delete('view');
    setParams(next, { replace: true });
  };

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={t('anatomy.title')} />
      <div className="mt-3 inline-flex rounded-full border border-border p-0.5 text-sm">
        <button type="button" aria-pressed={!explore} onClick={() => setView('browse')}
          className={`rounded-full px-3 py-1 font-semibold ${!explore ? 'bg-primary text-white' : 'text-ink-muted'}`}>
          {t('anatomy.viewBrowse')}
        </button>
        <button type="button" aria-pressed={explore} onClick={() => setView('explore')}
          className={`rounded-full px-3 py-1 font-semibold ${explore ? 'bg-primary text-white' : 'text-ink-muted'}`}>
          {t('anatomy.viewExplore')}
        </button>
      </div>
      {explore ? <AnatomyExplorer /> : <AnatomyBrowse />}
    </div>
  );
}

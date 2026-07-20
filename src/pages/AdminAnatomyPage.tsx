import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import {
  fetchAnatomyAdmin, setAnatomyMeta, setPrimaryImage, type AnatomyAdminEntry,
} from '../data/anatomyAdmin';
import { REGIONS, type Region } from '../lib/anatomyRegions';
import { SYSTEMS, type BodySystem } from '../lib/anatomySystems';

export function AdminAnatomyPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AnatomyAdminEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = () => fetchAnatomyAdmin().then(setRows);
  useEffect(() => { reload(); }, []);

  const readyCount = useMemo(
    () => rows.filter((r) => r.region && r.system && r.images.some((i) => i.isPrimary)).length,
    [rows],
  );

  const onMetaChange = async (entryId: string, region: Region | '', system: BodySystem | '') => {
    if (!region || !system) return;
    setError(null);
    try {
      await setAnatomyMeta(entryId, region, system);
      await reload();
    } catch (err) {
      setError(String((err as { message?: string })?.message ?? err));
    }
  };

  const onSetPrimary = async (imageId: string) => {
    setError(null);
    try {
      await setPrimaryImage(imageId);
      await reload();
    } catch (err) {
      setError(String((err as { message?: string })?.message ?? err));
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={t('nav.anatomyAdmin')} />
      <p className="mt-3 text-sm text-ink-muted">
        {t('admin.anatomyCoverage', { ready: readyCount, total: rows.length })}
      </p>
      {error && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <ul className="mt-4 divide-y divide-border">
        {rows.map((r) => (
          <li key={r.entry.id} className="py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-lg font-bold text-ink">{r.entry.hebrewNikud}</span>
                <span className="ms-2 text-sm text-ink-muted">{r.entry.translations.en}</span>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <label className="text-xs text-ink-muted">
                <span className="sr-only">{t('admin.anatomyRegionLabel')}</span>
                <select
                  aria-label={t('admin.anatomyRegionLabel')}
                  className="rounded border border-border px-1 py-0.5 text-xs"
                  value={r.region ?? ''}
                  onChange={(e) => onMetaChange(r.entry.id, e.target.value as Region, r.system ?? '')}
                >
                  <option value="">{t('admin.anatomyNoRegion')}</option>
                  {REGIONS.map((slug) => <option key={slug} value={slug}>{t(`regions.${slug}`)}</option>)}
                </select>
              </label>
              <label className="text-xs text-ink-muted">
                <span className="sr-only">{t('admin.anatomySystemLabel')}</span>
                <select
                  aria-label={t('admin.anatomySystemLabel')}
                  className="rounded border border-border px-1 py-0.5 text-xs"
                  value={r.system ?? ''}
                  onChange={(e) => onMetaChange(r.entry.id, r.region ?? '', e.target.value as BodySystem)}
                >
                  <option value="">{t('admin.anatomyNoSystem')}</option>
                  {SYSTEMS.map((slug) => <option key={slug} value={slug}>{t(`systems.${slug}`)}</option>)}
                </select>
              </label>
            </div>
            {r.images.length === 0 ? (
              <p className="mt-2 text-xs text-ink-muted">{t('admin.anatomyNoImages')}</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {r.images.map((img) => (
                  <li key={img.id} className="w-28 rounded-md border border-border p-1">
                    <img src={img.url} alt="" className="aspect-square w-full rounded object-cover" />
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span className="rounded bg-primary-tint px-1 text-primary">
                        {img.source === 'curated' ? t('admin.anatomyCurated') : t('admin.anatomyAi')}
                      </span>
                      {img.isPrimary && <span className="font-semibold text-primary">{t('admin.anatomyPrimary')}</span>}
                    </div>
                    {!img.isPrimary && (
                      <button type="button" onClick={() => onSetPrimary(img.id)}
                        className="mt-1 w-full rounded border border-border text-[10px]">
                        {t('admin.anatomySetPrimary')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

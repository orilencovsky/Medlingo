import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAnatomyCards, type AnatomyCard } from '../data/anatomy';
import { loadAllCards, seedNewCards } from '../data/cards';
import { REGIONS, type Region } from '../lib/anatomyRegions';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { BodyFigure } from '../components/BodyFigure';
import { He } from '../components/He';

const ALL = 'all' as const;
type RegionFilter = Region | typeof ALL;

interface SystemGroup { system: string; items: AnatomyCard[]; }

function CardTile({ card, inReview }: { card: AnatomyCard; inReview: boolean }) {
  const { t } = useTranslation();
  return (
    <li className="overflow-hidden rounded-md border border-border bg-surface">
      <img src={card.imageUrl} alt={card.entry.translations.en}
        className="aspect-square w-full object-cover" loading="lazy" />
      <div className="p-2">
        <He className="block text-base font-bold text-ink">{card.entry.hebrewNikud}</He>
        <div className="text-sm text-ink-muted">{card.entry.translations.en}</div>
        {inReview && (
          <div className="mt-1 text-[10px] font-semibold text-primary">✓ {t('anatomy.inReview')}</div>
        )}
        {card.imageCredit && <div className="mt-1 text-[10px] text-ink-subtle">{card.imageCredit}</div>}
      </div>
      <span className="sr-only">{t(`regions.${card.region}`)}</span>
    </li>
  );
}

export function AnatomyPage() {
  const { t } = useTranslation();
  const [cards, setCards] = useState<AnatomyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<RegionFilter>(ALL);
  const [inReview, setInReview] = useState<Set<string>>(new Set());
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    Promise.all([fetchAnatomyCards(), loadAllCards()]).then(([c, existing]) => {
      setCards(c);
      setInReview(new Set(existing.map((cs) => cs.entryId)));
      setLoading(false);
    });
  }, []);

  const shown = useMemo(
    () => (region === ALL ? cards : cards.filter((c) => c.region === region)),
    [cards, region],
  );

  const missing = useMemo(
    () => shown.filter((c) => !inReview.has(c.entry.id)).map((c) => c.entry.id),
    [shown, inReview],
  );

  // Seeding is idempotent server-side (ignoreDuplicates) and batched — one
  // request regardless of how many terms are shown. New cards are due
  // immediately, so they join the next review session.
  async function addShownToReview() {
    setSeeding(true);
    try {
      await seedNewCards(missing);
      setInReview((s) => new Set([...s, ...missing]));
    } finally {
      setSeeding(false);
    }
  }

  const groups = useMemo<SystemGroup[]>(() => {
    const bySystem = new Map<string, AnatomyCard[]>();
    for (const c of shown) {
      if (!bySystem.has(c.system)) bySystem.set(c.system, []);
      bySystem.get(c.system)!.push(c);
    }
    return [...bySystem.entries()]
      .map(([system, items]) => ({ system, items }))
      .sort((a, b) => t(`systems.${a.system}`).localeCompare(t(`systems.${b.system}`)));
  }, [shown, t]);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={t('anatomy.title')} />
      <div className="sticky top-0 z-10 mt-3 flex items-start gap-3 bg-bg py-2">
        <BodyFigure region={region} onSelect={setRegion} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setRegion(ALL)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${region === ALL ? 'bg-primary text-white' : 'border border-border text-ink-muted'}`}>
            {t('anatomy.regionAll')}
          </button>
          {REGIONS.map((r) => (
            <button key={r} type="button" onClick={() => setRegion(r)}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${region === r ? 'bg-primary text-white' : 'border border-border text-ink-muted'}`}>
              {t(`regions.${r}`)}
            </button>
          ))}
        </div>
      </div>
      {loading ? <p className="mt-6 text-ink-muted">{t('common.loading')}</p>
        : shown.length === 0 ? <p className="mt-6 text-ink-muted">{t('anatomy.empty')}</p>
        : (
        <div className="mt-2">
          <Button
            data-testid="anatomy-add-to-review"
            variant="secondary"
            className="w-full"
            disabled={seeding || missing.length === 0}
            onClick={addShownToReview}
          >
            {missing.length === 0
              ? t('anatomy.allInReview')
              : t('anatomy.addToReview', { count: missing.length })}
          </Button>
          {groups.map((g) => (
            <section key={g.system} className="mt-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-primary">{t(`systems.${g.system}`)}</h2>
              <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {g.items.map((c) => (
                  <CardTile key={c.entry.id} card={c} inReview={inReview.has(c.entry.id)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

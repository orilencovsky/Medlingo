import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { loadUnits, loadUnitProgress, loadUnitEntryIds } from '../data/units';
import { loadDueCards, loadUpcomingCards, loadAllCards } from '../data/cards';
import { getProfile, touchStreak } from '../data/profile';
import { StatsStrip } from '../components/StatsStrip';
import { LanguagePicker } from '../components/LanguagePicker';
import i18n, { applyLanguage } from '../lib/i18n';
import type { CardState, Profile, Unit } from '../lib/types';

const KNOWN_STABILITY_DAYS = 7;

type UnitProgress = 'not_started' | 'in_progress' | 'completed';

interface HomeState {
  units: Unit[];
  progress: Record<string, UnitProgress>;
  dueCount: number;
  nextDue: Date | null;
  cards: CardState[];
  profile: Profile | null;
  entryIds: Record<string, string[]>;
}

export function HomePage() {
  const { t } = useTranslation();
  const [state, setState] = useState<HomeState | null>(null);
  const touched = useRef(false); // StrictMode double-invokes mount effects — streak must touch once

  useEffect(() => {
    (async () => {
      const [units, profile, due, cards, entryIds] = await Promise.all([
        loadUnits(), getProfile(), loadDueCards(), loadAllCards(), loadUnitEntryIds(),
      ]);
      if (profile?.uiLanguage && profile.uiLanguage !== i18n.language) {
        await applyLanguage(profile.uiLanguage);
      }
      const progressEntries = await Promise.all(
        units.map(async (u) => [u.slug, await loadUnitProgress(u.slug)] as const),
      );
      const progress = Object.fromEntries(progressEntries);
      let nextDue: Date | null = null;
      if (due.length === 0 && cards.length > 0) {
        if (!touched.current) {
          touched.current = true;
          await touchStreak(); // caught-up visit maintains the streak
        }
        const upcoming = await loadUpcomingCards(1);
        nextDue = upcoming[0]?.card.due ?? null;
      }
      setState({ units, progress, dueCount: due.length, nextDue, cards, profile, entryIds });
    })();
  }, []);

  if (!state) return <p className="p-4">{t('common.loading')}</p>;

  const learned = state.cards.filter((c) => c.reps > 0).length;
  const known = state.cards.filter(
    (c) => c.state === 'review' && c.stability >= KNOWN_STABILITY_DAYS,
  ).length;
  const startedIds = new Set(state.cards.filter((c) => c.reps > 0).map((c) => c.entryId));
  const firstRun = state.cards.length === 0;
  const ctaFor = (p: UnitProgress) =>
    p === 'completed' ? t('home.completed')
    : p === 'in_progress' ? t('home.continue')
    : t('home.start');

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('app.title')}</h1>
        <LanguagePicker />
      </div>

      <StatsStrip
        streak={state.profile?.streakCurrent ?? 0}
        dueCount={state.dueCount}
        mastered={known}
        learned={learned}
      />

      {state.units.length === 0 && (
        <div data-testid="home-unit-card" className="rounded border p-4">
          <h2 className="font-semibold">{t('home.unitTitle')}</h2>
          <p className="mt-1 text-gray-600">{t('common.loading')}</p>
        </div>
      )}
      {state.units.map((unit) => {
        const progress = state.progress[unit.slug] ?? 'not_started';
        const ids = state.entryIds[unit.slug] ?? [];
        const covered = ids.filter((id) => startedIds.has(id)).length;
        const percent = ids.length === 0 ? 0 : Math.round((covered / ids.length) * 100);
        return (
          <div key={unit.slug} data-testid="home-unit-card" className="rounded border p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{unit.title.en}</h2>
              {unit.status === 'draft' && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  {t('home.draft')}
                </span>
              )}
            </div>
            {ids.length > 0 && (
              <div className="mt-2">
                <div data-testid="unit-progress-bar" className="h-1.5 overflow-hidden rounded bg-gray-200">
                  <div
                    data-testid="unit-progress-fill"
                    className={percent === 100 ? 'h-full bg-green-600' : 'h-full bg-blue-700'}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p data-testid="unit-progress-text" className="mt-1 text-xs text-gray-500">
                  {covered}/{ids.length} · {percent}%
                </p>
              </div>
            )}
            {progress === 'completed' ? (
              <p className="mt-2 text-green-700">{ctaFor(progress)} ✓</p>
            ) : (
              <Link to={`/unit/${unit.slug}`} className="mt-2 block rounded bg-blue-700 p-2 text-center text-white">
                {ctaFor(progress)}
              </Link>
            )}
          </div>
        );
      })}

      <div data-testid="home-review-card" className="rounded border p-4">
        <h2 className="font-semibold">{t('home.reviewTitle')}</h2>
        {firstRun ? (
          <p className="mt-1 text-gray-600">{t('home.firstRun')}</p>
        ) : state.dueCount > 0 ? (
          <Link to="/review" className="mt-2 block rounded bg-blue-700 p-2 text-center text-white">
            {t('home.due', { count: state.dueCount })}
          </Link>
        ) : (
          <>
            <p className="mt-1">
              {t('home.caughtUp', { time: state.nextDue ? state.nextDue.toLocaleString() : '—' })}
            </p>
            <Link to="/review?extra=1" className="mt-2 block rounded border p-2 text-center">
              {t('home.extraPractice')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

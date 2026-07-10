import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { loadUnits, loadUnitProgress } from '../data/units';
import { loadDueCards, loadUpcomingCards, loadAllCards } from '../data/cards';
import { getProfile, touchStreak } from '../data/profile';
import type { CardState, Profile, Unit } from '../lib/types';

const KNOWN_STABILITY_DAYS = 7;

interface HomeState {
  unit: Unit | null;
  progress: 'not_started' | 'in_progress' | 'completed';
  dueCount: number;
  nextDue: Date | null;
  cards: CardState[];
  profile: Profile | null;
}

export function HomePage() {
  const { t } = useTranslation();
  const [state, setState] = useState<HomeState | null>(null);
  const touched = useRef(false); // StrictMode double-invokes mount effects — streak must touch once

  useEffect(() => {
    (async () => {
      const [units, profile, due, cards] = await Promise.all([
        loadUnits(), getProfile(), loadDueCards(), loadAllCards(),
      ]);
      const unit = units[0] ?? null;
      const progress = unit ? await loadUnitProgress(unit.slug) : 'not_started';
      let nextDue: Date | null = null;
      if (due.length === 0 && cards.length > 0) {
        if (!touched.current) {
          touched.current = true;
          await touchStreak(); // caught-up visit maintains the streak
        }
        const upcoming = await loadUpcomingCards(1);
        nextDue = upcoming[0]?.card.due ?? null;
      }
      setState({ unit, progress, dueCount: due.length, nextDue, cards, profile });
    })();
  }, []);

  if (!state) return <p className="p-4">{t('common.loading')}</p>;

  const learned = state.cards.filter((c) => c.reps > 0).length;
  const known = state.cards.filter(
    (c) => c.state === 'review' && c.stability >= KNOWN_STABILITY_DAYS,
  ).length;
  const firstRun = state.cards.length === 0;
  const unitCta =
    state.progress === 'completed' ? t('home.completed')
    : state.progress === 'in_progress' ? t('home.continue')
    : t('home.start');

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{t('app.title')}</h1>

      <div data-testid="home-streak" className="flex gap-4 text-sm text-gray-700">
        <span>{t('home.streak', { count: state.profile?.streakCurrent ?? 0 })}</span>
        <span>{t('home.wordsLearned', { count: learned })}</span>
        <span>{t('home.wordsKnown', { count: known })}</span>
      </div>

      <div data-testid="home-unit-card" className="rounded border p-4">
        <h2 className="font-semibold">{t('home.unitTitle')}</h2>
        {state.unit ? (
          <>
            <p className="mt-1">{state.unit.title.en}</p>
            {state.progress === 'completed' ? (
              <p className="mt-2 text-green-700">{unitCta} ✓</p>
            ) : (
              <Link to={`/unit/${state.unit.slug}`} className="mt-2 block rounded bg-blue-700 p-2 text-center text-white">
                {unitCta}
              </Link>
            )}
          </>
        ) : (
          <p className="mt-1 text-gray-600">{t('common.loading')}</p>
        )}
      </div>

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

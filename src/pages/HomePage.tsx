import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Clock, Stethoscope, CheckCircle2, Circle, CircleDashed } from 'lucide-react';
import { loadUnits, loadAllUnitProgress, loadUnitEntryIds } from '../data/units';
import { loadAllCards } from '../data/cards';
import { getProfile, touchStreak } from '../data/profile';
import { isDue } from '../lib/fsrs';
import { StatsStrip } from '../components/StatsStrip';
import { PageHeader } from '../components/ui/PageHeader';
import { SectionTitle } from '../components/ui/SectionTitle';
import { Card } from '../components/ui/Card';
import { LinkButton } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { SegmentedBar } from '../components/ui/SegmentedBar';
import { computeOverallProgress, KNOWN_STABILITY_DAYS } from './homeMetrics';
import i18n, { applyLanguage } from '../lib/i18n';
import type { CardState, Profile, Unit } from '../lib/types';
import { drillEnabled } from '../lib/flags';

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

const UNIT_ICON: Record<UnitProgress, typeof CheckCircle2> = {
  completed: CheckCircle2,
  in_progress: CircleDashed,
  not_started: Circle,
};

export function HomePage() {
  const { t } = useTranslation();
  const [state, setState] = useState<HomeState | null>(null);
  const touched = useRef(false); // StrictMode double-invokes mount effects — streak must touch once

  useEffect(() => {
    (async () => {
      // One flat batch: due/upcoming are derived locally from the full card
      // list instead of re-querying (and re-joining) card state per view.
      const [units, profile, cards, entryIds, progress] = await Promise.all([
        loadUnits(), getProfile(), loadAllCards(), loadUnitEntryIds(), loadAllUnitProgress(),
      ]);
      if (profile?.uiLanguage && profile.uiLanguage !== i18n.language) {
        await applyLanguage(profile.uiLanguage);
      }
      const now = new Date();
      const dueCount = cards.filter((c) => isDue(c, now)).length;
      let nextDue: Date | null = null;
      if (dueCount === 0 && cards.length > 0) {
        if (!touched.current) {
          touched.current = true;
          await touchStreak(); // caught-up visit maintains the streak
        }
        nextDue = cards.reduce((min, c) => (c.due < min ? c.due : min), cards[0].due);
      }
      setState({ units, progress, dueCount, nextDue, cards, profile, entryIds });
    })();
  }, []);

  if (!state) return <p className="p-4">{t('common.loading')}</p>;

  const learned = state.cards.filter((c) => c.reps > 0).length;
  const known = state.cards.filter(
    (c) => c.state === 'review' && c.stability >= KNOWN_STABILITY_DAYS,
  ).length;
  const startedIds = new Set(state.cards.filter((c) => c.reps > 0).map((c) => c.entryId));
  const firstRun = state.cards.length === 0;
  const overall = computeOverallProgress(state.units, state.cards, state.entryIds);
  const ctaFor = (p: UnitProgress) =>
    p === 'completed' ? t('home.completed')
    : p === 'in_progress' ? t('home.continue')
    : t('home.start');

  return (
    <div className="mx-auto flex max-w-2xl lg:mx-0 lg:max-w-none flex-col gap-4 bg-bg p-4">
      <PageHeader title={t('app.title')} displayName={state.profile?.displayName} />

      <div>
        <p className="text-xl font-extrabold text-ink">
          {t('home.greeting', { name: state.profile?.displayName ?? '' })}
        </p>
        {state.dueCount > 0 && (
          <p className="text-sm text-ink-subtle">{t('home.dueSummary', { count: state.dueCount })}</p>
        )}
      </div>

      <Card data-testid="overall-progress-card">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-extrabold text-ink">{t('home.overallProgress')}</span>
          <span className="text-xs text-ink-subtle">{t('home.wordsInCourse', { count: overall.total })}</span>
        </div>
        <SegmentedBar coveredPct={overall.coveredPct} masteredPct={overall.masteredPct} />
        <div className="mt-2 flex gap-4">
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="size-2.5 rounded-xs bg-primary" />
            {t('home.masteredCount', { count: overall.mastered, pct: overall.masteredPct })}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="size-2.5 rounded-xs bg-primary-soft" />
            {t('home.coveredCount', { count: overall.covered, pct: overall.coveredPct })}
          </span>
        </div>
      </Card>

      <StatsStrip
        streak={state.profile?.streakCurrent ?? 0}
        dueCount={state.dueCount}
        mastered={known}
        learned={learned}
      />

      <Card data-testid="home-review-card">
        <SectionTitle>{t('home.reviewTitle')}</SectionTitle>
        {firstRun ? (
          <p className="mt-1 text-ink-subtle">{t('home.firstRun')}</p>
        ) : state.dueCount > 0 ? (
          <LinkButton to="/review" className="mt-3 w-full" icon={<Clock className="size-4" />}>
            {t('home.due', { count: state.dueCount })}
          </LinkButton>
        ) : (
          <>
            <p className="mt-1 text-ink-muted">
              {t('home.caughtUp', { time: state.nextDue ? state.nextDue.toLocaleString() : '—' })}
            </p>
            <LinkButton to="/review?extra=1" variant="secondary" className="mt-3 w-full">
              {t('home.extraPractice')}
            </LinkButton>
          </>
        )}
      </Card>

      {drillEnabled() && (
        <Link to="/drill" className="block">
          <Card interactive data-testid="home-drill-card" className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-tint">
              <Stethoscope className="size-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-ink">{t('home.drill')}</p>
                <span className="rounded-xs bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {t('home.new')}
                </span>
              </div>
              <p className="text-xs text-ink-subtle">{t('home.drillSubtitle')}</p>
            </div>
          </Card>
        </Link>
      )}

      <SectionTitle>{t('home.myUnits')}</SectionTitle>
      <div className="flex flex-col gap-2">
        {state.units.length === 0 && (
          <Card data-testid="home-unit-card">
            <h3 className="font-semibold text-ink">{t('home.unitTitle')}</h3>
            <p className="mt-1 text-ink-subtle">{t('common.loading')}</p>
          </Card>
        )}
        {state.units.map((unit) => {
          const progress = state.progress[unit.slug] ?? 'not_started';
          const ids = state.entryIds[unit.slug] ?? [];
          const covered = ids.filter((id) => startedIds.has(id)).length;
          const percent = ids.length === 0 ? 0 : Math.round((covered / ids.length) * 100);
          const Icon = UNIT_ICON[progress];
          return (
            <Card key={unit.slug} muted={progress === 'not_started'} data-testid="home-unit-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`size-4 ${progress === 'completed' ? 'text-primary' : 'text-ink-subtle'}`} />
                  <h3 className="font-semibold text-ink">{unit.title.en}</h3>
                </div>
                {unit.status === 'draft' && (
                  <span className="rounded-xs bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                    {t('home.draft')}
                  </span>
                )}
              </div>
              {ids.length > 0 && (
                <div className="mt-2">
                  <ProgressBar
                    value={percent}
                    tone={percent === 100 ? 'success' : 'primary'}
                    barTestId="unit-progress-bar"
                    fillTestId="unit-progress-fill"
                  />
                  <p data-testid="unit-progress-text" className="mt-1 text-xs text-ink-subtle">
                    {covered}/{ids.length} · {percent}%
                  </p>
                </div>
              )}
              {progress === 'completed' ? (
                <p className="mt-2 text-sm font-semibold text-primary">{ctaFor(progress)} ✓</p>
              ) : (
                <LinkButton to={`/unit/${unit.slug}`} size="sm" className="mt-2 w-full">
                  {ctaFor(progress)}
                </LinkButton>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

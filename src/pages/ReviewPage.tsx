import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  loadDueCards, loadUpcomingCards, loadEntryPool, submitReview, flushPendingReviews,
} from '../data/cards';
import { touchStreak } from '../data/profile';
import { selectForm } from '../lib/fsrs';
import { pickDistractors } from '../lib/distractors';
import { Recognition, type ExerciseResult } from '../components/exercises/Recognition';
import { Cloze } from '../components/exercises/Cloze';
import { Recall } from '../components/exercises/Recall';
import { ImageRecognition } from '../components/exercises/ImageRecognition';
import type { DictionaryEntry, ReviewCard } from '../lib/types';
import { drillEnabled } from '../lib/flags';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

const EXTRA_LIMIT = 10;

// Form selection must see what the card can support: anatomy cards carry an
// image but no context sentences. Must stay identical between render and
// handleResult so the submitted form matches the exercise that was shown.
const capsOf = (c: ReviewCard) =>
  ({ hasImage: c.imageUrl !== null, hasContext: c.contextSentences.length > 0 });

type Phase =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'caught-up'; nextDue: Date | null }
  | { kind: 'running'; queue: ReviewCard[]; index: number; requeued: Set<string>; correct: number; total: number; extra: boolean }
  | { kind: 'summary'; correct: number; total: number };

export function ReviewPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [pool, setPool] = useState<DictionaryEntry[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  async function startExtra() {
    try {
      const upcoming = await loadUpcomingCards(EXTRA_LIMIT);
      setPhase({
        kind: 'running', queue: upcoming, index: 0, requeued: new Set(),
        correct: 0, total: 0, extra: true,
      });
    } catch {
      setPhase({ kind: 'error' });
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await flushPendingReviews();
        setPool(await loadEntryPool());
        if (params.get('extra') === '1') return void (await startExtra());
        const due = await loadDueCards();
        if (due.length === 0) {
          const upcoming = await loadUpcomingCards(1);
          setPhase({ kind: 'caught-up', nextDue: upcoming[0]?.card.due ?? null });
        } else {
          setPhase({
            kind: 'running', queue: due, index: 0, requeued: new Set(),
            correct: 0, total: 0, extra: false,
          });
        }
      } catch {
        setPhase({ kind: 'error' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = phase.kind === 'running' ? phase.queue[phase.index] : null;
  const distractors = useMemo(() => {
    if (!current) return [];
    // Image options should all be anatomy terms — otherwise the one anatomy
    // word among general vocabulary gives the answer away by elimination.
    if (selectForm(current.card, capsOf(current)) === 'image_recognition') {
      const anatomyPool = pool.filter((e) => e.topic === 'anatomy');
      if (anatomyPool.length > 3) return pickDistractors(current.entry, anatomyPool);
    }
    return pickDistractors(current.entry, pool);
  }, [current, pool]);

  async function handleResult(r: ExerciseResult) {
    if (phase.kind !== 'running' || !current) return;
    const form = selectForm(current.card, capsOf(current));
    await submitReview({
      entryId: current.entry.id, form, correct: r.correct, latencyMs: r.latencyMs,
      ...(phase.extra ? { countsForScheduling: false } : {}),
    });
    const queue = [...phase.queue];
    const requeued = new Set(phase.requeued);
    if (!r.correct && !requeued.has(current.entry.id)) {
      requeued.add(current.entry.id);
      queue.push(current);
    }
    const total = phase.total + 1;
    const correct = phase.correct + (r.correct ? 1 : 0);
    const index = phase.index + 1;
    if (index >= queue.length) {
      await touchStreak();
      setPhase({ kind: 'summary', correct, total });
    } else {
      setPhase({ ...phase, queue, index, requeued, correct, total });
    }
  }

  if (phase.kind === 'loading') {
    return (
      <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none p-4">
        <PageHeader title={t('review.title')} />
        <p className="mt-4 text-ink-subtle">{t('common.loading')}</p>
      </div>
    );
  }
  if (phase.kind === 'error') {
    return (
      <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none p-4">
        <PageHeader title={t('review.title')} />
        <p role="alert" className="mt-4 text-red-700">{t('auth.error')}</p>
        <Button variant="secondary" onClick={() => window.location.reload()} className="mt-2">
          {t('common.retry')}
        </Button>
      </div>
    );
  }
  if (phase.kind === 'caught-up') {
    return (
      <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none p-4">
        <PageHeader title={t('review.title')} />
        <Card data-testid="review-caught-up" className="mt-4 text-center">
          <h1 className="text-2xl font-semibold text-ink">{t('review.caughtUp')}</h1>
          {phase.nextDue && (
            <p className="mt-2 text-ink-subtle">
              {t('review.nextDue', { time: phase.nextDue.toLocaleString() })}
            </p>
          )}
          <Button data-testid="review-extra-practice" variant="secondary" onClick={startExtra} className="mt-4">
            {t('review.extra')}
          </Button>
          <p className="mt-4"><Link to="/" className="text-primary underline">{t('common.back')}</Link></p>
        </Card>
      </div>
    );
  }
  if (phase.kind === 'summary') {
    const pct = phase.total === 0 ? 0 : Math.round((100 * phase.correct) / phase.total);
    return (
      <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none p-4">
        <PageHeader title={t('review.title')} />
        <Card data-testid="review-summary" className="mt-4 text-center">
          <h1 className="text-2xl font-semibold text-ink">{t('review.summary')}</h1>
          <p className="mt-2 text-ink">{t('review.reviewed', { count: phase.total })}</p>
          <p className="text-ink">{t('review.accuracy', { pct })}</p>
          {drillEnabled() && (
            <p className="mt-2"><Link to="/drill" className="text-primary underline">{t('home.drill')}</Link></p>
          )}
          <p className="mt-4"><Link to="/" className="text-primary underline">{t('common.back')}</Link></p>
        </Card>
      </div>
    );
  }
  if (!current) {
    return (
      <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none p-4">
        <PageHeader title={t('review.title')} />
        <Card data-testid="review-caught-up" className="mt-4 text-center">
          <p className="text-ink">{t('review.empty')}</p>
          <p className="mt-4"><Link to="/" className="text-primary underline">{t('common.back')}</Link></p>
        </Card>
      </div>
    );
  }

  const form = selectForm(current.card, capsOf(current));
  const key = `${current.entry.id}-${phase.index}`;
  const props = {
    entry: current.entry,
    contextSentences: current.contextSentences,
    distractors,
    imageUrl: current.imageUrl,
    onResult: handleResult,
  };
  return (
    <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none">
      {form === 'image_recognition' ? <ImageRecognition key={key} {...props} />
        : form === 'flashcard_recognition' ? <Recognition key={key} {...props} />
        : form === 'cloze' ? <Cloze key={key} {...props} />
        : <Recall key={key} {...props} />}
    </div>
  );
}

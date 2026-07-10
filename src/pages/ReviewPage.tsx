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
import type { DictionaryEntry, ReviewCard } from '../lib/types';

const EXTRA_LIMIT = 10;

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
    const upcoming = await loadUpcomingCards(EXTRA_LIMIT);
    setPhase({
      kind: 'running', queue: upcoming, index: 0, requeued: new Set(),
      correct: 0, total: 0, extra: true,
    });
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
  const distractors = useMemo(
    () => (current ? pickDistractors(current.entry, pool) : []),
    [current, pool],
  );

  async function handleResult(r: ExerciseResult) {
    if (phase.kind !== 'running' || !current) return;
    const form = selectForm(current.card);
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

  if (phase.kind === 'loading') return <p className="p-4">{t('common.loading')}</p>;
  if (phase.kind === 'error') {
    return (
      <div className="p-4">
        <p role="alert">{t('auth.error')}</p>
        <button onClick={() => window.location.reload()} className="mt-2 rounded border p-2">
          {t('common.retry')}
        </button>
      </div>
    );
  }
  if (phase.kind === 'caught-up') {
    return (
      <div data-testid="review-caught-up" className="p-6 text-center">
        <h1 className="text-2xl font-semibold">{t('review.caughtUp')}</h1>
        {phase.nextDue && (
          <p className="mt-2 text-gray-600">
            {t('review.nextDue', { time: phase.nextDue.toLocaleString() })}
          </p>
        )}
        <button
          data-testid="review-extra-practice"
          onClick={startExtra}
          className="mt-4 rounded border p-2"
        >
          {t('review.extra')}
        </button>
        <p className="mt-4"><Link to="/" className="underline">{t('common.back')}
</Link></p>
      </div>
    );
  }
  if (phase.kind === 'summary') {
    const pct = phase.total === 0 ? 0 : Math.round((100 * phase.correct) / phase.total);
    return (
      <div data-testid="review-summary" className="p-6 text-center">
        <h1 className="text-2xl font-semibold">{t('review.summary')}</h1>
        <p className="mt-2">{t('review.reviewed', { count: phase.total })}</p>
        <p>{t('review.accuracy', { pct })}</p>
        <p className="mt-4"><Link to="/" className="underline">{t('common.back')}
</Link></p>
      </div>
    );
  }
  if (!current) {
    return (
      <div data-testid="review-caught-up" className="p-6 text-center">
        <p>{t('review.empty')}</p>
        <p className="mt-4"><Link to="/" className="underline">{t('common.back')}
</Link></p>
      </div>
    );
  }

  const form = selectForm(current.card);
  const props = {
    key: `${current.entry.id}-${phase.index}`,
    entry: current.entry,
    contextSentences: current.contextSentences,
    distractors,
    onResult: handleResult,
  };
  if (form === 'flashcard_recognition') return <Recognition {...props} />;
  if (form === 'cloze') return <Cloze {...props} />;
  return <Recall {...props} />;
}

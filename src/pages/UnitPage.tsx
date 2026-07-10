import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { He } from '../components/He';
import { Recognition, type ExerciseResult } from '../components/exercises/Recognition';
import { Cloze } from '../components/exercises/Cloze';
import { loadUnit, loadUnitProgress, startUnit, completeUnit } from '../data/units';
import { seedNewCards, submitReview, loadEntryPool } from '../data/cards';
import { pickDistractors } from '../lib/distractors';
import type { DictionaryEntry, UnitItem } from '../lib/types';

type LoadedItem = UnitItem & { entry: DictionaryEntry };
type Phase =
  | { kind: 'loading' }
  | { kind: 'scenario' }
  | { kind: 'vocab'; index: number }
  | { kind: 'practice'; index: number } // index over items×2: even=recognition, odd=cloze
  | { kind: 'done' };

function DialogueWord({ text, item, onGloss }: {
  text: string; item: LoadedItem | undefined; onGloss: (i: LoadedItem) => void;
}) {
  if (!item) return <>{text}</>;
  return (
    <button data-testid="unit-gloss" onClick={() => onGloss(item)} className="underline decoration-dotted">
      {text}
    </button>
  );
}

function renderLine(he: string, items: LoadedItem[], onGloss: (i: LoadedItem) => void) {
  // split the line on unit-word surface forms so each becomes a tappable gloss
  const surfaces = items.map((i) => i.entry.hebrew).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${surfaces.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts = he.split(pattern);
  return parts.map((p, i) => (
    <Fragment key={i}>
      <DialogueWord text={p} item={items.find((it) => it.entry.hebrew === p)} onGloss={onGloss} />
    </Fragment>
  ));
}

export function UnitPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadUnit>> | null>(null);
  const [pool, setPool] = useState<DictionaryEntry[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [gloss, setGloss] = useState<LoadedItem | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const [loaded, entryPool, progress] = await Promise.all([
        loadUnit(slug), loadEntryPool(), loadUnitProgress(slug),
      ]);
      setData(loaded);
      setPool(entryPool);
      if (progress === 'not_started') await startUnit(slug);
      setPhase({ kind: 'scenario' });
    })();
  }, [slug]);

  const items = useMemo(() => data?.items ?? [], [data]);

  async function enterPractice() {
    await seedNewCards(items.map((i) => i.entryId));
    setPhase({ kind: 'practice', index: 0 });
  }

  async function handlePracticeResult(item: LoadedItem, form: 'flashcard_recognition' | 'cloze', r: ExerciseResult) {
    await submitReview({ entryId: item.entryId, form, correct: r.correct, latencyMs: r.latencyMs });
    if (phase.kind !== 'practice') return;
    const next = phase.index + 1;
    if (next >= items.length * 2) {
      await completeUnit(slug!);
      setPhase({ kind: 'done' });
    } else {
      setPhase({ kind: 'practice', index: next });
    }
  }

  if (phase.kind === 'loading' || !data) return <p className="p-4">{t('common.loading')}</p>;

  if (phase.kind === 'scenario') {
    return (
      <div className="p-4">
        <h1 className="text-xl font-semibold">{t('unit.scenario')}: {data.unit.title.en}</h1>
        <div className="mt-4 flex flex-col gap-3">
          {data.unit.dialogue.map((line) => (
            <div key={line.order} className="rounded border p-3">
              <p className="text-sm font-semibold text-gray-600"><He>{line.speaker}</He></p>
              <p className="text-lg"><He>{renderLine(line.he, items, setGloss)}</He></p>
              <p className="text-sm text-gray-600">{line.translations.en}</p>
            </div>
          ))}
        </div>
        {gloss && (
          <div
            data-testid="unit-gloss-panel"
            className="fixed inset-x-0 bottom-0 border-t bg-white p-4 shadow-lg"
            onClick={() => setGloss(null)}
          >
            <p><He className="text-xl font-bold">{gloss.entry.hebrewNikud}</He> — {gloss.entry.translations.en}</p>
            {gloss.entry.gender && <p className="text-sm">{t('unit.gender')}: {gloss.entry.gender}</p>}
            {gloss.entry.everydaySynonym && (
              <p className="text-sm">{t('unit.everyday')}: <He>{gloss.entry.everydaySynonym}</He></p>
            )}
          </div>
        )}
        <button
          data-testid="unit-start"
          onClick={() => setPhase({ kind: 'vocab', index: 0 })}
          className="mt-6 w-full rounded bg-blue-700 p-3 text-white"
        >
          {t('unit.vocab')}
        </button>
      </div>
    );
  }

  if (phase.kind === 'vocab') {
    const item = items[phase.index];
    return (
      <div className="p-4">
        <p className="text-sm text-gray-600">{t('unit.vocab')} {phase.index + 1}/{items.length}</p>
        <div className="mt-4 rounded border p-6 text-center">
          <He className="block text-3xl font-bold">{item.entry.hebrewNikud}</He>
          <p className="mt-2 text-xl">{item.entry.translations.en}</p>
          {item.entry.gender && (
            <p className="mt-1 text-sm text-gray-600">
              {t('unit.gender')}: {item.entry.gender}
              {item.entry.plural && <> · {t('unit.plural')}: <He>{item.entry.plural}</He></>}
            </p>
          )}
          {item.entry.root && <p className="text-sm text-gray-600">{t('unit.root')}: <He>{item.entry.root}</He></p>}
          {item.entry.everydaySynonym && (
            <p className="text-sm text-gray-600">{t('unit.everyday')}: <He>{item.entry.everydaySynonym}</He></p>
          )}
          {item.contextSentences[0] && (
            <p className="mt-3 border-t pt-3"><He>{item.contextSentences[0].he}</He></p>
          )}
        </div>
        <button
          data-testid="unit-vocab-continue"
          onClick={() =>
            phase.index + 1 >= items.length
              ? enterPractice()
              : setPhase({ kind: 'vocab', index: phase.index + 1 })
          }
          className="mt-6 w-full rounded bg-blue-700 p-3 text-white"
        >
          {t('common.continue')}
        </button>
      </div>
    );
  }

  if (phase.kind === 'practice') {
    const item = items[Math.floor(phase.index / 2)];
    const isRecognition = phase.index % 2 === 0;
    const distractors = pickDistractors(item.entry, pool);
    const key = `p-${phase.index}`;
    return isRecognition ? (
      <Recognition key={key} entry={item.entry} contextSentences={item.contextSentences}
        distractors={distractors}
        onResult={(r) => handlePracticeResult(item, 'flashcard_recognition', r)} />
    ) : (
      <Cloze key={key} entry={item.entry} contextSentences={item.contextSentences}
        distractors={distractors}
        onResult={(r) => handlePracticeResult(item, 'cloze', r)} />
    );
  }

  return (
    <div data-testid="unit-complete" className="p-6 text-center">
      <h1 className="text-2xl font-semibold">{t('unit.done')}</h1>
      <p className="mt-4"><Link to="/" className="underline">{t('common.back')}</Link></p>
    </div>
  );
}

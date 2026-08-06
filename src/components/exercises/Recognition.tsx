import { useMemo, useRef, useState } from 'react';
import { He } from '../He';
import { Feedback } from './Feedback';
import type { ContextSentence, DictionaryEntry } from '../../lib/types';

export interface ExerciseResult { correct: boolean; latencyMs: number; }
export interface ExerciseProps {
  entry: DictionaryEntry;
  contextSentences: ContextSentence[];
  distractors: DictionaryEntry[];
  imageUrl?: string | null; // used by ImageRecognition; other forms ignore it
  onResult: (r: ExerciseResult) => void;
}

export function useExercise(onResult: (r: ExerciseResult) => void) {
  const startedAt = useRef(performance.now());
  const [answered, setAnswered] = useState<null | boolean>(null);
  const latency = useRef(0);
  const finished = useRef(false); // double-tap on Continue must not re-fire onResult (duplicate review writes)
  function answer(correct: boolean) {
    if (answered !== null) return;
    latency.current = performance.now() - startedAt.current;
    setAnswered(correct);
  }
  function finish() {
    if (finished.current) return;
    finished.current = true;
    onResult({ correct: answered!, latencyMs: latency.current });
  }
  return { answered, answer, finish };
}

export function shuffledOnce<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

export function Recognition({ entry, distractors, onResult }: ExerciseProps) {
  const { answered, answer, finish } = useExercise(onResult);
  const options = useMemo(
    () => shuffledOnce([entry, ...distractors]),
    [entry, distractors],
  );
  return (
    <div className="p-4">
      <He className="block text-center text-3xl font-bold text-ink">{entry.hebrewNikud}</He>
      <div className="mt-6 flex flex-col gap-2">
        {options.map((o, i) => (
          <button
            key={o.id}
            data-testid={`exercise-option-${i}`}
            disabled={answered !== null}
            onClick={() => answer(o.id === entry.id)}
            className="rounded-md border border-border bg-surface p-3 text-start text-ink shadow-card transition-colors hover:bg-primary-tint disabled:opacity-60"
          >
            {o.translations.en}
          </button>
        ))}
      </div>
      {answered !== null && <Feedback entry={entry} correct={answered} onContinue={finish} />}
    </div>
  );
}

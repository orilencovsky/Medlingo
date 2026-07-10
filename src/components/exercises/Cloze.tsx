import { useMemo } from 'react';
import { He } from '../He';
import { Feedback } from './Feedback';
import { useExercise, shuffledOnce, type ExerciseProps } from './Recognition';

export function blankOut(sentence: string, surface: string): string {
  return sentence.includes(surface) ? sentence.replace(surface, '____') : `____ — ${sentence}`;
}

export function Cloze({ entry, contextSentences, distractors, onResult }: ExerciseProps) {
  const { answered, answer, finish } = useExercise(onResult);
  const sentence = contextSentences[0]?.he ?? entry.hebrew;
  const blanked = blankOut(sentence, entry.hebrew);
  const tiles = useMemo(() => shuffledOnce([entry, ...distractors]), [entry, distractors]);
  return (
    <div className="p-4">
      <He className="block text-center text-xl">{blanked}</He>
      {contextSentences[0] && (
        <p className="mt-1 text-center text-sm text-gray-600">{contextSentences[0].translations.en}</p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-2">
        {tiles.map((o, i) => (
          <button
            key={o.id}
            data-testid={`exercise-tile-${i}`}
            disabled={answered !== null}
            onClick={() => answer(o.id === entry.id)}
            className="rounded border p-3 disabled:opacity-60"
          >
            <He>{o.hebrew}</He>
          </button>
        ))}
      </div>
      {answered !== null && <Feedback entry={entry} correct={answered} onContinue={finish} />}
    </div>
  );
}

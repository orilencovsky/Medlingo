import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { He } from '../He';
import { Feedback } from './Feedback';
import { useExercise, shuffledOnce, type ExerciseProps } from './Recognition';

export function Recall({ entry, distractors, onResult }: ExerciseProps) {
  const { t } = useTranslation();
  const { answered, answer, finish } = useExercise(onResult);
  const tiles = useMemo(() => shuffledOnce([entry, ...distractors]), [entry, distractors]);
  return (
    <div className="p-4">
      <p className="text-center text-2xl font-semibold">{entry.translations.en}</p>
      {entry.gender && (
        <p className="text-center text-sm text-gray-600">{t('unit.gender')}: <He>{entry.gender}</He></p>
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

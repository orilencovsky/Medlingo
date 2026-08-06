import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { He } from '../He';
import { Feedback } from './Feedback';
import { useExercise, shuffledOnce, type ExerciseProps } from './Recognition';

// Image → Hebrew term: the inverse direction of Recognition (Hebrew → English).
// The visual is the prompt and producing the Hebrew term is the goal, so the
// options render hebrewNikud, not translations. The image alt stays empty on
// purpose — naming the answer in the alt would leak it.
export function ImageRecognition({ entry, imageUrl, distractors, onResult }: ExerciseProps) {
  const { t } = useTranslation();
  const { answered, answer, finish } = useExercise(onResult);
  const options = useMemo(() => shuffledOnce([entry, ...distractors]), [entry, distractors]);
  return (
    <div className="p-4">
      <img
        src={imageUrl ?? undefined}
        alt=""
        data-testid="exercise-image"
        className="mx-auto aspect-square w-48 rounded-md border border-border bg-surface object-cover"
      />
      <p className="mt-3 text-center text-sm text-ink-muted">{t('review.imagePrompt')}</p>
      <div className="mt-4 flex flex-col gap-2">
        {options.map((o, i) => (
          <button
            key={o.id}
            data-testid={`exercise-option-${i}`}
            disabled={answered !== null}
            onClick={() => answer(o.id === entry.id)}
            className="rounded-md border border-border bg-surface p-3 text-start shadow-card transition-colors hover:bg-primary-tint disabled:opacity-60"
          >
            <He className="text-ink">{o.hebrewNikud}</He>
          </button>
        ))}
      </div>
      {answered !== null && <Feedback entry={entry} correct={answered} onContinue={finish} />}
    </div>
  );
}

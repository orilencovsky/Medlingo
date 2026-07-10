import { useTranslation } from 'react-i18next';
import { He } from '../He';
import type { DictionaryEntry } from '../../lib/types';

export function Feedback({ entry, correct, onContinue }: {
  entry: DictionaryEntry; correct: boolean; onContinue: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div data-testid="exercise-feedback" className="mt-4 rounded border p-4">
      <p className={correct ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>
        {correct ? t('review.correct') : t('review.wrong')}
      </p>
      <p className="mt-2">
        {t('review.answer')}: <He className="text-lg font-semibold">{entry.hebrewNikud}</He>
        {' — '}{entry.translations.en}
      </p>
      {entry.everydaySynonym && (
        <p className="text-sm text-gray-600">
          {t('unit.everyday')}: <He>{entry.everydaySynonym}</He>
        </p>
      )}
      <button
        data-testid="exercise-continue"
        onClick={onContinue}
        className="mt-3 w-full rounded bg-blue-700 p-2 text-white"
      >
        {t('common.continue')}
      </button>
    </div>
  );
}

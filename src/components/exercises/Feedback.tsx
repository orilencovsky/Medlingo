import { useTranslation } from 'react-i18next';
import { He } from '../He';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import type { DictionaryEntry } from '../../lib/types';

export function Feedback({ entry, correct, onContinue }: {
  entry: DictionaryEntry; correct: boolean; onContinue: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card data-testid="exercise-feedback" className="mt-4">
      <p className={correct ? 'font-semibold text-success' : 'font-semibold text-red-700'}>
        {correct ? t('review.correct') : t('review.wrong')}
      </p>
      <p className="mt-2 text-ink">
        {t('review.answer')}: <He className="text-lg font-semibold">{entry.hebrewNikud}</He>
        {' — '}{entry.translations.en}
      </p>
      {entry.everydaySynonym && (
        <p className="text-sm text-ink-subtle">
          {t('unit.everyday')}: <He>{entry.everydaySynonym}</He>
        </p>
      )}
      <Button data-testid="exercise-continue" onClick={onContinue} className="mt-3 w-full">
        {t('common.continue')}
      </Button>
    </Card>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { He } from '../He';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { reportWordProblem } from '../../data/reports';
import type { DictionaryEntry } from '../../lib/types';

type ReportState = 'idle' | 'open' | 'sending' | 'sent' | 'error';

function ReportProblem({ entryId }: { entryId: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<ReportState>('idle');
  const [message, setMessage] = useState('');

  async function submit() {
    if (!message.trim()) return;
    setState('sending');
    try {
      await reportWordProblem(entryId, message.trim());
      setState('sent');
    } catch {
      setState('error');
    }
  }

  if (state === 'sent') {
    return <p className="mt-3 text-sm text-ink-subtle">{t('review.reportSent')}</p>;
  }

  if (state === 'idle') {
    return (
      <button
        data-testid="report-problem-open"
        type="button"
        onClick={() => setState('open')}
        className="mt-3 text-sm text-ink-subtle underline"
      >
        {t('review.reportProblem')}
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <textarea
        data-testid="report-problem-input"
        rows={2}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t('review.reportPlaceholder')}
        className="rounded-md border border-border p-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <div className="flex items-center gap-2">
        <Button
          data-testid="report-problem-submit"
          variant="secondary"
          size="sm"
          disabled={!message.trim() || state === 'sending'}
          onClick={submit}
        >
          {t('review.reportSubmit')}
        </Button>
        {state === 'error' && <span className="text-sm text-red-700">{t('review.reportError')}</span>}
      </div>
    </div>
  );
}

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
      <ReportProblem entryId={entry.id} />
    </Card>
  );
}

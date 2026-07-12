import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../lib/i18n';
import type { DictionaryEntry } from '../../lib/types';

const reportWordProblem = vi.fn().mockResolvedValue(undefined);
vi.mock('../../data/reports', () => ({
  reportWordProblem: (...a: unknown[]) => reportWordProblem(...a),
}));

import { Feedback } from './Feedback';

afterEach(() => cleanup());

const entry: DictionaryEntry = {
  id: 'keev', hebrew: 'כאב', hebrewNikud: 'כְּאֵב', partOfSpeech: 'noun', level: 1,
  gender: 'ז', plural: null, root: null, everydaySynonym: null,
  translations: { en: 'pain' }, notes: null,
};

describe('Feedback report a problem', () => {
  it('is hidden until the reveal link is clicked', () => {
    render(<Feedback entry={entry} correct onContinue={() => {}} />);
    expect(screen.queryByTestId('report-problem-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('report-problem-open')).toBeInTheDocument();
  });

  it('submits the message with the entry id and shows a confirmation', async () => {
    render(<Feedback entry={entry} correct onContinue={() => {}} />);
    await userEvent.click(screen.getByTestId('report-problem-open'));
    await userEvent.type(screen.getByTestId('report-problem-input'), 'wrong translation');
    await userEvent.click(screen.getByTestId('report-problem-submit'));
    expect(reportWordProblem).toHaveBeenCalledWith('keev', 'wrong translation');
    expect(await screen.findByText('Thanks, we got your report.')).toBeInTheDocument();
  });

  it('disables submit until a message is entered', async () => {
    render(<Feedback entry={entry} correct onContinue={() => {}} />);
    await userEvent.click(screen.getByTestId('report-problem-open'));
    expect(screen.getByTestId('report-problem-submit')).toBeDisabled();
  });

  it('shows an error and lets the user retry if the report fails', async () => {
    reportWordProblem.mockRejectedValueOnce(new Error('offline'));
    render(<Feedback entry={entry} correct onContinue={() => {}} />);
    await userEvent.click(screen.getByTestId('report-problem-open'));
    await userEvent.type(screen.getByTestId('report-problem-input'), 'bad audio');
    await userEvent.click(screen.getByTestId('report-problem-submit'));
    expect(await screen.findByText("Couldn't send the report. Try again.")).toBeInTheDocument();
  });
});

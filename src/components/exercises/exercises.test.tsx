import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../lib/i18n';
import type { DictionaryEntry } from '../../lib/types';
import { Recognition } from './Recognition';
import { Cloze } from './Cloze';
import { Recall } from './Recall';
import { ImageRecognition } from './ImageRecognition';

afterEach(() => cleanup());

function entry(id: string, hebrew: string, en: string): DictionaryEntry {
  return {
    id, hebrew, hebrewNikud: hebrew, partOfSpeech: 'noun', level: 1,
    gender: 'ז', plural: null, root: null, everydaySynonym: 'רגישות',
    translations: { en }, notes: null, category: null, topic: null,
  };
}

const answer = entry('keev', 'כאב', 'pain');
const distractors = [entry('a', 'חום', 'fever'), entry('b', 'דופק', 'pulse'), entry('c', 'בחילה', 'nausea')];
const context = [{ he: 'יש לי כאב חזק בחזה.', translations: { en: 'I have strong chest pain.' } }];

async function answerAndContinue(correctText: string, wrong = false) {
  const buttons = screen.getAllByTestId(/exercise-(option|tile)-/);
  const target = wrong
    ? buttons.find((b) => b.textContent !== correctText)!
    : buttons.find((b) => b.textContent === correctText)!;
  await userEvent.click(target);
  expect(screen.getByTestId('exercise-feedback')).toBeInTheDocument();
  await userEvent.click(screen.getByTestId('exercise-continue'));
}

describe('Recognition', () => {
  it('reports correct on tapping the right meaning', async () => {
    const onResult = vi.fn();
    render(<Recognition entry={answer} contextSentences={context} distractors={distractors} onResult={onResult} />);
    await answerAndContinue('pain');
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
    expect(onResult.mock.calls[0][0].latencyMs).toBeGreaterThanOrEqual(0);
  });
  it('reports wrong on tapping a distractor', async () => {
    const onResult = vi.fn();
    render(<Recognition entry={answer} contextSentences={context} distractors={distractors} onResult={onResult} />);
    await answerAndContinue('pain', true);
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ correct: false }));
  });
  it('double-clicking Continue fires onResult exactly once', async () => {
    const onResult = vi.fn();
    render(<Recognition entry={answer} contextSentences={context} distractors={distractors} onResult={onResult} />);
    await userEvent.click(screen.getAllByTestId(/exercise-option-/).find((b) => b.textContent === 'pain')!);
    const cont = screen.getByTestId('exercise-continue');
    await userEvent.click(cont);
    await userEvent.click(cont);
    expect(onResult).toHaveBeenCalledTimes(1);
  });
});

describe('Cloze', () => {
  it('blanks the term in the context sentence and grades tile taps', async () => {
    const onResult = vi.fn();
    render(<Cloze entry={answer} contextSentences={context} distractors={distractors} onResult={onResult} />);
    expect(screen.getByText(/____/)).toBeInTheDocument();
    await answerAndContinue('כאב');
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });
});

describe('Recall', () => {
  it('shows the meaning and grades Hebrew tile taps', async () => {
    const onResult = vi.fn();
    render(<Recall entry={answer} contextSentences={context} distractors={distractors} onResult={onResult} />);
    expect(screen.getByText('pain')).toBeInTheDocument();
    await answerAndContinue('כאב');
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });
});

describe('ImageRecognition', () => {
  it('shows the image and grades Hebrew option taps', async () => {
    const onResult = vi.fn();
    render(<ImageRecognition entry={answer} imageUrl="https://cdn.test/keev.webp"
      contextSentences={[]} distractors={distractors} onResult={onResult} />);
    expect(screen.getByTestId('exercise-image')).toHaveAttribute('src', 'https://cdn.test/keev.webp');
    await answerAndContinue('כאב');
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
    expect(onResult.mock.calls[0][0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('reports wrong on tapping a distractor', async () => {
    const onResult = vi.fn();
    render(<ImageRecognition entry={answer} imageUrl="https://cdn.test/keev.webp"
      contextSentences={[]} distractors={distractors} onResult={onResult} />);
    await answerAndContinue('כאב', true);
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ correct: false }));
  });
});

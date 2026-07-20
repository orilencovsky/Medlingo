import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '../../lib/i18n';
import { AnatomyExplorer } from './AnatomyExplorer';

vi.mock('../../data/anatomy', () => ({
  fetchSceneLabels: vi.fn(async () => ({
    eye: { he: 'עַיִן', en: 'eye' }, heart: { he: 'לֵב', en: 'heart' }, stomach: { he: 'קֵבָה', en: 'stomach' },
    iris: { he: 'קַשְׁתִית', en: 'iris' }, pupil: { he: 'אִישׁוֹן', en: 'pupil' }, conjunctiva: { he: 'לַחְמִית', en: 'conjunctiva' },
  })),
  fetchAnatomyWord: vi.fn(async (id: string) => ({
    entry: { id, hebrew: id, hebrewNikud: id, partOfSpeech: 'noun', level: 1, gender: null, plural: null,
      root: null, everydaySynonym: null, notes: null, translations: { en: id }, category: null, topic: 'anatomy' },
    imageUrl: null, imageCredit: null,
  })),
}));

describe('AnatomyExplorer', () => {
  it('renders the root body scene', async () => {
    render(<AnatomyExplorer />);
    await waitFor(() => expect(document.querySelector('[data-node="eye"]')).toBeInTheDocument());
  });

  it('drills into the eye child scene when the eye region is clicked', async () => {
    render(<AnatomyExplorer />);
    await waitFor(() => expect(document.querySelector('[data-node="eye"]')).toBeInTheDocument());
    await userEvent.click(document.querySelector('[data-node="eye"]')!);
    await waitFor(() => expect(document.querySelector('[data-node="pupil"]')).toBeInTheDocument());
    // breadcrumb now shows the eye crumb
    expect(screen.getByRole('button', { name: /eye|עַיִן/i })).toBeInTheDocument();
  });

  it('opens the word card when a leaf region is clicked', async () => {
    render(<AnatomyExplorer />);
    await waitFor(() => expect(document.querySelector('[data-node="heart"]')).toBeInTheDocument());
    await userEvent.click(document.querySelector('[data-node="heart"]')!);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('pops back to the body scene via the breadcrumb', async () => {
    render(<AnatomyExplorer />);
    await waitFor(() => expect(document.querySelector('[data-node="eye"]')).toBeInTheDocument());
    await userEvent.click(document.querySelector('[data-node="eye"]')!);
    await waitFor(() => expect(document.querySelector('[data-node="pupil"]')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /body|גוף/i }));
    await waitFor(() => expect(document.querySelector('[data-node="stomach"]')).toBeInTheDocument());
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import type { DrillEvent } from '../data/drill';

const script: DrillEvent[][] = [];
const applyDrillVerdicts = vi.fn().mockResolvedValue(undefined);

vi.mock('../data/drill', async () => {
  const actual = await vi.importActual<typeof import('../data/drill')>('../data/drill');
  return {
    ...actual,
    applyDrillVerdicts: (...a: unknown[]) => applyDrillVerdicts(...a),
    streamDrill: async function* () {
      for (const ev of script.shift() ?? []) yield ev;
    },
  };
});
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'jwt' } } }) } },
}));

import { DrillPage } from './DrillPage';

describe('DrillPage', () => {
  beforeEach(() => {
    script.length = 0;
    applyDrillVerdicts.mockClear();
  });

  it('opens the scene, shows feedback, and ends with a verdict summary', async () => {
    // exchange 1: session open (patient presents)
    script.push([
      { type: 'delta', payload: { text: 'שלום דוקטור, ' } },
      { type: 'delta', payload: { text: 'יש לי כאב בחזה.' } },
      { type: 'done', payload: {} },
    ]);
    // exchange 2: learner turn → reply + feedback (session continues)
    script.push([
      { type: 'delta', payload: { text: 'כן, יש לי גם חום.' } },
      { type: 'feedback', payload: { right: 'Good question form', correction: '', tip: 'Try using קוצר נשימה' } },
      { type: 'done', payload: {} },
    ]);
    // exchange 3: learner turn → session ends with verdicts
    script.push([
      { type: 'verdicts', payload: [{ entryId: 'keev', verdict: 'used_correctly', hebrew: 'כאב', en: 'pain' }] },
      { type: 'done', payload: {} },
    ]);

    render(<MemoryRouter><DrillPage /></MemoryRouter>);
    await userEvent.click(screen.getByText('Start drill'));
    expect(await screen.findByText(/יש לי כאב בחזה/)).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('drill-input'), 'יש לך חום?');
    await userEvent.click(screen.getByTestId('drill-send'));
    expect(await screen.findByTestId('drill-feedback')).toHaveTextContent('Good question form');

    await userEvent.type(screen.getByTestId('drill-input'), 'תודה, סיימנו.');
    await userEvent.click(screen.getByTestId('drill-send'));
    const summary = await screen.findByTestId('drill-summary');
    expect(summary).toBeInTheDocument();
    expect(applyDrillVerdicts).toHaveBeenCalledWith([
      { entryId: 'keev', verdict: 'used_correctly', hebrew: 'כאב', en: 'pain' },
    ]);

    // Real immigrant-clinician users must see the Hebrew word + English gloss, never the
    // internal transliterated slug used as the entryId (regression guard for the bug this
    // fix addresses).
    expect(summary).toHaveTextContent('כאב');
    expect(summary).toHaveTextContent('pain');
    expect(summary).not.toHaveTextContent('keev');
  });
});

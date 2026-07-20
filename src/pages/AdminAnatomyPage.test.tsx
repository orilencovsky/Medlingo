import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '../lib/i18n';
import { AdminAnatomyPage } from './AdminAnatomyPage';

const { setAnatomyMeta, setPrimaryImage } = vi.hoisted(() => ({
  setAnatomyMeta: vi.fn(async (_entryId: string, _region: string, _system: string) => {}),
  setPrimaryImage: vi.fn(async (_imageId: string) => {}),
}));
vi.mock('../data/anatomyAdmin', () => ({
  fetchAnatomyAdmin: vi.fn(async () => [
    {
      entry: { id: 'heart', hebrew: 'לב', hebrewNikud: 'לֵב', partOfSpeech: 'noun', level: 1,
        gender: 'ז', plural: null, root: null, everydaySynonym: null,
        translations: { en: 'heart' }, notes: null, category: null, topic: 'anatomy' },
      region: null, system: null,
      images: [
        { id: 'img1', url: 'https://example.test/heart-curated.png', source: 'curated', isPrimary: false, credit: 'Gray' },
        { id: 'img2', url: 'https://example.test/heart-ai.png', source: 'ai', isPrimary: false, credit: null },
      ],
    },
  ]),
  setAnatomyMeta,
  setPrimaryImage,
}));

describe('AdminAnatomyPage', () => {
  it('shows coverage as 0/1 when the only term has no region/system/primary', async () => {
    render(<AdminAnatomyPage />);
    expect(await screen.findByText(/0.*1/)).toBeInTheDocument();
  });

  it('calls setPrimaryImage when "Set primary" is clicked on a candidate image', async () => {
    render(<AdminAnatomyPage />);
    await screen.findByText('heart');
    const buttons = await screen.findAllByRole('button', { name: /set primary|קבע כתמונה ראשית/i });
    await userEvent.click(buttons[0]);
    expect(setPrimaryImage).toHaveBeenCalledWith('img1');
  });
});

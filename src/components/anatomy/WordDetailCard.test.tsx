import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '../../lib/i18n';
import { WordDetailCard } from './WordDetailCard';

const fetchAnatomyWord = vi.fn();
vi.mock('../../data/anatomy', () => ({ fetchAnatomyWord: (...a: unknown[]) => fetchAnatomyWord(...a) }));

const WORD = (imageUrl: string | null) => ({
  entry: { id: 'heart', hebrew: 'לב', hebrewNikud: 'לֵב', partOfSpeech: 'noun', level: 1, gender: 'ז',
    plural: null, root: null, everydaySynonym: 'המנוע של הגוף', notes: 'שריר', translations: { en: 'heart' },
    category: null, topic: 'anatomy' },
  imageUrl, imageCredit: imageUrl ? 'Gray' : null,
});

describe('WordDetailCard', () => {
  it('shows the word fields and image when a primary image exists', async () => {
    fetchAnatomyWord.mockResolvedValueOnce(WORD('https://cdn.test/heart.png'));
    render(<WordDetailCard entryId="heart" onClose={() => {}} />);
    expect(await screen.findByText('heart')).toBeInTheDocument();
    expect(screen.getByText('לֵב')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn.test/heart.png');
  });

  it('omits the image slot when the word has no primary image', async () => {
    fetchAnatomyWord.mockResolvedValueOnce(WORD(null));
    render(<WordDetailCard entryId="heart" onClose={() => {}} />);
    expect(await screen.findByText('heart')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    fetchAnatomyWord.mockResolvedValueOnce(WORD(null));
    const onClose = vi.fn();
    render(<WordDetailCard entryId="heart" onClose={onClose} />);
    await screen.findByText('heart');
    await userEvent.click(screen.getByRole('button', { name: /close|סגור|إغلاق|закрыть|fermer/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

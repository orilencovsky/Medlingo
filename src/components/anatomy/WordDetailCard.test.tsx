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

const WORD_LUNG = {
  entry: { id: 'lung', hebrew: 'ריאה', hebrewNikud: 'רֵאָה', partOfSpeech: 'noun', level: 1, gender: 'נ',
    plural: null, root: null, everydaySynonym: null, notes: null, translations: { en: 'lung' },
    category: null, topic: 'anatomy' },
  imageUrl: null, imageCredit: null,
};

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

  it('moves focus into the dialog (close button) when it opens', async () => {
    fetchAnatomyWord.mockResolvedValueOnce(WORD(null));
    render(<WordDetailCard entryId="heart" onClose={() => {}} />);
    await screen.findByText('heart');
    expect(screen.getByRole('button', { name: /close|סגור|إغلاق|закрыть|fermer/i })).toHaveFocus();
  });

  it('calls onClose when the close button is clicked', async () => {
    fetchAnatomyWord.mockResolvedValueOnce(WORD(null));
    const onClose = vi.fn();
    render(<WordDetailCard entryId="heart" onClose={onClose} />);
    await screen.findByText('heart');
    await userEvent.click(screen.getByRole('button', { name: /close|סגור|إغلاق|закрыть|fermer/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('stops loading and shows the wordMissing text when the fetch rejects', async () => {
    fetchAnatomyWord.mockRejectedValueOnce(new Error('network down'));
    render(<WordDetailCard entryId="heart" onClose={() => {}} />);
    expect(await screen.findByText("This word isn't available.")).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('does not show the previous word while reloading for a new entryId', async () => {
    fetchAnatomyWord.mockResolvedValueOnce(WORD(null));
    const { rerender } = render(<WordDetailCard entryId="heart" onClose={() => {}} />);
    expect(await screen.findByText('heart')).toBeInTheDocument();

    let resolveLung!: (value: typeof WORD_LUNG) => void;
    fetchAnatomyWord.mockImplementationOnce(() => new Promise((resolve) => { resolveLung = resolve; }));
    rerender(<WordDetailCard entryId="lung" onClose={() => {}} />);

    // Stale title from the previous word must not linger during the reload.
    expect(screen.queryByText('heart')).not.toBeInTheDocument();
    expect(screen.queryByText('לֵב')).not.toBeInTheDocument();

    resolveLung(WORD_LUNG);
    expect(await screen.findByText('lung')).toBeInTheDocument();
    expect(screen.getByText('רֵאָה')).toBeInTheDocument();
  });
});

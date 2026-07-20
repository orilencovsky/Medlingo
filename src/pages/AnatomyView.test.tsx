import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import '../lib/i18n';
import { AnatomyView } from './AnatomyView';

vi.mock('../data/anatomy', () => ({
  fetchAnatomyCards: vi.fn(async () => []),
  fetchSceneLabels: vi.fn(async () => ({})),
  fetchAnatomyWord: vi.fn(async () => null),
}));

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/anatomy" element={<AnatomyView />} /></Routes>
    </MemoryRouter>,
  );
}

describe('AnatomyView', () => {
  it('defaults to the Browse (card-grid) view', async () => {
    renderAt('/anatomy');
    // card-grid renders the region-all chip; explorer does not
    expect(await screen.findByRole('button', { name: /^all$|^הכל$/i })).toBeInTheDocument();
    expect(document.querySelector('[data-node="eye"]')).not.toBeInTheDocument();
  });

  it('renders the explorer when ?view=explore', async () => {
    renderAt('/anatomy?view=explore');
    await waitFor(() => expect(document.querySelector('[data-node="eye"]')).toBeInTheDocument());
  });

  it('switches views when the toggle is clicked', async () => {
    renderAt('/anatomy');
    await screen.findByRole('button', { name: /explore|חקור/i });
    await userEvent.click(screen.getByRole('button', { name: /explore|חקור/i }));
    await waitFor(() => expect(document.querySelector('[data-node="eye"]')).toBeInTheDocument());
  });
});

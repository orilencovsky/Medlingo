import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import { StatsStrip } from './StatsStrip';

function renderStrip(props: Partial<Parameters<typeof StatsStrip>[0]> = {}) {
  return render(
    <MemoryRouter>
      <StatsStrip streak={5} dueCount={12} mastered={23} learned={41} {...props} />
    </MemoryRouter>,
  );
}

describe('StatsStrip', () => {
  it('renders all four tiles with values and labels', () => {
    renderStrip();
    const strip = screen.getByTestId('stats-strip');
    expect(strip).toHaveTextContent('5');
    expect(strip).toHaveTextContent('Day streak');
    expect(strip).toHaveTextContent('12');
    expect(strip).toHaveTextContent('Due today');
    expect(strip).toHaveTextContent('23');
    expect(strip).toHaveTextContent('Mastered');
    expect(strip).toHaveTextContent('41');
    expect(strip).toHaveTextContent('Learned');
  });

  it('due tile links to /review when dueCount > 0', () => {
    renderStrip();
    expect(screen.getByTestId('stat-due')).toHaveAttribute('href', '/review');
  });

  it('due tile is not a link when dueCount is 0', () => {
    renderStrip({ dueCount: 0 });
    expect(screen.getByTestId('stat-due')).not.toHaveAttribute('href');
  });
});

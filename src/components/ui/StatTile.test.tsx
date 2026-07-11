import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Flame } from 'lucide-react';
import { StatTile } from './StatTile';

describe('StatTile', () => {
  it('renders icon, value, and label', () => {
    render(<StatTile icon={<Flame data-testid="icon" />} value={5} label="Day streak" data-testid="tile" />);
    expect(screen.getByTestId('tile')).toHaveTextContent('5');
    expect(screen.getByTestId('tile')).toHaveTextContent('Day streak');
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders as a link when `to` is given', () => {
    render(
      <MemoryRouter>
        <StatTile icon={<Flame />} value={12} label="Due today" to="/review" data-testid="tile" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('tile')).toHaveAttribute('href', '/review');
  });

  it('renders as a div, not a link, without `to`', () => {
    render(<StatTile icon={<Flame />} value={5} label="Streak" data-testid="tile" />);
    expect(screen.getByTestId('tile')).not.toHaveAttribute('href');
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('sets the fill width from value', () => {
    render(<ProgressBar value={57} barTestId="bar" fillTestId="fill" />);
    expect(screen.getByTestId('bar')).toBeInTheDocument();
    expect(screen.getByTestId('fill')).toHaveStyle({ width: '57%' });
  });

  it('clamps values above 100', () => {
    render(<ProgressBar value={140} fillTestId="fill" />);
    expect(screen.getByTestId('fill')).toHaveStyle({ width: '100%' });
  });

  it('clamps negative values to 0', () => {
    render(<ProgressBar value={-10} fillTestId="fill" />);
    expect(screen.getByTestId('fill')).toHaveStyle({ width: '0%' });
  });

  it('uses the success tone color at 100%', () => {
    render(<ProgressBar value={100} tone="success" fillTestId="fill" />);
    expect(screen.getByTestId('fill')).toHaveClass('bg-green-600');
  });
});

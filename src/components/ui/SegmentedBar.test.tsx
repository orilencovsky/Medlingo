import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SegmentedBar } from './SegmentedBar';

describe('SegmentedBar', () => {
  it('renders both segments at their given widths', () => {
    render(<SegmentedBar coveredPct={62} masteredPct={21} />);
    expect(screen.getByTestId('overall-progress-covered')).toHaveStyle({ width: '62%' });
    expect(screen.getByTestId('overall-progress-mastered')).toHaveStyle({ width: '21%' });
  });

  it('clamps mastered to never exceed covered', () => {
    render(<SegmentedBar coveredPct={30} masteredPct={80} />);
    expect(screen.getByTestId('overall-progress-mastered')).toHaveStyle({ width: '30%' });
  });

  it('clamps covered to 100 max', () => {
    render(<SegmentedBar coveredPct={150} masteredPct={10} />);
    expect(screen.getByTestId('overall-progress-covered')).toHaveStyle({ width: '100%' });
  });

  it('renders 0/0 for a brand new user', () => {
    render(<SegmentedBar coveredPct={0} masteredPct={0} />);
    expect(screen.getByTestId('overall-progress-covered')).toHaveStyle({ width: '0%' });
    expect(screen.getByTestId('overall-progress-mastered')).toHaveStyle({ width: '0%' });
  });
});

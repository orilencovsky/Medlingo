import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { He } from './He';

describe('He', () => {
  it('isolates Hebrew with rtl direction and lang', () => {
    const { container } = render(<He>לחץ דם</He>);
    const bdi = container.querySelector('bdi');
    expect(bdi).not.toBeNull();
    expect(bdi).toHaveAttribute('dir', 'rtl');
    expect(bdi).toHaveAttribute('lang', 'he');
    expect(bdi).toHaveTextContent('לחץ דם');
  });
});

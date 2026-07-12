import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionTitle } from './SectionTitle';

describe('SectionTitle', () => {
  it('renders the heading text', () => {
    render(<SectionTitle>My units</SectionTitle>);
    expect(screen.getByRole('heading', { name: 'My units' })).toBeInTheDocument();
  });

  it('renders an optional trailing action', () => {
    render(<SectionTitle action={<span data-testid="action">See all</span>}>My units</SectionTitle>);
    expect(screen.getByTestId('action')).toBeInTheDocument();
  });
});

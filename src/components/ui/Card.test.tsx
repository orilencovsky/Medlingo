import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders children inside a surface container', () => {
    render(<Card data-testid="c">Hello</Card>);
    expect(screen.getByTestId('c')).toHaveTextContent('Hello');
    expect(screen.getByTestId('c')).toHaveClass('bg-surface');
  });

  it('dims when muted', () => {
    render(<Card data-testid="c" muted>Locked</Card>);
    expect(screen.getByTestId('c')).toHaveClass('opacity-70');
  });

  it('adds a hover affordance when interactive', () => {
    render(<Card data-testid="c" interactive>Click me</Card>);
    expect(screen.getByTestId('c')).toHaveClass('hover:shadow-raised');
  });

  it('merges a caller-supplied className with the base classes', () => {
    render(<Card data-testid="c" className="flex items-center gap-3">Hi</Card>);
    const el = screen.getByTestId('c');
    expect(el).toHaveClass('flex', 'items-center', 'gap-3');
    expect(el).toHaveClass('bg-surface', 'rounded-lg');
  });

  it('forwards arbitrary native div attributes via ...rest', () => {
    render(<Card data-testid="c" aria-label="Unit progress">Hi</Card>);
    expect(screen.getByTestId('c')).toHaveAttribute('aria-label', 'Unit progress');
  });
});

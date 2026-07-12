import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Button, LinkButton } from './Button';

describe('Button', () => {
  it('renders children and calls onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByText('Save'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('applies the primary variant class by default', () => {
    render(<Button>Save</Button>);
    expect(screen.getByText('Save')).toHaveClass('bg-primary');
  });

  it('applies the secondary variant class', () => {
    render(<Button variant="secondary">Cancel</Button>);
    expect(screen.getByText('Cancel')).toHaveClass('border-primary');
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} disabled>Save</Button>);
    await userEvent.click(screen.getByText('Save'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('LinkButton', () => {
  it('renders as a router link with the primary styling', () => {
    render(<MemoryRouter><LinkButton to="/review">Start</LinkButton></MemoryRouter>);
    const link = screen.getByText('Start');
    expect(link).toHaveAttribute('href', '/review');
    expect(link).toHaveClass('bg-primary');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../../lib/i18n';

const signOut = vi.fn().mockResolvedValue({ error: null });
vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { signOut: (...a: unknown[]) => signOut(...a) } },
}));

import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  beforeEach(() => {
    signOut.mockClear();
  });

  it('renders the title and the language picker', () => {
    render(<MemoryRouter><PageHeader title="MedLingo" /></MemoryRouter>);
    expect(screen.getByText('MedLingo')).toBeInTheDocument();
    expect(screen.getByTestId('language-picker')).toBeInTheDocument();
  });

  it('renders an avatar with initials when a display name is given', () => {
    render(<MemoryRouter><PageHeader title="MedLingo" displayName="Dr. Cohen" /></MemoryRouter>);
    expect(screen.getByTestId('page-header-avatar')).toHaveTextContent('D');
  });

  it('omits the avatar without a display name', () => {
    render(<MemoryRouter><PageHeader title="MedLingo" /></MemoryRouter>);
    expect(screen.queryByTestId('page-header-avatar')).not.toBeInTheDocument();
  });

  it('opens a menu on avatar click and signs out', async () => {
    render(<MemoryRouter><PageHeader title="MedLingo" displayName="Dr. Cohen" /></MemoryRouter>);
    expect(screen.queryByTestId('page-header-signout')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('page-header-avatar'));
    await userEvent.click(screen.getByTestId('page-header-signout'));
    expect(signOut).toHaveBeenCalled();
  });
});

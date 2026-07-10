import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../lib/i18n';

const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithOtp: (...a: unknown[]) => signInWithOtp(...a) } },
}));

import { AuthPage } from './AuthPage';

describe('AuthPage', () => {
  beforeEach(() => signInWithOtp.mockClear());

  it('sends a magic link and shows the check-email state', async () => {
    render(<AuthPage />);
    await userEvent.type(screen.getByTestId('auth-email'), 'doc@example.com');
    await userEvent.click(screen.getByTestId('auth-submit'));
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'doc@example.com',
      options: { emailRedirectTo: window.location.origin },
    });
    expect(await screen.findByText('Check your email for a sign-in link.')).toBeInTheDocument();
  });
});

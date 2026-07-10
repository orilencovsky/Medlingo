import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';

const completeOnboarding = vi.fn().mockResolvedValue({ displayName: 'Dr. Test' });
vi.mock('../data/profile', () => ({
  completeOnboarding: (...a: unknown[]) => completeOnboarding(...a),
}));

import { OnboardingPage } from './OnboardingPage';

describe('OnboardingPage', () => {
  it('shows consent and saves the display name', async () => {
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>);
    expect(screen.getByText(/stores your email, display name, and learning history/)).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('onboarding-name'), 'Dr. Test');
    await userEvent.click(screen.getByTestId('onboarding-submit'));
    expect(completeOnboarding).toHaveBeenCalledWith('Dr. Test');
  });
});

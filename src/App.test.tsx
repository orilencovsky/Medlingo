import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import './lib/i18n';

vi.mock('./lib/supabase', () => ({ supabase: {} }));
vi.mock('./components/SessionProvider', () => ({ useSession: () => ({ session: null, loading: false }) }));
vi.mock('./data/profile', () => ({ getProfile: () => Promise.resolve(null) }));

import App from './App';

describe('App', () => {
  it('routes signed-out users to the auth page', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(await screen.findByText('Sign in to MedLingo')).toBeInTheDocument();
  });
});

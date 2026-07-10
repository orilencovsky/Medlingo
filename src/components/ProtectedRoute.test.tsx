import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import '../lib/i18n';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

const state: { session: unknown; loading: boolean } = { session: null, loading: false };
vi.mock('./SessionProvider', () => ({ useSession: () => state }));

const profile: { value: unknown } = { value: null };
vi.mock('../data/profile', () => ({ getProfile: () => Promise.resolve(profile.value) }));

import { ProtectedRoute } from './ProtectedRoute';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth" element={<div>AUTH</div>} />
        <Route path="/onboarding" element={<div>ONBOARD</div>} />
        <Route path="/" element={<ProtectedRoute><div>HOME</div></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('redirects to /auth when signed out', async () => {
    state.session = null;
    renderAt('/');
    expect(await screen.findByText('AUTH')).toBeInTheDocument();
  });
  it('redirects to /onboarding when signed in without profile', async () => {
    state.session = { user: { id: 'u1' } };
    profile.value = null;
    renderAt('/');
    expect(await screen.findByText('ONBOARD')).toBeInTheDocument();
  });
  it('renders children when signed in with profile', async () => {
    state.session = { user: { id: 'u1' } };
    profile.value = { displayName: 'x' };
    renderAt('/');
    expect(await screen.findByText('HOME')).toBeInTheDocument();
  });
});

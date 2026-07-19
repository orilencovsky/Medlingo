import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import '../lib/i18n';

const profile: { value: unknown } = { value: null };
vi.mock('../data/profile', () => ({ getProfile: () => Promise.resolve(profile.value) }));

import { AdminRoute } from './AdminRoute';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>HOME</div>} />
        <Route path="/admin/dictionary" element={<AdminRoute><div>ADMIN</div></AdminRoute>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminRoute', () => {
  it('renders children when the profile is an admin', async () => {
    profile.value = { isAdmin: true };
    renderAt('/admin/dictionary');
    expect(await screen.findByText('ADMIN')).toBeInTheDocument();
  });
  it('redirects away from /admin/dictionary when the profile is not an admin', async () => {
    profile.value = { isAdmin: false };
    renderAt('/admin/dictionary');
    expect(await screen.findByText('HOME')).toBeInTheDocument();
  });
});

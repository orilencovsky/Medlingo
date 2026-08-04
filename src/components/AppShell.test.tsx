import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import '../lib/i18n';

const profile: { value: unknown } = { value: { isAdmin: false } };
vi.mock('../data/profile', () => ({ getProfile: () => Promise.resolve(profile.value) }));

import { AppShell } from './AppShell';

function renderShell(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>HOME PAGE</div>} />
          <Route path="/dictionary" element={<div>DICTIONARY PAGE</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell', () => {
  it('renders the same nav links in the desktop sidebar and the mobile menu', async () => {
    renderShell();
    const sidebar = screen.getByRole('link', { name: /home/i, hidden: true });
    expect(sidebar.closest('aside')).toBeInTheDocument();

    expect(screen.queryByTestId('mobile-nav-menu')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('mobile-nav-toggle'));
    const mobileMenu = screen.getByTestId('mobile-nav-menu');
    expect(mobileMenu).toBeInTheDocument();
    expect(within(mobileMenu).getByText('Dictionary')).toBeInTheDocument();
  });

  it('closes the mobile menu after navigating to another page', async () => {
    renderShell();
    await userEvent.click(screen.getByTestId('mobile-nav-toggle'));
    const mobileMenu = screen.getByTestId('mobile-nav-menu');
    await userEvent.click(within(mobileMenu).getByText('Dictionary'));
    expect(await screen.findByText('DICTIONARY PAGE')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-nav-menu')).not.toBeInTheDocument();
  });

  it('hides admin links from the mobile menu for non-admin users', async () => {
    profile.value = { isAdmin: false };
    renderShell();
    await userEvent.click(screen.getByTestId('mobile-nav-toggle'));
    expect(screen.queryByText('Anatomy admin')).not.toBeInTheDocument();
  });

  it('shows admin links in the mobile menu for admin users', async () => {
    profile.value = { isAdmin: true };
    renderShell();
    await screen.findByText('Anatomy admin');
    await userEvent.click(screen.getByTestId('mobile-nav-toggle'));
    expect(screen.getAllByText('Anatomy admin').length).toBeGreaterThan(1);
  });
});

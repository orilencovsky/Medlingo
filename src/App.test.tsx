import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from './App';
import './lib/i18n';

describe('App', () => {
  it('renders the MedLingo heading', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'MedLingo' })).toBeInTheDocument();
  });
});

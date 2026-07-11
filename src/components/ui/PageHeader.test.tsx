import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '../../lib/i18n';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
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
});

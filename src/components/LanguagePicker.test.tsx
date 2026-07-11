import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import i18n, { applyLanguage } from '../lib/i18n';

const { setUiLanguage } = vi.hoisted(() => ({ setUiLanguage: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../data/profile', () => ({ setUiLanguage }));

import { LanguagePicker } from './LanguagePicker';

describe('LanguagePicker', () => {
  afterEach(async () => {
    await applyLanguage('en');
  });

  it('renders four options labeled in their own language', () => {
    render(<LanguagePicker />);
    const picker = screen.getByTestId('language-picker');
    const options = Array.from(picker.querySelectorAll('option')).map((o) => [o.value, o.textContent]);
    expect(options).toEqual([
      ['en', 'English'],
      ['ar', 'العربية'],
      ['ru', 'Русский'],
      ['fr', 'Français'],
    ]);
  });

  it('fires a change, applies, and persists the selected language', async () => {
    const onChange = vi.fn();
    render(<LanguagePicker onChange={onChange} />);
    const picker = screen.getByTestId('language-picker');
    fireEvent.change(picker, { target: { value: 'ar' } });
    expect(onChange).toHaveBeenCalledWith('ar');
    await vi.waitFor(() => {
      expect(i18n.language).toBe('ar');
      expect(setUiLanguage).toHaveBeenCalledWith('ar');
    });
    expect(document.documentElement.dir).toBe('rtl');
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import i18n, { applyLanguage } from './i18n';

describe('i18n', () => {
  it('resolves app.title', () => {
    expect(i18n.t('app.title')).toBe('MedLingo');
  });
});

describe('applyLanguage', () => {
  afterEach(async () => {
    await applyLanguage('en');
  });

  it('sets dir to rtl and lang to ar for Arabic', async () => {
    await applyLanguage('ar');
    expect(i18n.language).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('resets dir to ltr for English', async () => {
    await applyLanguage('ar');
    await applyLanguage('en');
    expect(i18n.language).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
  });

  it('keeps dir ltr for other non-rtl languages', async () => {
    await applyLanguage('ru');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('ru');
  });
});

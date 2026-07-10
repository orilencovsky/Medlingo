import { describe, it, expect } from 'vitest';
import i18n from './i18n';

describe('i18n', () => {
  it('resolves app.title', () => {
    expect(i18n.t('app.title')).toBe('MedLingo');
  });
});

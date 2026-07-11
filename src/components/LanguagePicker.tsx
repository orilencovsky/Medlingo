import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { applyLanguage } from '../lib/i18n';
import { setUiLanguage } from '../data/profile';

const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
  { code: 'ru', label: 'Русский' },
  { code: 'fr', label: 'Français' },
];

interface LanguagePickerProps {
  onChange?: (lang: string) => void;
}

export function LanguagePicker({ onChange }: LanguagePickerProps = {}) {
  const { i18n } = useTranslation();

  const handleChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value;
    onChange?.(lang);
    await applyLanguage(lang);
    await setUiLanguage(lang);
  };

  return (
    <select
      data-testid="language-picker"
      aria-label="Language"
      value={i18n.language}
      onChange={handleChange}
    >
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}

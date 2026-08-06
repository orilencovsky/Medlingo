import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';

const RTL_LANGUAGES = new Set(['ar', 'he']);

// Only English (the fallback) ships in the initial bundle; the other locales
// load on demand so they stay off the critical path.
const LOCALE_LOADERS: Record<string, () => Promise<{ default: object }>> = {
  ar: () => import('../locales/ar.json'),
  ru: () => import('../locales/ru.json'),
  fr: () => import('../locales/fr.json'),
  he: () => import('../locales/he.json'),
};

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export async function applyLanguage(lang: string): Promise<void> {
  const load = LOCALE_LOADERS[lang];
  if (load && !i18n.hasResourceBundle(lang, 'translation')) {
    const { default: bundle } = await load();
    i18n.addResourceBundle(lang, 'translation', bundle);
  }
  await i18n.changeLanguage(lang);
  document.documentElement.dir = RTL_LANGUAGES.has(lang) ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}

export default i18n;

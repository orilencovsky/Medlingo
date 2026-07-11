import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import ar from '../locales/ar.json';
import ru from '../locales/ru.json';
import fr from '../locales/fr.json';

const RTL_LANGUAGES = new Set(['ar']);

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
    ru: { translation: ru },
    fr: { translation: fr },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export async function applyLanguage(lang: string): Promise<void> {
  await i18n.changeLanguage(lang);
  document.documentElement.dir = RTL_LANGUAGES.has(lang) ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}

export default i18n;

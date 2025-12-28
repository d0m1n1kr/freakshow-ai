import { createI18n } from 'vue-i18n';
import de from './locales/de.json';
import en from './locales/en.json';
import fr from './locales/fr.json';

export type MessageSchema = typeof de;

const i18n = createI18n<[MessageSchema], 'de' | 'en' | 'fr'>({
  legacy: false,
  locale: localStorage.getItem('locale') || 'de',
  fallbackLocale: 'en',
  messages: {
    de,
    en,
    fr
  }
});

export default i18n;


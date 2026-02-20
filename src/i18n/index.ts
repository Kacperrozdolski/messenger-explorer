import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import pl from "./locales/pl.json";
import es from "./locales/es.json";
import de from "./locales/de.json";
import it from "./locales/it.json";
import zh from "./locales/zh.json";
import ja from "./locales/ja.json";
import pt from "./locales/pt.json";

export const LANGUAGES = [
  { code: "pl", label: "Polski", flag: "PL" },
  { code: "en", label: "English", flag: "GB" },
  { code: "es", label: "Español", flag: "ES" },
  { code: "de", label: "Deutsch", flag: "DE" },
  { code: "it", label: "Italiano", flag: "IT" },
  { code: "zh", label: "中文", flag: "CN" },
  { code: "ja", label: "日本語", flag: "JP" },
  { code: "pt", label: "Português", flag: "BR" },
] as const;

const savedLang = localStorage.getItem("app-language") || "pl";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    pl: { translation: pl },
    es: { translation: es },
    de: { translation: de },
    it: { translation: it },
    zh: { translation: zh },
    ja: { translation: ja },
    pt: { translation: pt },
  },
  lng: savedLang,
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;

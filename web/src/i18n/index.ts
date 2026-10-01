import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import enUS from "./locales/en-US.json";
import zhCN from "./locales/zh-CN.json";

export const LANGUAGE_STORAGE_KEY = "cpa-usage-stats.language";
export type Language = "zh-CN" | "en-US";

// 默认中文；只有用户在界面上显式切换过才用 en-US（选择存在 localStorage）
void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      "zh-CN": { translation: zhCN },
      "en-US": { translation: enUS },
    },
    fallbackLng: "zh-CN",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage"],
      caches: ["localStorage"],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
    },
    react: { useSuspense: false },
  });

if (typeof document !== "undefined") {
  document.documentElement.lang = i18n.resolvedLanguage === "en-US" ? "en-US" : "zh-CN";
}

export default i18n;

import type { ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n, { LANGUAGE_STORAGE_KEY, type Language } from "./index";

export type { Language };
export { i18n, LANGUAGE_STORAGE_KEY };

export function I18nProvider({ children }: { children: ReactNode }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

export function useI18n() {
  const { t, i18n: instance } = useTranslation();
  const language: Language = instance.resolvedLanguage === "en-US" ? "en-US" : "zh-CN";

  const setLanguage = (next: Language) => {
    void instance.changeLanguage(next);
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
    }
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // 隐私模式下无法持久化，忽略
    }
  };

  return { t, language, setLanguage };
}

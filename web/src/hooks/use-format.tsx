import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { useI18n } from "@/i18n/context";
import {
  createFormatters,
  type FormatPreferences,
  type Formatters,
  loadFormatPreferences,
  saveFormatPreferences,
} from "@/lib/format";

type FormatContextValue = Formatters & {
  preferences: FormatPreferences;
  update: (patch: Partial<FormatPreferences>) => void;
};

const FormatContext = createContext<FormatContextValue | null>(null);

/**
 * 展示偏好（数字单位、币种、汇率）的全局来源。
 * 与语言联动：单位「跟随语言」时格式化会跟着 i18n 切换。
 */
export function FormatProvider({ children }: { children: ReactNode }) {
  const { language } = useI18n();
  const [preferences, setPreferences] = useState<FormatPreferences>(loadFormatPreferences);
  const formatters = useMemo(() => createFormatters(preferences, language), [preferences, language]);

  const update = useCallback((patch: Partial<FormatPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      saveFormatPreferences(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ ...formatters, preferences, update }), [formatters, preferences, update]);

  return <FormatContext.Provider value={value}>{children}</FormatContext.Provider>;
}

export function useFormat(): FormatContextValue {
  const context = useContext(FormatContext);
  if (!context) throw new Error("useFormat must be used within FormatProvider");
  return context;
}

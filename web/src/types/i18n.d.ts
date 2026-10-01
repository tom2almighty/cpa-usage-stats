import "i18next";
import type zhCN from "@/i18n/locales/zh-CN.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof zhCN };
  }
}

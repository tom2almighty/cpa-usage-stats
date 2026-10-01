/**
 * 数字与货币的展示偏好。和语言、主题一样属于纯前端设置，存 localStorage，
 * 不改动任何存储的数据 —— 价格在库里始终是「美元 / 100 万词元」。
 */

/** localized: 单位跟随界面语言（中文走 万/亿）；en-compact: 一律用 K/M */
export type NumberStyle = "localized" | "en-compact";
export type Currency = "USD" | "CNY";

export type FormatPreferences = {
  numberStyle: NumberStyle;
  currency: Currency;
  /** 1 USD 折合多少 CNY，仅在 currency 为 CNY 时参与换算 */
  exchangeRate: number;
};

export const FORMAT_STORAGE_KEY = "cpa-usage-stats.format";

export const DEFAULT_FORMAT_PREFERENCES: FormatPreferences = {
  numberStyle: "localized",
  currency: "USD",
  exchangeRate: 7.2,
};

function isNumberStyle(value: unknown): value is NumberStyle {
  return value === "localized" || value === "en-compact";
}

export function loadFormatPreferences(): FormatPreferences {
  if (typeof localStorage === "undefined") return DEFAULT_FORMAT_PREFERENCES;
  try {
    const raw = localStorage.getItem(FORMAT_STORAGE_KEY);
    if (!raw) return DEFAULT_FORMAT_PREFERENCES;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return DEFAULT_FORMAT_PREFERENCES;
    const record = parsed as Record<string, unknown>;
    const rate = Number(record.exchangeRate);
    return {
      numberStyle: isNumberStyle(record.numberStyle) ? record.numberStyle : DEFAULT_FORMAT_PREFERENCES.numberStyle,
      currency: record.currency === "CNY" ? "CNY" : "USD",
      // 汇率缺失或非法时回落到默认值，避免把 0/NaN 带进换算
      exchangeRate: Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_FORMAT_PREFERENCES.exchangeRate,
    };
  } catch {
    return DEFAULT_FORMAT_PREFERENCES;
  }
}

export function saveFormatPreferences(preferences: FormatPreferences): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(FORMAT_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // 隐私模式下无法持久化，忽略
  }
}

/** 偏好无关的调用方只依赖这几个函数签名 */
export interface Formatters {
  /** 精确整数，带语言对应的千分位 */
  formatNumber: (value: number) => string;
  /** 紧凑计数，用于词元量与坐标轴 */
  formatTokens: (value: number) => string;
  /** 金额，保留亚分级估算的精度 */
  formatCost: (usd: number) => string;
  /** 每 100 万词元的单价 */
  formatUnitPrice: (usdPerMillion: number) => string;
}

/**
 * 按偏好构造格式化函数。Intl 实例在这里建一次、由调用方 memo，
 * 避免在表格里逐行 new Intl.NumberFormat。
 */
export function createFormatters(preferences: FormatPreferences, language: "zh-CN" | "en-US"): Formatters {
  const { numberStyle, currency, exchangeRate } = preferences;
  const locale = language === "en-US" ? "en-US" : "zh-CN";
  // 「跟随语言」用界面语言拿单位，「英文单位」固定 en 拿 K/M
  const compact = new Intl.NumberFormat(numberStyle === "en-compact" ? "en-US" : locale, {
    notation: "compact",
    maximumFractionDigits: 2,
  });
  const plain = new Intl.NumberFormat(locale);
  const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const rate = currency === "CNY" ? exchangeRate : 1;
  const symbol = currency === "CNY" ? "¥" : "$";

  /** 精确整数，带语言对应的千分位 */
  const formatNumber = (value: number) => (Number.isFinite(value) ? plain.format(value) : "0");

  /** 紧凑计数，用于词元量与坐标轴 */
  const formatTokens = (value: number) => (Number.isFinite(value) && value !== 0 ? compact.format(value) : "0");

  /**
   * 金额。刻意不用 Intl 的 style:"currency" —— 它强制两位小数，
   * 会把亚分级估算（$0.0034）抹成 0。
   */
  const formatCost = (usd: number) => {
    if (!Number.isFinite(usd)) return "-";
    const value = usd * rate;
    if (value === 0) return `${symbol}0`;
    const abs = Math.abs(value);
    if (abs < 0.01) return `${symbol}${value.toFixed(4)}`;
    if (abs < 1) return `${symbol}${value.toFixed(3)}`;
    if (abs < 1000) return `${symbol}${value.toFixed(2)}`;
    return `${symbol}${whole.format(value)}`;
  };

  /** 每 100 万词元的单价，如 "$3" / "¥21.6" */
  const formatUnitPrice = (usdPerMillion: number) => {
    if (!Number.isFinite(usdPerMillion)) return "-";
    const value = usdPerMillion * rate;
    if (value === 0) return `${symbol}0`;
    if (value < 1) return `${symbol}${value.toFixed(2).replace(/0$/, "")}`;
    return `${symbol}${Number.isInteger(value) ? value : value.toFixed(2)}`;
  };

  return { formatNumber, formatTokens, formatCost, formatUnitPrice };
}

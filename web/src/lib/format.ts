/**
 * 数字、货币与时间的展示偏好。设置只存在浏览器，不改动记录数据。
 * 时间范围与聚合仍按 CPA 容器时区计算，时区设置只影响标签和明细时间。
 */

/** localized: 单位跟随界面语言（中文走 万/亿）；en-compact: 一律用 K/M */
export type NumberStyle = "localized" | "en-compact";
export type Currency = "USD" | "CNY";

export type FormatPreferences = {
  numberStyle: NumberStyle;
  currency: Currency;
  /** 1 USD 折合多少 CNY，仅在 currency 为 CNY 时参与换算 */
  exchangeRate: number;
  /** IANA 时区名；空串表示跟随浏览器 */
  timeZone: string;
};

export const FORMAT_STORAGE_KEY = "cpa-usage-stats.format";

export const DEFAULT_FORMAT_PREFERENCES: FormatPreferences = {
  numberStyle: "localized",
  currency: "USD",
  exchangeRate: 7.2,
  timeZone: "",
};

function isNumberStyle(value: unknown): value is NumberStyle {
  return value === "localized" || value === "en-compact";
}

export function isValidTimeZone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

/** 只解析带 Z/offset 的绝对时间，绝不把无时区字符串猜成 UTC。 */
export function parseTimestamp(value: string): Date | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(" ", "T");
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
    const timeZone = typeof record.timeZone === "string" ? record.timeZone.trim() : "";
    return {
      numberStyle: isNumberStyle(record.numberStyle) ? record.numberStyle : DEFAULT_FORMAT_PREFERENCES.numberStyle,
      currency: record.currency === "CNY" ? "CNY" : "USD",
      // 汇率缺失或非法时回落到默认值，避免把 0/NaN 带进换算
      exchangeRate: Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_FORMAT_PREFERENCES.exchangeRate,
      timeZone: isValidTimeZone(timeZone) ? timeZone : "",
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
  /** 记录列表时间，MM-DD HH:mm:ss */
  formatDateTime: (value: string) => string;
  /** 完整日期时间，YYYY-MM-DD HH:mm:ss */
  formatDateTimeFull: (value: string | undefined) => string;
  /** 小时/天走势桶标签 */
  formatBucket: (bucket: string, hourly: boolean) => string;
  /** 按展示时区返回 YYYY-MM-DD，供热力图分桶 */
  formatDateKey: (date: Date) => string;
}

/**
 * 按偏好构造格式化函数。Intl 实例在这里建一次、由调用方 memo，
 * 避免在表格里逐行 new Intl.NumberFormat。
 */
export function createFormatters(preferences: FormatPreferences, language: "zh-CN" | "en-US"): Formatters {
  const { numberStyle, currency, exchangeRate, timeZone } = preferences;
  const locale = language === "en-US" ? "en-US" : "zh-CN";
  // 「跟随语言」用界面语言拿单位，「英文单位」固定 en 拿 K/M
  const compact = new Intl.NumberFormat(numberStyle === "en-compact" ? "en-US" : locale, {
    notation: "compact",
    maximumFractionDigits: 2,
  });
  const plain = new Intl.NumberFormat(locale);
  const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const dateTime = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || undefined,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
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

  const dateParts = (date: Date) => {
    const parts = Object.fromEntries(dateTime.formatToParts(date).map(({ type, value }) => [type, value])) as Partial<
      Record<Intl.DateTimeFormatPartTypes, string>
    >;
    return {
      year: parts.year ?? "",
      month: parts.month ?? "",
      day: parts.day ?? "",
      hour: parts.hour ?? "",
      minute: parts.minute ?? "",
      second: parts.second ?? "",
    };
  };

  const formatDateTime = (value: string) => {
    const date = parseTimestamp(value);
    if (!date) return "-";
    const parts = dateParts(date);
    return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  };

  const formatDateTimeFull = (value: string | undefined) => {
    const date = parseTimestamp(value ?? "");
    if (!date) return "-";
    const parts = dateParts(date);
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  };

  const formatBucket = (bucket: string, hourly: boolean) => {
    const date = parseTimestamp(bucket);
    if (!date) return "-";
    const parts = dateParts(date);
    return hourly ? `${parts.hour}:00` : `${parts.month}-${parts.day}`;
  };

  const formatDateKey = (date: Date) => {
    const parts = dateParts(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
  };

  return {
    formatNumber,
    formatTokens,
    formatCost,
    formatUnitPrice,
    formatDateTime,
    formatDateTimeFull,
    formatBucket,
    formatDateKey,
  };
}

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  if (num === null || num === undefined) return '0';
  return new Intl.NumberFormat('zh-CN').format(num);
}

export function formatTokens(tokens: number): string {
  if (!tokens) return '0';
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return formatNumber(tokens);
}

export function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '0ms';
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${Math.round(ms)}ms`;
}

export function formatPercent(pct: number): string {
  if (!Number.isFinite(pct)) return '-';
  return `${pct.toFixed(1)}%`;
}

/** "2026-09-28 15:04:05.000" (stored) → "09-28 15:04:05". */
export function formatDateTime(stored: string): string {
  if (!stored) return '-';
  return stored.replace('T', ' ').slice(5, 19);
}

/** Hourly bucket "2006-01-02 15" → "15:00"; daily bucket → "01-02". */
export function formatBucket(bucket: string, hourly: boolean): string {
  if (hourly) return `${bucket.slice(11, 13)}:00`;
  return bucket.slice(5, 10);
}


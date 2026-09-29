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

/** USD amount, keeping enough decimals for sub-cent estimates. */
export function formatCost(usd: number): string {
  if (!Number.isFinite(usd)) return '-';
  if (usd === 0) return '$0';
  const abs = Math.abs(usd);
  if (abs < 0.01) return `$${usd.toFixed(4)}`;
  if (abs < 1) return `$${usd.toFixed(3)}`;
  if (abs < 1000) return `$${usd.toFixed(2)}`;
  return `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(usd)}`;
}

/** Unit price per 1M tokens, e.g. "$3" / "$0.30". */
export function formatUnitPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '$0';
  if (value < 1) return `$${value.toFixed(2).replace(/0$/, '')}`;
  return `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
}
/** Masks API key showing beginning prefix and last 4 characters. */
export function maskApiKey(key: string): string {
  if (!key || key.trim() === '' || key === '-') return '-';
  const trimmed = key.trim();
  if (trimmed.length <= 8) {
    if (trimmed.length <= 4) return '••••';
    return `${trimmed.slice(0, 2)}••••${trimmed.slice(-2)}`;
  }
  if (trimmed.startsWith('sk-proj-') && trimmed.length > 16) {
    return `sk-proj-••••${trimmed.slice(-4)}`;
  }
  if (trimmed.startsWith('sk-ant-') && trimmed.length > 15) {
    return `sk-ant-••••${trimmed.slice(-4)}`;
  }
  if (trimmed.length > 14) {
    return `${trimmed.slice(0, 6)}••••${trimmed.slice(-4)}`;
  }
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-3)}`;
}

/** Asynchronously copies text to system clipboard. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback or permission denied
  }
  return false;
}

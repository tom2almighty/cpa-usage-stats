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

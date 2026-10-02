import { cn } from "cn";

export { cn };

// 与展示偏好相关的 formatNumber / formatTokens / formatCost / formatUnitPrice 在 @/lib/format，
// 由 useFormat() 按用户的数字单位与币种设置构造，见 hooks/use-format.tsx。

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0ms";
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

export function formatPercent(pct: number): string {
  if (!Number.isFinite(pct)) return "-";
  return `${pct.toFixed(1)}%`;
}

/** "2026-09-28 15:04:05.000" → "09-28 15:04:05" */
export function formatDateTime(stored: string): string {
  if (!stored) return "-";
  return stored.replace("T", " ").slice(5, 19);
}

/** 小时桶 "2026-09-28 15" → "15:00"；天桶 → "09-28" */
export function formatBucket(bucket: string, hourly: boolean): string {
  if (!bucket) return "-";
  return hourly ? `${bucket.slice(11, 13)}:00` : bucket.slice(5, 10);
}

/** 脱敏 API Key：保留可辨识前缀与末 4 位 */
export function maskApiKey(key: string): string {
  const trimmed = (key ?? "").trim();
  if (!trimmed || trimmed === "-") return "-";
  if (trimmed.length <= 4) return "••••";
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}••••${trimmed.slice(-2)}`;
  if (trimmed.startsWith("sk-proj-") && trimmed.length > 16) return `sk-proj-••••${trimmed.slice(-4)}`;
  if (trimmed.startsWith("sk-ant-") && trimmed.length > 15) return `sk-ant-••••${trimmed.slice(-4)}`;
  if (trimmed.length > 14) return `${trimmed.slice(0, 6)}••••${trimmed.slice(-4)}`;
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-3)}`;
}

/** 上游凭据展示名：去掉 CPA 凭据文件名的 .json 后缀，账号部分才是辨识信息 */
export function displayAuthName(name: string): string {
  return name.replace(/\.json$/i, "");
}

/**
 * 复制到系统剪贴板。看板运行在管理中心的 iframe 里，某些环境下
 * Clipboard API 不可用，这里退回 textarea + execCommand。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 权限被拒或非安全上下文，继续走兜底方案
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

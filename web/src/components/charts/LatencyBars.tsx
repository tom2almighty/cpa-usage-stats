import { cn, formatDuration } from "@/lib/utils";

interface LatencyBarsProps {
  p50: number;
  p95: number;
  p99: number;
  className?: string;
}

/** 越靠尾部越弱：同色递减透明度，避免为分位数再引一套调色板 */
const ROWS = [
  { key: "p50", label: "P50", barClassName: "" },
  { key: "p95", label: "P95", barClassName: "opacity-70" },
  { key: "p99", label: "P99", barClassName: "opacity-50" },
] as const;

/**
 * 延迟分位条形图：按 p99 归一化，便于一眼看出尾延迟相对中位数的差距。
 * 标题由父组件给，这里只负责紧凑的三行图形。
 */
export function LatencyBars({ p50, p95, p99, className }: LatencyBarsProps) {
  const values = { p50, p95, p99 } as const;
  const max = p99 > 0 ? p99 : 0;

  return (
    <div className={cn("space-y-1.5", className)}>
      {ROWS.map((row) => {
        const value = values[row.key];
        const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
        return (
          <div key={row.key} className="flex items-center gap-2">
            <span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">{row.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full bg-chart-1", row.barClassName)}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
              {formatDuration(value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

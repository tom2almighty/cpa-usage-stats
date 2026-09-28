import { useMemo, useState } from 'react';
import { cn, formatNumber, formatTokens } from '@/lib/utils';
import type { GroupStat } from '@/types';

interface DonutChartProps {
  stats: GroupStat[];
  /** Field used as slice size. */
  metric: 'total_tokens' | 'requests';
  className?: string;
}

const PALETTE = [
  'hsl(221 83% 53%)',
  'hsl(160 84% 39%)',
  'hsl(38 92% 50%)',
  'hsl(280 65% 60%)',
  'hsl(0 72% 51%)',
  'hsl(199 89% 48%)',
  'hsl(330 70% 55%)',
  'hsl(88 60% 45%)',
];

/** SVG donut for provider / API-key distribution with hover highlighting. */
export function DonutChart({ stats, metric, className }: DonutChartProps) {
  const [active, setActive] = useState<number | null>(null);

  const slices = useMemo(() => {
    const usable = stats.filter((s) => s[metric] > 0);
    const total = usable.reduce((sum, s) => sum + s[metric], 0);
    if (total <= 0) return [];
    let acc = 0;
    return usable.slice(0, PALETTE.length).map((s, i) => {
      const frac = s[metric] / total;
      const start = acc;
      acc += frac;
      return { stat: s, frac, start, color: PALETTE[i % PALETTE.length] };
    });
  }, [stats, metric]);

  if (slices.length === 0) {
    return (
      <div
        className={cn(
          'flex h-40 items-center justify-center text-xs text-muted-foreground',
          className,
        )}
      >
        暂无数据
      </div>
    );
  }

  const size = 150;
  const r = 58;
  const stroke = 20;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;

  const hover = active !== null ? slices[active] : null;

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="relative shrink-0">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="分布环形图"
        >
          <circle cx={c} cy={c} r={r} fill="none" className="stroke-muted" strokeWidth={stroke} />
          {slices.map((slice, i) => {
            const dash = slice.frac * circumference;
            const offset = -slice.start * circumference;
            return (
              <circle
                key={slice.stat.name || i}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={slice.color}
                strokeWidth={active === i ? stroke + 4 : stroke}
                strokeDasharray={`${Math.max(0, dash - 1.5)} ${circumference - dash + 1.5}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${c} ${c})`}
                opacity={active === null || active === i ? 1 : 0.35}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                className="cursor-pointer transition-opacity"
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {hover ? (
            <>
              <div className="max-w-20 truncate text-xs font-semibold">
                {hover.stat.name || '-'}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {(hover.frac * 100).toFixed(1)}% ·{' '}
                {metric === 'total_tokens'
                  ? formatTokens(hover.stat.total_tokens)
                  : formatNumber(hover.stat.requests)}
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] text-muted-foreground">共 {slices.length} 项</div>
            </>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        {slices.map((slice, i) => (
          <button
            type="button"
            key={slice.stat.name || i}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className={cn(
              'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted/50',
              active === i && 'bg-muted/60',
            )}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: slice.color }} />
            <span className="min-w-0 flex-1 truncate">{slice.stat.name || '-'}</span>
            <span className="shrink-0 font-mono text-muted-foreground">
              {metric === 'total_tokens'
                ? formatTokens(slice.stat.total_tokens)
                : formatNumber(slice.stat.requests)}
            </span>
            <span className="w-10 shrink-0 text-right font-mono text-muted-foreground">
              {(slice.frac * 100).toFixed(0)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

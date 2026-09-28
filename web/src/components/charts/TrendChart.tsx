import { useId, useMemo, useState } from 'react';
import { cn, formatBucket, formatNumber, formatTokens } from '@/lib/utils';
import type { TrendPoint } from '@/types';

interface TrendChartProps {
  points: TrendPoint[];
  /** True when buckets are hours ("2006-01-02 15"). */
  hourly: boolean;
  className?: string;
}

interface HoverState {
  index: number;
  x: number;
}

const PAD = { top: 12, right: 44, bottom: 22, left: 40 };

/**
 * Combined SVG chart: request-count bars (left axis) and a token line with an
 * input/output stacked area (right axis). Hand-rolled to keep the embedded
 * dashboard dependency-free.
 */
export function TrendChart({ points, hourly, className }: TrendChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [hover, setHover] = useState<HoverState | null>(null);

  const width = 720;
  const height = 240;
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;

  const model = useMemo(() => {
    const maxRequests = Math.max(1, ...points.map((p) => p.requests));
    const maxTokens = Math.max(1, ...points.map((p) => p.tokens));
    // Round axes up to a pleasant ceiling.
    const nice = (v: number) => {
      const pow = 10 ** Math.floor(Math.log10(v));
      return Math.ceil(v / pow) * pow;
    };
    return { maxRequests: nice(maxRequests), maxTokens: nice(maxTokens) };
  }, [points]);

  if (points.length === 0) {
    return (
      <div className={cn('flex h-48 items-center justify-center text-xs text-muted-foreground', className)}>
        暂无趋势数据
      </div>
    );
  }

  const step = innerW / points.length;
  const barW = Math.max(2, Math.min(18, step * 0.5));
  const x = (i: number) => PAD.left + step * i + step / 2;
  const yReq = (v: number) => PAD.top + innerH - (v / model.maxRequests) * innerH;
  const yTok = (v: number) => PAD.top + innerH - (v / model.maxTokens) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yTok(p.tokens).toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L${x(points.length - 1).toFixed(1)},${PAD.top + innerH} L${x(0).toFixed(1)},${PAD.top + innerH} Z`;

  const ticksCount = 4;
  const yTicks = Array.from({ length: ticksCount + 1 }, (_, i) => i / ticksCount);
  const labelEvery = Math.ceil(points.length / 12);

  const hovered = hover ? points[hover.index] : null;

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="调用趋势图"
      >
        <defs>
          <linearGradient id={`tokFill${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(221 83% 53%)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="hsl(221 83% 53%)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Horizontal grid + left axis (requests) */}
        {yTicks.map((t) => {
          const y = PAD.top + innerH * (1 - t);
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y}
                y2={y}
                className="stroke-border"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">
                {formatTokens(model.maxRequests * t)}
              </text>
              <text
                x={width - PAD.right + 6}
                y={y + 3}
                textAnchor="start"
                className="fill-muted-foreground text-[9px]"
              >
                {formatTokens(model.maxTokens * t)}
              </text>
            </g>
          );
        })}

        {/* Request bars */}
        {points.map((p, i) => {
          const y = yReq(p.requests);
          return (
            <rect
              key={p.bucket}
              x={x(i) - barW / 2}
              y={y}
              width={barW}
              height={Math.max(0, PAD.top + innerH - y)}
              rx={1.5}
              className="fill-emerald-500/70"
              opacity={hover && hover.index !== i ? 0.45 : 1}
            />
          );
        })}

        {/* Token area + line */}
        <path d={areaPath} fill={`url(#tokFill${uid})`} />
        <path d={linePath} fill="none" className="stroke-blue-500" strokeWidth="1.8" />
        {points.map((p, i) => (
          <circle
            key={`dot-${p.bucket}`}
            cx={x(i)}
            cy={yTok(p.tokens)}
            r={hover?.index === i ? 3.2 : 0}
            className="fill-blue-500"
          />
        ))}

        {/* X labels */}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`xl-${p.bucket}`}
              x={x(i)}
              y={height - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[9px]"
            >
              {hourly ? p.bucket.slice(11, 13) : p.bucket.slice(5, 10)}
            </text>
          ) : null,
        )}

        {/* Hover capture */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={(e) => {
            const rect = (e.target as SVGRectElement).getBoundingClientRect();
            const rel = ((e.clientX - rect.left) / rect.width) * innerW;
            setHover({ index: Math.min(points.length - 1, Math.max(0, Math.floor(rel / step))), x: rel });
          }}
        />
        {hover && (
          <line
            x1={x(hover.index)}
            x2={x(hover.index)}
            y1={PAD.top}
            y2={PAD.top + innerH}
            className="stroke-border"
            strokeWidth="1"
          />
        )}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-md border bg-popover p-2 text-xs shadow-md"
          style={{
            left: `${((hover!.index + 0.5) * step + PAD.left) / width * 100}%`,
            transform:
              hover!.index > points.length / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
          }}
        >
          <div className="font-medium">{formatBucket(hovered.bucket, hourly)}</div>
          <div className="mt-1 space-y-0.5 text-muted-foreground">
            <div className="flex justify-between gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                请求
              </span>
              <span className="font-mono text-foreground">{formatNumber(hovered.requests)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                Tokens
              </span>
              <span className="font-mono text-foreground">{formatTokens(hovered.tokens)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="pl-4">入 / 出</span>
              <span className="font-mono">
                {formatTokens(hovered.input_tokens)} / {formatTokens(hovered.output_tokens)}
              </span>
            </div>
            {hovered.failed > 0 && (
              <div className="flex justify-between gap-4 text-rose-500">
                <span>失败</span>
                <span className="font-mono">{formatNumber(hovered.failed)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-500/70" />
          请求数（左轴）
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-blue-500" />
          Tokens（右轴）
        </span>
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useFormat } from "@/hooks/use-format";
import { useI18n } from "@/i18n/context";
import { cn, formatBucket, formatDuration } from "@/lib/utils";
import type { TrendPoint } from "@/types";

interface TrendChartProps {
  points: TrendPoint[];
  /** 桶为小时（"2006-01-02 15"）时为 true */
  hourly: boolean;
  /** 一次只画一种量纲，避免双 Y 轴把请求数和词元量混在一起 */
  view: "requests" | "tokens";
  className?: string;
}

/**
 * 序列定义是唯一的颜色/文案来源：图表配置、图形填充和自绘图例共用它，
 * 避免图例顺序与配色跟实际图形脱节。
 */
const SERIES = {
  success: { labelKey: "overview.trend.requests_ok", color: "var(--chart-1)" },
  failed: { labelKey: "overview.trend.failed_requests", color: "var(--destructive)" },
  input: { labelKey: "overview.trend.input_label", color: "var(--chart-3)" },
  output: { labelKey: "overview.trend.output_label", color: "var(--chart-2)" },
} as const;

type SeriesKey = keyof typeof SERIES;

/** 每个 view 用哪两条序列，以及图例/图形的先后顺序 */
const VIEW_SERIES = {
  requests: ["success", "failed"],
  tokens: ["input", "output"],
} as const satisfies Record<TrendChartProps["view"], readonly SeriesKey[]>;

/**
 * 调用趋势：按 view 只画单一量纲（请求数堆叠柱 / 词元堆叠面积），单条左轴。
 * 容器、tooltip 走 shadcn chart；配色取自主题变量，深浅色自动跟随。
 */
export function TrendChart({ points, hourly, view, className }: TrendChartProps) {
  const { t } = useI18n();
  const { formatNumber, formatTokens } = useFormat();

  const activeKeys = VIEW_SERIES[view];

  const labels = useMemo(
    () => Object.fromEntries(activeKeys.map((key) => [key, t(SERIES[key].labelKey)])) as Record<SeriesKey, string>,
    [activeKeys, t],
  );

  const config = useMemo(
    () =>
      Object.fromEntries(
        activeKeys.map((key) => [key, { label: labels[key], color: SERIES[key].color }]),
      ) satisfies ChartConfig,
    [activeKeys, labels],
  );

  const data = useMemo(
    () =>
      points.map((point) => ({
        bucket: point.bucket,
        success: Math.max(0, point.requests - point.failed),
        failed: point.failed,
        input: point.input_tokens,
        output: point.output_tokens,
        total: point.tokens,
        avgLatency: point.avg_latency_ms,
        p95Latency: point.p95_latency_ms,
      })),
    [points],
  );

  if (data.length === 0) {
    return (
      <div className={cn("flex h-64 items-center justify-center text-xs text-muted-foreground", className)}>
        {t("overview.trend.empty")}
      </div>
    );
  }

  const formatValue = view === "requests" ? formatNumber : formatTokens;

  return (
    <div className={cn("space-y-1", className)}>
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <ComposedChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="bucket"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={(value: string) => formatBucket(value, hourly)}
          />
          {/* 轴一律用紧凑单位：精确数字（1,234,567）会超出 44px 轴宽，精确值留给 tooltip */}
          <YAxis tickLine={false} axisLine={false} tickMargin={6} width={44} tickFormatter={formatTokens} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload;
                  if (!point) return "";
                  const bucket = typeof point.bucket === "string" ? formatBucket(point.bucket, hourly) : "";
                  return (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        {bucket}
                        <span className="font-normal text-muted-foreground">
                          {t("overview.trend.total_tokens", { value: formatTokens(Number(point.total) || 0) })}
                        </span>
                      </div>
                      <div className="font-normal text-muted-foreground">
                        {t("overview.trend.latency_line", {
                          avg: formatDuration(Number(point.avgLatency) || 0),
                          p95: formatDuration(Number(point.p95Latency) || 0),
                        })}
                      </div>
                    </div>
                  );
                }}
                formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">{labels[name as SeriesKey] ?? name}</span>
                    <span className="font-mono font-medium tabular-nums">{formatValue(Number(value))}</span>
                  </div>
                )}
              />
            }
          />
          {view === "requests" ? (
            <>
              <Bar dataKey="success" stackId="view" fill={SERIES.success.color} radius={[2, 2, 0, 0]} />
              <Bar dataKey="failed" stackId="view" fill={SERIES.failed.color} radius={[2, 2, 0, 0]} />
            </>
          ) : (
            <>
              <Area
                dataKey="input"
                type="monotone"
                stackId="view"
                stroke={SERIES.input.color}
                fill={SERIES.input.color}
                fillOpacity={0.25}
                strokeWidth={1.6}
              />
              <Area
                dataKey="output"
                type="monotone"
                stackId="view"
                stroke={SERIES.output.color}
                fill={SERIES.output.color}
                fillOpacity={0.25}
                strokeWidth={1.6}
              />
            </>
          )}
        </ComposedChart>
      </ChartContainer>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {activeKeys.map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-xs" style={{ background: SERIES[key].color }} />
            {labels[key]}
          </span>
        ))}
      </div>
    </div>
  );
}

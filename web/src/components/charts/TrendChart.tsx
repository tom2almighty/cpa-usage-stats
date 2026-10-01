import { useMemo } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useI18n } from "@/i18n/context";
import { cn, formatBucket, formatDuration, formatNumber, formatTokens } from "@/lib/utils";
import type { TrendPoint } from "@/types";

interface TrendChartProps {
  points: TrendPoint[];
  /** 桶为小时（"2006-01-02 15"）时为 true */
  hourly: boolean;
  className?: string;
}

/**
 * 序列定义是唯一的颜色/文案来源：图表配置、图形填充和自绘图例共用它，
 * 避免图例顺序与配色跟实际图形脱节。
 */
const SERIES = [
  { key: "success", labelKey: "overview.trend.requests_ok", color: "var(--chart-1)" },
  { key: "failed", labelKey: "overview.trend.failed_requests", color: "var(--destructive)" },
  { key: "input", labelKey: "overview.trend.input_label", color: "var(--chart-3)" },
  { key: "output", labelKey: "overview.trend.output_label", color: "var(--chart-2)" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

/**
 * 调用趋势：请求数（成功/失败堆叠柱，左轴）+ Token 消耗（输入/输出堆叠面积，右轴）。
 * 容器、tooltip 走 shadcn chart；配色取自主题变量，深浅色自动跟随。
 */
export function TrendChart({ points, hourly, className }: TrendChartProps) {
  const { t } = useI18n();

  const labels = useMemo(
    () => Object.fromEntries(SERIES.map((s) => [s.key, t(s.labelKey)])) as Record<SeriesKey, string>,
    [t],
  );

  const config = useMemo(
    () =>
      Object.fromEntries(SERIES.map((s) => [s.key, { label: labels[s.key], color: s.color }])) satisfies ChartConfig,
    [labels],
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

  const formatValue = (name: string, value: number) =>
    name === "success" || name === "failed" ? formatNumber(value) : formatTokens(value);

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
          <YAxis
            yAxisId="requests"
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            width={44}
            tickFormatter={formatTokens}
          />
          <YAxis
            yAxisId="tokens"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            width={48}
            tickFormatter={formatTokens}
          />
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
                    <span className="font-mono font-medium tabular-nums">
                      {formatValue(String(name), Number(value))}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Bar dataKey="success" yAxisId="requests" stackId="requests" fill={SERIES[0].color} radius={[2, 2, 0, 0]} />
          <Bar dataKey="failed" yAxisId="requests" stackId="requests" fill={SERIES[1].color} radius={[2, 2, 0, 0]} />
          <Area
            dataKey="input"
            yAxisId="tokens"
            type="monotone"
            stackId="tokens"
            stroke={SERIES[2].color}
            fill={SERIES[2].color}
            fillOpacity={0.25}
            strokeWidth={1.6}
          />
          <Area
            dataKey="output"
            yAxisId="tokens"
            type="monotone"
            stackId="tokens"
            stroke={SERIES[3].color}
            fill={SERIES[3].color}
            fillOpacity={0.25}
            strokeWidth={1.6}
          />
        </ComposedChart>
      </ChartContainer>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SERIES.map((series) => (
          <span key={series.key} className="inline-flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-[2px]" style={{ background: series.color }} />
            {labels[series.key]}
          </span>
        ))}
      </div>
    </div>
  );
}

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useFormat } from "@/hooks/use-format";
import type { PricingState } from "@/hooks/use-pricing";
import { useI18n } from "@/i18n/context";
import type { UsageMetric } from "@/lib/metrics";
import { costPerToken } from "@/lib/pricing";
import { cn, formatDuration } from "@/lib/utils";
import type { SummaryData } from "@/types";

type SeriesKey = "success" | "failed" | "input" | "output" | "cost" | "speed" | "avg" | "p95";

const SERIES: Record<
  SeriesKey,
  { labelKey?: string; label?: string; color: string; stack?: string; rounded?: boolean }
> = {
  success: {
    labelKey: "overview.trend.requests_ok",
    color: "var(--chart-1)",
    stack: "requests",
  },
  failed: {
    labelKey: "overview.trend.failed_requests",
    color: "var(--destructive)",
    stack: "requests",
    rounded: true,
  },
  input: { labelKey: "overview.trend.input_label", color: "var(--chart-1)", stack: "tokens" },
  output: {
    labelKey: "overview.trend.output_label",
    color: "var(--chart-2)",
    stack: "tokens",
    rounded: true,
  },
  cost: { labelKey: "usage_chart.metric_cost", color: "var(--chart-1)", rounded: true },
  speed: { labelKey: "usage_chart.metric_speed", color: "var(--chart-2)", rounded: true },
  avg: { labelKey: "overview.trend.avg_latency", color: "var(--chart-1)", rounded: true },
  p95: { label: "P95", color: "var(--chart-4)", rounded: true },
};

/** 每个指标对应的序列；请求与词元按成功/失败、输入/输出堆叠。 */
const METRIC_SERIES: Record<UsageMetric, SeriesKey[]> = {
  tokens: ["input", "output"],
  requests: ["success", "failed"],
  cost: ["cost"],
  speed: ["speed"],
  latency: ["avg", "p95"],
};

interface UsageTimeChartProps {
  summary: SummaryData | null;
  metric: UsageMetric;
  pricing: PricingState;
  className?: string;
}

/**
 * 用量走势：横轴为时间桶，指标页签决定纵轴量纲。
 * 请求与词元用堆叠柱保留成功/失败、输入/输出的构成。
 */
export function UsageTimeChart({ summary, metric, pricing, className }: UsageTimeChartProps) {
  const { t } = useI18n();
  const { formatNumber, formatTokens, formatCost, formatBucket } = useFormat();

  const hourly = summary?.bucket === "hour";
  const costRate = useMemo(
    () => (pricing.table ? costPerToken(pricing.table, summary?.model_stats ?? []) : null),
    [pricing.table, summary?.model_stats],
  );

  const data = useMemo(
    () =>
      (summary?.trend ?? []).map((point) => {
        const speed =
          point.requests > 0 && point.output_tokens > 0 && point.avg_latency_ms > 0
            ? (point.output_tokens / point.requests / point.avg_latency_ms) * 1000
            : 0;
        return {
          bucket: point.bucket,
          success: Math.max(0, point.requests - point.failed),
          failed: point.failed,
          input: point.input_tokens,
          output: point.output_tokens,
          cost: costRate === null ? 0 : point.tokens * costRate,
          speed,
          avg: point.avg_latency_ms,
          p95: point.p95_latency_ms,
          totalTokens: point.tokens,
          requests: point.requests,
        };
      }),
    [costRate, summary?.trend],
  );

  const activeKeys = METRIC_SERIES[metric];
  const labels = useMemo(
    () =>
      Object.fromEntries(
        activeKeys.map((key) => [key, SERIES[key].label ? SERIES[key].label : t(SERIES[key].labelKey as never)]),
      ) as Record<SeriesKey, string>,
    [activeKeys, t],
  );

  const config = useMemo(
    () =>
      Object.fromEntries(
        activeKeys.map((key) => [key, { label: labels[key], color: SERIES[key].color }]),
      ) satisfies ChartConfig,
    [activeKeys, labels],
  );

  if (metric === "cost" && costRate === null) {
    return (
      <div className={cn("flex h-88 w-full items-center justify-center text-xs text-muted-foreground", className)}>
        {pricing.table ? t("overview.kpi.no_cost_data") : t("usage_chart.cost_unavailable")}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={cn("flex h-88 w-full items-center justify-center text-xs text-muted-foreground", className)}>
        {t("overview.trend.empty")}
      </div>
    );
  }

  const formatValue = (value: number) => {
    if (metric === "tokens") return formatTokens(value);
    if (metric === "requests") return formatNumber(value);
    if (metric === "cost") return formatCost(value);
    if (metric === "latency") return formatDuration(value);
    return t("usage_chart.tps", { value: value.toFixed(1) });
  };

  const formatTick = (value: number) => {
    if (metric === "tokens") return formatTokens(value);
    if (metric === "requests") return formatNumber(value);
    if (metric === "cost") return formatCost(value);
    if (metric === "latency") return formatDuration(value);
    return t("usage_chart.tps_short", { value: Math.round(value) });
  };

  return (
    <div className={cn("flex h-88 w-full flex-col gap-1", className)}>
      <ChartContainer config={config} className="aspect-auto h-80 w-full shrink-0">
        <BarChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="bucket"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={(value: string) => formatBucket(value, hourly)}
          />
          <YAxis tickLine={false} axisLine={false} tickMargin={6} width={56} tickFormatter={formatTick} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const point = payload?.[0]?.payload;
                  if (!point) return "";
                  return (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        {formatBucket(String(point.bucket), hourly)}
                        <span className="font-normal text-muted-foreground">
                          {t("overview.trend.total_tokens", { value: formatTokens(Number(point.totalTokens) || 0) })}
                        </span>
                      </div>
                      <div className="font-normal text-muted-foreground">
                        {t("overview.trend.requests_total", { value: formatNumber(Number(point.requests) || 0) })}
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
          {activeKeys.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              stackId={SERIES[key].stack}
              fill={SERIES[key].color}
              radius={SERIES[key].rounded ? [3, 3, 0, 0] : undefined}
              maxBarSize={32}
            />
          ))}
        </BarChart>
      </ChartContainer>

      {/* 单序列也保留图例行，保证切换指标时图表高度不变化 */}
      <div className="flex h-6 shrink-0 flex-wrap items-center justify-center gap-x-4 gap-y-1 overflow-hidden text-xs text-muted-foreground">
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

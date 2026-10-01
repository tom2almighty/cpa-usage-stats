import { useMemo } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { useI18n } from "@/i18n/context";
import { cn, formatBucket, formatNumber, formatTokens } from "@/lib/utils";
import type { TrendPoint } from "@/types";

interface TrendChartProps {
  points: TrendPoint[];
  /** 桶为小时（"2006-01-02 15"）时为 true */
  hourly: boolean;
  className?: string;
}

/**
 * 调用趋势：请求数（成功/失败堆叠柱，左轴）+ Token 消耗（输入/输出堆叠面积，右轴）。
 * 图表容器与配色走 shadcn chart 组件，Token 颜色复用 --chart-* 主题变量。
 */
export function TrendChart({ points, hourly, className }: TrendChartProps) {
  const { t } = useI18n();

  const config = useMemo(
    () =>
      ({
        success: { label: t("overview.trend.requests_ok"), color: "var(--chart-1)" },
        failed: { label: t("overview.trend.failed_requests"), color: "var(--destructive)" },
        input: { label: t("overview.trend.input_tokens"), color: "var(--chart-3)" },
        output: { label: t("overview.trend.output_tokens"), color: "var(--chart-2)" },
      }) satisfies ChartConfig,
    [t],
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
      })),
    [points],
  );

  if (data.length === 0) {
    return (
      <div className={cn("flex h-56 items-center justify-center text-xs text-muted-foreground", className)}>
        {t("overview.trend.empty")}
      </div>
    );
  }

  const axisTickFormatter = (value: number) => formatTokens(value);
  const bucketFormatter = (value: string) => formatBucket(value, hourly);

  return (
    <ChartContainer config={config} className={cn("aspect-auto h-64 w-full", className)}>
      <ComposedChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="bucket"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={bucketFormatter}
        />
        <YAxis
          yAxisId="requests"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          width={44}
          tickFormatter={axisTickFormatter}
        />
        <YAxis
          yAxisId="tokens"
          orientation="right"
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          width={48}
          tickFormatter={axisTickFormatter}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const point = payload?.[0]?.payload;
                if (!point) return "";
                const bucket = typeof point.bucket === "string" ? formatBucket(point.bucket, hourly) : "";
                return (
                  <span className="flex items-center gap-2">
                    {bucket}
                    <span className="font-normal text-muted-foreground">
                      {t("overview.trend.total_tokens", { value: formatTokens(Number(point.total) || 0) })}
                    </span>
                  </span>
                );
              }}
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">{config[name as keyof typeof config]?.label ?? name}</span>
                  <span className="font-mono font-medium tabular-nums">
                    {name === "success" || name === "failed"
                      ? formatNumber(Number(value))
                      : formatTokens(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar
          dataKey="success"
          yAxisId="requests"
          stackId="requests"
          fill="var(--color-success)"
          radius={[2, 2, 0, 0]}
        />
        <Bar dataKey="failed" yAxisId="requests" stackId="requests" fill="var(--color-failed)" radius={[2, 2, 0, 0]} />
        <Area
          dataKey="input"
          yAxisId="tokens"
          type="monotone"
          stackId="tokens"
          stroke="var(--color-input)"
          fill="var(--color-input)"
          fillOpacity={0.25}
          strokeWidth={1.6}
        />
        <Area
          dataKey="output"
          yAxisId="tokens"
          type="monotone"
          stackId="tokens"
          stroke="var(--color-output)"
          fill="var(--color-output)"
          fillOpacity={0.25}
          strokeWidth={1.6}
        />
      </ComposedChart>
    </ChartContainer>
  );
}

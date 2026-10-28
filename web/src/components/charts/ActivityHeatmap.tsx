import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFormat } from "@/hooks/use-format";
import { useI18n } from "@/i18n/context";
import { costPerToken, type PricingTable } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { SummaryData } from "@/types";

export type HeatmapMetric = "tokens" | "requests" | "cost";

const METRICS: HeatmapMetric[] = ["tokens", "requests", "cost"];
// 26 周：按容器宽度等分列仍能铺满，同时让每个热力点有足够面积
const WEEKS = 26;
const DAYS = 7;
const DAY_MS = 86_400_000;

/** 强度分档：0 为空，其余四档递增透明度。 */
const LEVEL_CLASS = ["bg-muted/60", "bg-chart-3/25", "bg-chart-3/45", "bg-chart-3/70", "bg-chart-3"] as const;

/** 热力图按周列排布，这里取包含该日的周一作为列起点。 */
function startOfWeek(date: Date): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() - ((next.getUTCDay() + 6) % 7));
  return next;
}

/** 网格日期只是日历坐标，统一锚定 UTC 中午以避免 DST 和本地午夜偏移。 */
function gridDayKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

type Cell = { key: string; date: Date; value: number; level: number };

/**
 * GitHub 风格活动热力图：按天统计，通过 tabs 切换 Token、请求、费用。
 * 费用来自模型聚合按天摊算，与其它页签的成本口径一致。
 */
export function ActivityHeatmap({
  summary,
  pricingTable,
  className,
}: {
  summary: SummaryData | null;
  pricingTable: PricingTable | null;
  className?: string;
}) {
  const { t } = useI18n();
  const { formatNumber, formatTokens, formatCost, formatDateKey } = useFormat();
  const [metric, setMetric] = useState<HeatmapMetric>("requests");

  const { weeks, monthLabels, max, total } = useMemo(() => {
    // 趋势桶只有 token 总量，没有逐模型构成；费用用整体混合单价按桶 token 折算。
    const costRate = metric === "cost" && pricingTable ? costPerToken(pricingTable, summary?.model_stats ?? []) : null;

    const trend = summary?.trend ?? [];
    const hourly = summary?.bucket === "hour";
    const valueByDay = new Map<string, number>();
    for (const point of trend) {
      const date = new Date(point.bucket);
      if (Number.isNaN(date.getTime())) continue;
      const key = formatDateKey(date);
      const value =
        metric === "tokens"
          ? point.tokens
          : metric === "requests"
            ? point.requests
            : costRate === null
              ? 0
              : point.tokens * costRate;
      valueByDay.set(key, (valueByDay.get(key) ?? 0) + value);
    }
    // 小时桶只覆盖当天，热力图的空档不应被误读成“当天没量”。
    const partialDays = new Set(hourly ? [formatDateKey(new Date())] : []);

    const [todayYear, todayMonth, todayDay] = formatDateKey(new Date()).split("-").map(Number);
    const today = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay, 12));
    const firstWeek = startOfWeek(new Date(today.getTime() - (WEEKS - 1) * 7 * DAY_MS));
    const values: number[] = [];
    const matrix: Cell[][] = [];
    const labels: { index: number; text: string }[] = [];

    for (let week = 0; week < WEEKS; week++) {
      const column: Cell[] = [];
      for (let day = 0; day < DAYS; day++) {
        const date = new Date(firstWeek.getTime() + (week * DAYS + day) * DAY_MS);
        const key = gridDayKey(date);
        const future = date.getTime() > today.getTime();
        const value = future || partialDays.has(key) ? 0 : (valueByDay.get(key) ?? 0);
        if (!future && !partialDays.has(key)) values.push(value);
        column.push({ key, date, value, level: 0 });
      }
      const first = column[0].date;
      if (first.getUTCDate() <= DAYS) {
        labels.push({ index: week, text: `${first.getUTCMonth() + 1}/${first.getUTCDate()}` });
      }
      matrix.push(column);
    }

    const peak = Math.max(1, ...values);
    for (const column of matrix) {
      for (const cell of column) {
        cell.level = cell.value <= 0 ? 0 : Math.min(4, Math.ceil((cell.value / peak) * 4));
      }
    }

    return {
      weeks: matrix,
      monthLabels: labels,
      max: peak,
      total: values.reduce((sum, value) => sum + value, 0),
    };
  }, [formatDateKey, metric, pricingTable, summary]);

  const formatValue = (value: number) => {
    if (metric === "tokens") return formatTokens(value);
    if (metric === "requests") return formatNumber(value);
    return formatCost(value);
  };

  // 只标注周一/周三/周五，其余留空；用固定 key 保证行序稳定
  const weekdayLabels: { key: string; text: string }[] = [
    { key: "mon", text: t("heatmap.weekday_mon") },
    { key: "tue", text: "" },
    { key: "wed", text: t("heatmap.weekday_wed") },
    { key: "thu", text: "" },
    { key: "fri", text: t("heatmap.weekday_fri") },
    { key: "sat", text: "" },
    { key: "sun", text: "" },
  ];

  const hasData = max > 1 || total > 0;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {t("heatmap.summary", {
            total: formatValue(total),
            days: formatNumber(WEEKS * DAYS),
          })}
        </span>
        <Tabs value={metric} onValueChange={(value) => value && setMetric(value as HeatmapMetric)}>
          <TabsList className="h-7">
            {METRICS.map((item) => (
              <TabsTrigger key={item} value={item} className="px-2 text-xs">
                {t(`heatmap.metric_${item}` as never)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {!hasData ? (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          {metric === "cost" && !pricingTable ? t("usage_chart.cost_unavailable") : t("heatmap.empty")}
        </div>
      ) : (
        <div className="space-y-1.5 overflow-x-auto">
          <div className="flex min-w-140 gap-1.5">
            <div className="flex w-6 shrink-0 flex-col gap-1 pt-4">
              {weekdayLabels.map((label) => (
                <span key={label.key} className="h-3 text-[9px] leading-3 text-muted-foreground">
                  {label.text}
                </span>
              ))}
            </div>
            <div className="grid flex-1 gap-1" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
              {weeks.map((column, weekIndex) => {
                const label = monthLabels.find((item) => item.index === weekIndex);
                return (
                  <div key={column[0].key} className="flex min-w-0 flex-col gap-1">
                    <span className="h-3 text-[9px] leading-3 whitespace-nowrap text-muted-foreground">
                      {label?.text ?? ""}
                    </span>
                    {column.map((cell) => (
                      <Tooltip key={cell.key}>
                        <TooltipTrigger
                          render={
                            <span
                              className={cn(
                                "aspect-square w-full rounded-xs transition-colors hover:ring-1 hover:ring-ring",
                                LEVEL_CLASS[cell.level],
                              )}
                            />
                          }
                        />
                        <TooltipContent>
                          <span className="font-mono tabular-nums">
                            {cell.key} · {formatValue(cell.value)}
                          </span>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
            <span>{t("heatmap.less")}</span>
            {LEVEL_CLASS.map((level) => (
              <span key={level} className={cn("size-3.5 rounded-xs", level)} />
            ))}
            <span>{t("heatmap.more")}</span>
          </div>
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";
import { Cell, Label, Pie, PieChart } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { useI18n } from "@/i18n/context";
import { cn, formatNumber, formatTokens } from "@/lib/utils";
import type { GroupStat } from "@/types";

interface DonutChartProps {
  stats: GroupStat[];
  /** 切片大小所用的指标 */
  metric: "total_tokens" | "requests";
  className?: string;
}

/** shadcn chart 调色板；超过 5 项时循环复用并降低透明度 */
function sliceColor(index: number): string {
  const token = `var(--chart-${(index % 5) + 1})`;
  return index < 5 ? token : `color-mix(in oklab, ${token} 55%, transparent)`;
}

/** Provider / Key 用量分布环形图，右侧为可悬停高亮的明细列表。 */
export function DonutChart({ stats, metric, className }: DonutChartProps) {
  const { t } = useI18n();
  const [active, setActive] = useState<number | null>(null);

  const slices = useMemo(() => {
    const usable = stats.filter((stat) => stat[metric] > 0);
    const total = usable.reduce((sum, stat) => sum + stat[metric], 0);
    if (total <= 0) return [];
    return usable.map((stat, index) => ({
      stat,
      name: stat.name || "-",
      value: stat[metric],
      share: stat[metric] / total,
      fill: sliceColor(index),
    }));
  }, [stats, metric]);

  const config = useMemo(
    () =>
      Object.fromEntries(
        slices.map((slice) => [slice.name, { label: slice.name, color: slice.fill }]),
      ) satisfies ChartConfig,
    [slices],
  );

  const formatValue = (value: number) => (metric === "total_tokens" ? formatTokens(value) : formatNumber(value));

  if (slices.length === 0) {
    return (
      <div className={cn("flex h-56 items-center justify-center text-xs text-muted-foreground", className)}>
        {t("overview.provider.empty")}
      </div>
    );
  }

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const focused = active !== null ? slices[active] : null;

  return (
    <div className={cn("flex flex-col items-center gap-4 sm:flex-row", className)}>
      <ChartContainer config={config} className="mx-auto aspect-square h-44 shrink-0">
        <PieChart>
          <ChartTooltip
            content={
              <ChartTooltipContent
                nameKey="name"
                hideLabel
                formatter={(value, name, item) => (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">{name}</span>
                    <span className="font-mono font-medium tabular-nums">
                      {formatValue(Number(value))}
                      <span className="ml-1.5 text-muted-foreground">
                        {((item.payload?.share ?? 0) * 100).toFixed(1)}%
                      </span>
                    </span>
                  </div>
                )}
              />
            }
          />
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="100%"
            paddingAngle={1}
            strokeWidth={2}
            stroke="var(--background)"
            onMouseEnter={(_, index) => setActive(index)}
            onMouseLeave={() => setActive(null)}
          >
            {slices.map((slice, index) => (
              <Cell key={slice.name} fill={slice.fill} opacity={active === null || active === index ? 1 : 0.35} />
            ))}
            <Label
              content={() => (
                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                  <tspan x="50%" dy="-0.4em" className="fill-muted-foreground text-[10px]">
                    {focused ? t("overview.provider.share") : t("common.total", { count: slices.length })}
                  </tspan>
                  <tspan x="50%" dy="1.3em" className="fill-foreground font-mono text-sm font-semibold">
                    {focused ? `${(focused.share * 100).toFixed(1)}%` : formatValue(total)}
                  </tspan>
                </text>
              )}
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="w-full min-w-0 space-y-1">
        {slices.map((slice, index) => (
          <button
            key={slice.name}
            type="button"
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              active === index && "bg-muted/60",
            )}
          >
            <span className="size-2 shrink-0 rounded-xs" style={{ background: slice.fill }} />
            <span className="min-w-0 flex-1 truncate">{slice.name}</span>
            <span className="shrink-0 font-mono text-muted-foreground">{formatValue(slice.value)}</span>
            <span className="w-10 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
              {(slice.share * 100).toFixed(0)}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

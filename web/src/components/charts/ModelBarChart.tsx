import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFormat } from "@/hooks/use-format";
import { useI18n } from "@/i18n/context";
import { groupCostDetails, type PricingTable } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import type { GroupStat } from "@/types";

export type ModelMetric = "tokens" | "requests" | "cost";

interface ModelBarChartProps {
  models: GroupStat[];
  metric: ModelMetric;
  pricingTable: PricingTable | null;
  className?: string;
}

/**
 * Top 模型水平排行条形图：单图聚焦 + 指标切换。
 * 针对大语言模型名称长、头部集中的特点，左侧 Y 轴放置模型名，右侧展现量化柱状对比。
 */
export function ModelBarChart({ models, metric, pricingTable, className }: ModelBarChartProps) {
  const { t } = useI18n();
  const { formatNumber, formatTokens, formatCost } = useFormat();

  const data = useMemo(() => {
    const list = models.map((m) => {
      const details = groupCostDetails(pricingTable, m);
      const cost = details?.cost ?? 0;
      const val = metric === "tokens" ? m.total_tokens : metric === "requests" ? m.requests : cost;
      return {
        name: m.name || "-",
        provider: m.secondary || "",
        value: val,
        tokens: m.total_tokens,
        requests: m.requests,
        cost,
        cacheTokens: m.cache_read_tokens,
      };
    });

    return list.sort((a, b) => b.value - a.value).slice(0, 8);
  }, [models, metric, pricingTable]);

  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-xs text-muted-foreground">
        {t("overview.models.empty")}
      </div>
    );
  }

  const formatTick = (val: number) => {
    if (metric === "tokens") return formatTokens(val);
    if (metric === "requests") return formatNumber(val);
    return formatCost(val);
  };

  return (
    <div className={cn("h-64 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-muted/40" />
          <XAxis
            type="number"
            tickFormatter={formatTick}
            className="fill-muted-foreground font-mono text-[11px]"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tickLine={false}
            axisLine={false}
            className="fill-muted-foreground font-mono text-xs"
            tickFormatter={(val: string) => (val.length > 16 ? `${val.slice(0, 15)}…` : val)}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.3 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0].payload;
              return (
                <div className="space-y-1 rounded-lg border bg-popover p-2.5 text-xs text-popover-foreground shadow-md">
                  <div className="font-mono font-semibold text-foreground">{item.name}</div>
                  {item.provider && <div className="text-[11px] text-muted-foreground">{item.provider}</div>}
                  <div className="space-y-0.5 border-t pt-1 font-mono tabular-nums">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{t("overview.models.th.tokens")}:</span>
                      <span className="font-medium">{formatTokens(item.tokens)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{t("overview.models.th.requests")}:</span>
                      <span className="font-medium">{formatNumber(item.requests)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">{t("overview.models.th.cost")}:</span>
                      <span className="font-medium">{formatCost(item.cost)}</span>
                    </div>
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

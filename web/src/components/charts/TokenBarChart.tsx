import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFormat } from "@/hooks/use-format";
import { useI18n } from "@/i18n/context";
import { cn } from "@/lib/utils";
import type { SummaryData } from "@/types";

interface TokenBarChartProps {
  summary: SummaryData | null;
  className?: string;
}

const TOKEN_ITEMS = [
  { key: "cache", labelKey: "overview.tokens_dist.cache", colorToken: "var(--chart-1)" },
  { key: "input", labelKey: "overview.tokens_dist.input", colorToken: "var(--chart-2)" },
  { key: "output", labelKey: "overview.tokens_dist.output", colorToken: "var(--chart-3)" },
  { key: "reasoning", labelKey: "overview.tokens_dist.reasoning", colorToken: "var(--chart-4)" },
] as const;

/**
 * Token 构成与分布水平条形图：紧凑尺寸、采用标准 chart 颜色 token。
 * 区分 缓存读取、未缓存输入、常规输出、深度推理。
 */
export function TokenBarChart({ summary, className }: TokenBarChartProps) {
  const { t } = useI18n();
  const { formatTokens } = useFormat();

  const cache = summary?.cache_read_tokens ?? 0;
  const input = summary?.input_tokens ?? 0;
  const totalOutput = summary?.output_tokens ?? 0;
  const reasoning = summary?.reasoning_tokens ?? 0;
  const output = Math.max(0, totalOutput - reasoning);

  const total = cache + input + output + reasoning;

  const data = useMemo(() => {
    const raw = [
      { key: "cache", count: cache },
      { key: "input", count: input },
      { key: "output", count: output },
      { key: "reasoning", count: reasoning },
    ];

    return raw.map((item, index) => {
      const cfg = TOKEN_ITEMS[index];
      const percent = total > 0 ? (item.count / total) * 100 : 0;
      return {
        key: item.key,
        name: t(cfg.labelKey),
        value: item.count,
        percent,
        fill: cfg.colorToken,
      };
    });
  }, [cache, input, output, reasoning, total, t]);

  if (total === 0) {
    return (
      <div className={cn("flex h-44 items-center justify-center text-xs text-muted-foreground", className)}>
        {t("dashboard.empty.title")}
      </div>
    );
  }

  return (
    <div className={cn("h-44 w-full", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-muted/40" />
          <XAxis
            type="number"
            tickFormatter={(val: number) => formatTokens(val)}
            className="fill-muted-foreground font-mono text-[10px]"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={72}
            tickLine={false}
            axisLine={false}
            className="fill-muted-foreground text-xs font-medium"
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.3 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const item = payload[0].payload;
              return (
                <div className="space-y-1 rounded-lg border bg-popover p-2 text-xs text-popover-foreground shadow-md">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="size-2 rounded-full" style={{ background: item.fill }} />
                    {item.name}
                  </div>
                  <div className="flex justify-between gap-4 border-t pt-1 font-mono text-[11px] tabular-nums">
                    <span className="text-muted-foreground">{formatTokens(item.value)}</span>
                    <span className="font-semibold">{item.percent.toFixed(1)}%</span>
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16}>
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

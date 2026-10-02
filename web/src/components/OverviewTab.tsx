import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ChartColumn,
  Check,
  CircleDollarSign,
  Clock,
  Copy,
  Cpu,
  Database,
  Gauge,
  KeyRound,
  MessagesSquare,
  ServerCog,
  ShieldAlert,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { CustomPriceModal } from "@/components/CustomPriceModal";
import { DonutChart } from "@/components/charts/DonutChart";
import { LatencyBars } from "@/components/charts/LatencyBars";
import { ModelBarChart, type ModelMetric } from "@/components/charts/ModelBarChart";
import { TokenBarChart } from "@/components/charts/TokenBarChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { FailurePanel } from "@/components/FailurePanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFormat } from "@/hooks/use-format";
import type { PricingState } from "@/hooks/use-pricing";
import { useI18n } from "@/i18n/context";
import { groupCostDetails, type ModelPrice, type PriceMatch, totalCost } from "@/lib/pricing";
import { copyToClipboard, displayAuthName, formatDuration, formatPercent, maskApiKey } from "@/lib/utils";
import type { SummaryData } from "@/types";

const MODEL_SKELETON_ROWS = ["model-a", "model-b", "model-c", "model-d"];
const KEY_SKELETON_ROWS = ["key-a", "key-b", "key-c"];

type TrendView = "requests" | "tokens";

/** 概览拆成多个页签后，每块内容都吃同一份 summary，由 Dashboard 按页签分发。 */
interface OverviewSectionProps {
  summary: SummaryData | null;
  loading: boolean;
  pricing: PricingState;
}

/**
 * 指标条里的一格。6 格共享一个外框，靠 1px 间隙透出分隔线，
 * 比 6 张独立卡片少一层边框、也更像一组数据。
 */
function MetricCell({
  title,
  icon,
  value,
  sub,
  loading = false,
}: {
  title: string;
  icon: ReactNode;
  value: ReactNode;
  sub: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="[&_svg]:size-3.5">{icon}</span>
        <span className="truncate">{title}</span>
      </div>
      {loading ? (
        <div className="mt-2 space-y-1.5">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-3 w-28" />
        </div>
      ) : (
        <>
          <div className="mt-2 truncate font-mono text-xl font-semibold tabular-nums">{value}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">{sub}</div>
        </>
      )}
    </div>
  );
}

/** 表格小节：标题行 + 分隔线，不套卡片，把宽度留给表格 */
function TableSection({
  icon,
  title,
  meta,
  children,
}: {
  icon: ReactNode;
  title: string;
  meta: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2 border-b pb-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">{meta}</span>
      </div>
      {children}
    </section>
  );
}

/** 模型价格单元格：已匹配时展示单价并可点击改价，未匹配时提示设置。 */
function PriceCell({ match, onEdit }: { match?: PriceMatch | null; onEdit: () => void }) {
  const { t } = useI18n();
  const { formatUnitPrice } = useFormat();
  if (!match) {
    return (
      <Button variant="link" size="xs" className="-mr-2 text-muted-foreground" onClick={onEdit}>
        {t("overview.models.set_price")}
      </Button>
    );
  }

  const label = `${formatUnitPrice(match.price.input)} / ${formatUnitPrice(match.price.output)}`;
  const content =
    match.matchType === "custom" ? (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-mono tabular-nums">{label}</span>
        <span className="text-primary">*</span>
      </span>
    ) : match.matchType === "fuzzy" ? (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="cursor-help font-mono tabular-nums text-muted-foreground underline decoration-dotted" />
          }
        >
          ~ {label}
        </TooltipTrigger>
        <TooltipContent>
          {t("overview.models.fuzzy_hint", { id: `${match.providerId}/${match.modelId}` })}
        </TooltipContent>
      </Tooltip>
    ) : (
      <span className="font-mono tabular-nums">{label}</span>
    );

  // 负外边距抵消按钮内边距，让单价与右对齐表头齐平
  return (
    <Button
      variant="ghost"
      size="xs"
      className="-mr-2 font-mono"
      onClick={onEdit}
      title={
        match.matchType === "custom"
          ? `${t("overview.models.custom_badge")} · ${t("pricing.dialog.title")}`
          : t("pricing.dialog.title")
      }
    >
      {content}
    </Button>
  );
}

/** 复制按钮的短暂反馈：1.8s 后恢复默认图标 */
function useCopyFeedback() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (value: string) => {
    if (!(await copyToClipboard(value))) return;
    setCopied(value);
    setTimeout(() => setCopied(null), 1800);
  };
  return { copied, copy };
}
/** 用量总览：KPI 指标条 + 趋势/Provider 分布 */
export function OverviewSummary({ summary, loading, pricing }: OverviewSectionProps) {
  const { t } = useI18n();
  const { formatNumber, formatTokens, formatCost } = useFormat();
  const [trendView, setTrendView] = useState<TrendView>("requests");

  const models = summary?.model_stats ?? [];
  const hourly = summary?.bucket === "hour";
  const costs = totalCost(pricing.table, models);
  const dropped = summary?.dropped_records ?? 0;

  return (
    <div className="space-y-6">
      {/* KPI：6 格共享一个外框，2/3/6 列递进，任何断点都整除 */}
      <div className="overflow-hidden rounded-xl bg-border ring-1 ring-foreground/10">
        <div className="grid grid-cols-2 gap-px md:grid-cols-3 xl:grid-cols-6">
          <MetricCell
            title={t("overview.kpi.requests")}
            icon={<Activity />}
            loading={loading}
            value={formatNumber(summary?.total_requests ?? 0)}
            sub={
              <>
                <span className="font-medium text-foreground">{formatPercent(summary?.success_rate ?? 100)}</span>
                <span>{t("overview.kpi.success_rate")}</span>
                {summary && summary.failed_requests > 0 && (
                  <span className="ml-1 font-medium text-destructive">
                    ({t("overview.kpi.failed_count", { count: formatNumber(summary.failed_requests) })})
                  </span>
                )}
              </>
            }
          />
          <MetricCell
            title={t("overview.kpi.tokens")}
            icon={<Zap />}
            loading={loading}
            value={formatTokens(summary?.total_tokens ?? 0)}
            sub={
              <>
                <span>
                  {t("overview.kpi.io_short", {
                    input: formatTokens(summary?.input_tokens ?? 0),
                    output: formatTokens(summary?.output_tokens ?? 0),
                  })}
                </span>
                <span>·</span>
                <span>{t("overview.kpi.reasoning", { value: formatTokens(summary?.reasoning_tokens ?? 0) })}</span>
              </>
            }
          />
          <MetricCell
            title={t("overview.kpi.cache")}
            icon={<Gauge />}
            loading={loading}
            value={formatPercent(summary?.cache_hit_rate ?? 0)}
            sub={
              <>
                <span>{t("overview.kpi.cache_read", { value: formatTokens(summary?.cache_read_tokens ?? 0) })}</span>
                <span>·</span>
                <span>
                  {t("overview.kpi.cache_write", { value: formatTokens(summary?.cache_creation_tokens ?? 0) })}
                </span>
              </>
            }
          />
          <MetricCell
            title={t("overview.kpi.latency")}
            icon={<Clock />}
            loading={loading}
            value={formatDuration(summary?.avg_latency_ms ?? 0)}
            sub={
              <>
                <span>{t("overview.kpi.ttft", { value: formatDuration(summary?.avg_ttft_ms ?? 0) })}</span>
                <span>·</span>
                <Tooltip>
                  <TooltipTrigger render={<span className="cursor-help underline decoration-dotted" />}>
                    {t("overview.kpi.percentiles", {
                      p95: formatDuration(summary?.p95_latency_ms ?? 0),
                      p99: formatDuration(summary?.p99_latency_ms ?? 0),
                    })}
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-0.5 font-mono tabular-nums">
                      <div>P50: {formatDuration(summary?.p50_latency_ms ?? 0)}</div>
                      <div>P95: {formatDuration(summary?.p95_latency_ms ?? 0)}</div>
                      <div>P99: {formatDuration(summary?.p99_latency_ms ?? 0)}</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </>
            }
          />
          <MetricCell
            title={t("overview.kpi.throughput")}
            icon={<Timer />}
            loading={loading}
            value={t("overview.kpi.tps", { value: (summary?.avg_output_tps ?? 0).toFixed(1) })}
            sub={
              <span className="truncate">
                {t("overview.kpi.stream_share", {
                  count: formatNumber(summary?.stream_requests ?? 0),
                  total: formatNumber(summary?.total_requests ?? 0),
                })}
              </span>
            }
          />
          <MetricCell
            title={t("overview.kpi.cost")}
            icon={<CircleDollarSign />}
            loading={loading || pricing.loading}
            value={pricing.table ? formatCost(costs.cost) : "-"}
            sub={
              !pricing.table && !pricing.loading ? (
                <span>{t("overview.kpi.pricing_unavailable")}</span>
              ) : costs.total > 0 ? (
                <span className="truncate">
                  {t("overview.kpi.priced", { priced: costs.priced, total: costs.total })}
                </span>
              ) : (
                <span>{t("overview.kpi.no_cost_data")}</span>
              )
            }
          />
        </div>
      </div>
      {/* 宏观三图联动：调用走势 + Token 构成 + 渠道分布，同高度一行三列 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 图 1：调用走势 */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="size-4 text-muted-foreground" />
                {hourly ? t("overview.trend.hourly") : t("overview.trend.daily")}
              </CardTitle>
              <Tabs value={trendView} onValueChange={(value) => value && setTrendView(value as TrendView)}>
                <TabsList className="h-7">
                  <TabsTrigger value="requests" className="px-2 text-xs">
                    {t("overview.trend.tab_requests")}
                  </TabsTrigger>
                  <TabsTrigger value="tokens" className="px-2 text-xs">
                    {t("overview.trend.tab_tokens")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            {loading ? (
              <Skeleton className="h-44 w-full" />
            ) : (
              <TrendChart points={summary?.trend ?? []} hourly={hourly} view={trendView} />
            )}
          </CardContent>
        </Card>

        {/* 图 2：Token 构成与分布（水平条形图，使用 chart 色阶） */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Cpu className="size-4 text-muted-foreground" />
              {t("overview.tokens_dist.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {loading ? <Skeleton className="h-44 w-full" /> : <TokenBarChart summary={summary} />}
          </CardContent>
        </Card>

        {/* 图 3：Provider 渠道分布（环形图，使用 chart 色阶） */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="size-4 text-muted-foreground" />
              {t("overview.provider.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            {loading ? (
              <Skeleton className="h-44 w-full" />
            ) : (
              <DonutChart stats={summary?.provider_stats ?? []} metric="total_tokens" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 延迟分位统计条 */}
      <Card className="p-4">
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">{t("overview.trend.latency_title")}</span>
          {loading ? (
            <Skeleton className="h-14 w-full" />
          ) : (
            <LatencyBars
              p50={summary?.p50_latency_ms ?? 0}
              p95={summary?.p95_latency_ms ?? 0}
              p99={summary?.p99_latency_ms ?? 0}
            />
          )}
        </div>
      </Card>

      {dropped > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("overview.dropped.title", { count: formatNumber(dropped) })}</AlertTitle>
          <AlertDescription>{t("overview.dropped.desc")}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/** 模型用量：模型排行表 + 改价弹窗（改价状态跟着这张表走） */
export function OverviewModels({ summary, loading, pricing }: OverviewSectionProps) {
  const { t } = useI18n();
  const { formatNumber, formatTokens, formatCost } = useFormat();
  const [editing, setEditing] = useState<{ modelName: string; price: ModelPrice | null; isCustom: boolean } | null>(
    null,
  );
  const [modelMetric, setModelMetric] = useState<ModelMetric>("tokens");

  const models = summary?.model_stats ?? [];
  const maxModelTokens = Math.max(1, ...models.map((model) => model.total_tokens));

  return (
    <div className="space-y-6">
      {/* 宏观聚焦图表：Top 模型消耗排行，支持切换 Tokens / 请求数 / 预估费用 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ChartColumn className="size-4 text-muted-foreground" />
            {t("overview.models_chart.title")}
          </CardTitle>
          <CardAction>
            <Tabs value={modelMetric} onValueChange={(v) => v && setModelMetric(v as ModelMetric)}>
              <TabsList className="h-8">
                <TabsTrigger value="tokens" className="px-2.5 text-xs">
                  {t("overview.models_chart.tab_tokens")}
                </TabsTrigger>
                <TabsTrigger value="requests" className="px-2.5 text-xs">
                  {t("overview.models_chart.tab_requests")}
                </TabsTrigger>
                <TabsTrigger value="cost" className="px-2.5 text-xs">
                  {t("overview.models_chart.tab_cost")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardAction>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ModelBarChart models={models} metric={modelMetric} pricingTable={pricing.table} />
          )}
        </CardContent>
      </Card>

      <TableSection
        icon={<ChartColumn />}
        title={t("overview.models.title")}
        meta={t("overview.models.count", { count: models.length })}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-center">{t("overview.models.th.index")}</TableHead>
              <TableHead>{t("overview.models.th.model")}</TableHead>
              <TableHead>{t("overview.models.th.provider")}</TableHead>
              <TableHead className="text-right">{t("overview.models.th.requests")}</TableHead>
              <TableHead className="text-right">{t("overview.models.th.tokens")}</TableHead>
              <TableHead className="text-right">{t("overview.models.th.reasoning_cache")}</TableHead>
              <TableHead className="text-right">{t("overview.models.th.price")}</TableHead>
              <TableHead className="text-right">{t("overview.models.th.cost")}</TableHead>
              <TableHead className="text-right">{t("overview.models.th.latency")}</TableHead>
              <TableHead className="w-24 text-right">{t("overview.models.th.share")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              MODEL_SKELETON_ROWS.map((row) => (
                <TableRow key={row}>
                  <TableCell colSpan={10}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : models.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                  {t("overview.models.empty")}
                </TableCell>
              </TableRow>
            ) : (
              models.slice(0, 15).map((model, index) => {
                const details = groupCostDetails(pricing.table, model);
                const share = (model.total_tokens / maxModelTokens) * 100;

                return (
                  <TableRow key={`${model.name}${model.secondary ?? ""}`}>
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="max-w-44 truncate font-medium" title={model.name}>
                      {model.name || "-"}
                    </TableCell>
                    <TableCell className="max-w-24 truncate text-muted-foreground" title={model.secondary || ""}>
                      {model.secondary || "-"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                      {formatNumber(model.requests)}
                      {model.failed > 0 && (
                        <span className="ml-1 text-xs text-destructive">
                          ({t("overview.kpi.failed_count", { count: formatNumber(model.failed) })})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                      <span className="font-semibold">{formatTokens(model.total_tokens)}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        ({formatTokens(model.input_tokens)}/{formatTokens(model.output_tokens)})
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {formatTokens(model.reasoning_tokens)} / {formatTokens(model.cache_read_tokens)} /{" "}
                      {formatTokens(model.cache_creation_tokens)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      <PriceCell
                        match={details?.match}
                        onEdit={() =>
                          setEditing({
                            modelName: model.name,
                            price: details?.match.price ?? null,
                            isCustom: details?.match.matchType === "custom",
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                      {details ? (
                        <Tooltip>
                          <TooltipTrigger render={<span className="cursor-help font-semibold" />}>
                            {formatCost(details.cost)}
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-0.5 font-mono tabular-nums">
                              <div>
                                {t("pricing.breakdown.input")}: {formatCost(details.breakdown.uncachedCost)}
                              </div>
                              <div>
                                {t("pricing.breakdown.output")}: {formatCost(details.breakdown.outputCost)}
                              </div>
                              {details.breakdown.reasoningCost > 0 && (
                                <div>
                                  {t("pricing.breakdown.reasoning")}: {formatCost(details.breakdown.reasoningCost)}
                                </div>
                              )}
                              {details.breakdown.cacheReadCost > 0 && (
                                <div>
                                  {t("pricing.breakdown.cache_read")}: {formatCost(details.breakdown.cacheReadCost)}
                                </div>
                              )}
                              {details.breakdown.cacheReadSavings > 0 && (
                                <div className="text-background/70">
                                  {t("pricing.breakdown.savings", {
                                    value: formatCost(details.breakdown.cacheReadSavings),
                                  })}
                                </div>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-muted-foreground">
                      {formatDuration(model.avg_latency_ms)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-chart-1"
                            style={{ width: `${Math.max(2, Math.round(share))}%` }}
                          />
                        </div>
                        <span className="w-9 text-right font-mono text-xs tabular-nums text-muted-foreground">
                          {share.toFixed(0)}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableSection>

      {editing && (
        <CustomPriceModal
          open
          modelName={editing.modelName}
          currentPrice={editing.price}
          isCustom={editing.isCustom}
          onClose={() => setEditing(null)}
          onSaved={pricing.reload}
        />
      )}
    </div>
  );
}

/** 凭据用量：客户端 Key 用量 + 上游凭据用量 */
export function OverviewCredentials({ summary, loading }: OverviewSectionProps) {
  const { t } = useI18n();
  const { formatNumber, formatTokens } = useFormat();
  const { copied, copy } = useCopyFeedback();

  const apiKeys = summary?.api_key_stats ?? [];
  const auths = summary?.auth_stats ?? [];
  const [keyMetric, setKeyMetric] = useState<"total_tokens" | "requests">("total_tokens");
  const [authMetric, setAuthMetric] = useState<"total_tokens" | "requests">("total_tokens");

  return (
    <div className="space-y-6">
      {/* 宏观图表：客户端 Key 与上游凭据分布对比 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <KeyRound className="size-4 text-muted-foreground" />
              {t("overview.credentials_chart.keys_title")}
            </CardTitle>
            <CardAction>
              <Tabs value={keyMetric} onValueChange={(v) => v && setKeyMetric(v as typeof keyMetric)}>
                <TabsList className="h-7">
                  <TabsTrigger value="total_tokens" className="px-2 text-xs">
                    {t("overview.credentials_chart.tab_tokens")}
                  </TabsTrigger>
                  <TabsTrigger value="requests" className="px-2 text-xs">
                    {t("overview.credentials_chart.tab_requests")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardAction>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-56 w-full" /> : <DonutChart stats={apiKeys} metric={keyMetric} />}
          </CardContent>
        </Card>

        {auths.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ServerCog className="size-4 text-muted-foreground" />
                {t("overview.credentials_chart.auths_title")}
              </CardTitle>
              <CardAction>
                <Tabs value={authMetric} onValueChange={(v) => v && setAuthMetric(v as typeof authMetric)}>
                  <TabsList className="h-7">
                    <TabsTrigger value="total_tokens" className="px-2 text-xs">
                      {t("overview.credentials_chart.tab_tokens")}
                    </TabsTrigger>
                    <TabsTrigger value="requests" className="px-2 text-xs">
                      {t("overview.credentials_chart.tab_requests")}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardAction>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-56 w-full" /> : <DonutChart stats={auths} metric={authMetric} />}
            </CardContent>
          </Card>
        )}
      </div>

      {/* 客户端 Key 用量 */}
      <TableSection
        icon={<KeyRound />}
        title={t("overview.keys.title")}
        meta={t("overview.keys.count", { count: apiKeys.length })}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("overview.keys.th.key")}</TableHead>
              <TableHead className="text-right">{t("overview.keys.th.requests")}</TableHead>
              <TableHead className="text-right">{t("overview.keys.th.failed")}</TableHead>
              <TableHead className="text-right">{t("overview.keys.th.tokens")}</TableHead>
              <TableHead className="text-right">{t("overview.keys.th.latency")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              KEY_SKELETON_ROWS.map((row) => (
                <TableRow key={row}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : apiKeys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  {t("overview.keys.empty")}
                </TableCell>
              </TableRow>
            ) : (
              apiKeys.slice(0, 15).map((key, index) => (
                <TableRow key={key.name || index}>
                  <TableCell className="font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="max-w-48 truncate" title={key.name}>
                        {maskApiKey(key.name)}
                      </span>
                      {key.name && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          title={t("overview.keys.copy_key")}
                          aria-label={t("overview.keys.copy_key")}
                          onClick={() => copy(key.name)}
                        >
                          {copied === key.name ? <Check className="text-primary" /> : <Copy />}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                    {formatNumber(key.requests)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                    {key.failed > 0 ? (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <AlertCircle className="size-3" />
                        {formatNumber(key.failed)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                    {formatTokens(key.total_tokens)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-muted-foreground">
                    {formatDuration(key.avg_latency_ms)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableSection>

      {/* 上游凭据用量 */}
      {auths.length > 0 && (
        <TableSection
          icon={<ServerCog />}
          title={t("overview.auths.title")}
          meta={t("overview.auths.count", { count: auths.length })}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("overview.auths.th.auth")}</TableHead>
                <TableHead className="text-right">{t("overview.auths.th.requests")}</TableHead>
                <TableHead className="text-right">{t("overview.auths.th.failed")}</TableHead>
                <TableHead className="text-right">{t("overview.auths.th.tokens")}</TableHead>
                <TableHead className="text-right">{t("overview.auths.th.cache")}</TableHead>
                <TableHead className="text-right">{t("overview.auths.th.latency")}</TableHead>
                <TableHead className="text-right">{t("overview.auths.th.p95")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auths.map((auth) => (
                <TableRow key={`${auth.name}-${auth.secondary ?? ""}`}>
                  <TableCell className="font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="max-w-56 truncate" title={auth.name}>
                        {displayAuthName(auth.name)}
                      </span>
                      {auth.secondary && (
                        <span className="shrink-0 text-xs text-muted-foreground">#{auth.secondary}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                    {formatNumber(auth.requests)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                    {auth.failed > 0 ? (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <AlertCircle className="size-3" />
                        {formatNumber(auth.failed)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                    {formatTokens(auth.total_tokens)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-muted-foreground">
                    {formatTokens(auth.cache_read_tokens)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-muted-foreground">
                    {formatDuration(auth.avg_latency_ms)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-muted-foreground">
                    {formatDuration(auth.p95_latency_ms)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableSection>
      )}
    </div>
  );
}

/** 诊断：失败诊断 + 会话排行 */
export function OverviewDiagnostics({ summary, loading }: OverviewSectionProps) {
  const { t } = useI18n();
  const { formatNumber, formatTokens } = useFormat();
  const { copied, copy } = useCopyFeedback();

  const sessions = summary?.session_stats ?? [];

  return (
    <div className="space-y-6">
      {/* 失败诊断 */}
      <TableSection
        icon={<ShieldAlert />}
        title={t("failures.title")}
        meta={t("failures.count", { count: formatNumber(summary?.failed_requests ?? 0) })}
      >
        {loading ? (
          <div className="space-y-2">
            {KEY_SKELETON_ROWS.map((row) => (
              <Skeleton key={row} className="h-5 w-full" />
            ))}
          </div>
        ) : (
          <FailurePanel failures={summary?.failure_stats ?? []} totalFailed={summary?.failed_requests ?? 0} />
        )}
      </TableSection>

      {/* 会话排行 */}
      {sessions.length > 0 && (
        <TableSection
          icon={<MessagesSquare />}
          title={t("overview.sessions.title")}
          meta={t("overview.sessions.count", { count: sessions.length })}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("overview.sessions.th.session")}</TableHead>
                <TableHead className="text-right">{t("overview.sessions.th.requests")}</TableHead>
                <TableHead className="text-right">{t("overview.sessions.th.tokens")}</TableHead>
                <TableHead className="text-right">{t("overview.sessions.th.avg_tokens")}</TableHead>
                <TableHead className="text-right">{t("overview.sessions.th.cache")}</TableHead>
                <TableHead className="text-right">{t("overview.sessions.th.latency")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.slice(0, 15).map((session) => (
                <TableRow key={session.name}>
                  <TableCell className="font-mono text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="max-w-56 truncate" title={session.name}>
                        {session.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        title={t("common.copy")}
                        aria-label={t("common.copy")}
                        onClick={() => copy(session.name)}
                      >
                        {copied === session.name ? <Check className="text-primary" /> : <Copy />}
                      </Button>
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                    {formatNumber(session.requests)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
                    {formatTokens(session.total_tokens)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-muted-foreground">
                    {formatTokens(session.requests > 0 ? session.total_tokens / session.requests : 0)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-muted-foreground">
                    {formatTokens(session.cache_read_tokens)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-muted-foreground">
                    {formatDuration(session.avg_latency_ms)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableSection>
      )}
    </div>
  );
}

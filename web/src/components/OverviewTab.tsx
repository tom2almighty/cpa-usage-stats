import {
  Activity,
  AlertCircle,
  ChartColumn,
  Check,
  CircleDollarSign,
  Clock,
  Copy,
  Database,
  KeyRound,
  Layers,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { CustomPriceModal } from "@/components/CustomPriceModal";
import { DonutChart } from "@/components/charts/DonutChart";
import { TrendChart } from "@/components/charts/TrendChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PricingState } from "@/hooks/use-pricing";
import { useI18n } from "@/i18n/context";
import { groupCostDetails, type ModelPrice, type PriceMatch, totalCost } from "@/lib/pricing";
import {
  copyToClipboard,
  formatCost,
  formatDuration,
  formatNumber,
  formatPercent,
  formatTokens,
  formatUnitPrice,
  maskApiKey,
} from "@/lib/utils";
import type { SummaryData } from "@/types";

const MODEL_SKELETON_ROWS = ["model-a", "model-b", "model-c", "model-d"];
const KEY_SKELETON_ROWS = ["key-a", "key-b", "key-c"];

interface OverviewTabProps {
  summary: SummaryData | null;
  loading: boolean;
  pricing: PricingState;
}

function MetricCard({
  title,
  icon,
  value,
  sub,
  loading = false,
}: {
  title: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  sub: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Card size="sm">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-xs font-normal text-muted-foreground">{title}</CardTitle>
        <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        ) : (
          <>
            <div className="truncate font-mono text-xl font-semibold tabular-nums">{value}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">{sub}</div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** 模型价格单元格：已匹配时展示单价并可点击改价，未匹配时提示设置。 */
function PriceCell({ match, onEdit }: { match?: PriceMatch | null; onEdit: () => void }) {
  const { t } = useI18n();
  if (!match) {
    return (
      <Button variant="link" size="xs" className="text-muted-foreground" onClick={onEdit}>
        {t("overview.models.set_price")}
      </Button>
    );
  }

  const label = `${formatUnitPrice(match.price.input)} / ${formatUnitPrice(match.price.output)}`;
  const content =
    match.matchType === "custom" ? (
      <Badge variant="secondary" className="gap-1">
        {t("overview.models.custom_badge")}
        <span className="font-mono">{label}</span>
      </Badge>
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

  return (
    <Button variant="ghost" size="xs" className="font-mono" onClick={onEdit} title={t("pricing.dialog.title")}>
      {content}
    </Button>
  );
}

export function OverviewTab({ summary, loading, pricing }: OverviewTabProps) {
  const { t } = useI18n();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ modelName: string; price: ModelPrice | null; isCustom: boolean } | null>(
    null,
  );

  const models = summary?.model_stats ?? [];
  const apiKeys = summary?.api_key_stats ?? [];
  const maxModelTokens = Math.max(1, ...models.map((model) => model.total_tokens));
  const hourly = summary?.bucket === "hour";
  const costs = totalCost(pricing.table, models);

  const handleCopy = async (key: string) => {
    if (!(await copyToClipboard(key))) return;
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
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
        <MetricCard
          title={t("overview.kpi.tokens")}
          icon={<Zap />}
          loading={loading}
          value={formatTokens(summary?.total_tokens ?? 0)}
          sub={
            <span className="truncate">
              {t("overview.kpi.tokens_raw", { count: formatNumber(summary?.total_tokens ?? 0) })}
            </span>
          }
        />
        <MetricCard
          title={t("overview.kpi.io_tokens")}
          icon={<Layers />}
          loading={loading}
          value={`${formatTokens(summary?.input_tokens ?? 0)} / ${formatTokens(summary?.output_tokens ?? 0)}`}
          sub={
            <>
              <span>{t("overview.kpi.reasoning", { value: formatTokens(summary?.reasoning_tokens ?? 0) })}</span>
              <span>·</span>
              <span>{t("overview.kpi.cache_read", { value: formatTokens(summary?.cache_read_tokens ?? 0) })}</span>
              <span>·</span>
              <span>{t("overview.kpi.cache_write", { value: formatTokens(summary?.cache_creation_tokens ?? 0) })}</span>
            </>
          }
        />
        <MetricCard
          title={t("overview.kpi.latency")}
          icon={<Clock />}
          loading={loading}
          value={formatDuration(summary?.avg_latency_ms ?? 0)}
          sub={<span>{t("overview.kpi.ttft", { value: formatDuration(summary?.avg_ttft_ms ?? 0) })}</span>}
        />
        <MetricCard
          title={t("overview.kpi.cost")}
          icon={<CircleDollarSign />}
          loading={loading || pricing.loading}
          value={pricing.table ? formatCost(costs.cost) : "-"}
          sub={
            !pricing.table && !pricing.loading ? (
              <span>{t("overview.kpi.pricing_unavailable")}</span>
            ) : costs.total > 0 ? (
              <span className="truncate">{t("overview.kpi.priced", { priced: costs.priced, total: costs.total })}</span>
            ) : (
              <span>{t("overview.kpi.no_cost_data")}</span>
            )
          }
        />
      </div>

      {/* 趋势 + Provider 分布 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingUp className="size-4 text-muted-foreground" />
              {hourly ? t("overview.trend.hourly") : t("overview.trend.daily")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <TrendChart points={summary?.trend ?? []} hourly={hourly} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="size-4 text-muted-foreground" />
              {t("overview.provider.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <DonutChart stats={summary?.provider_stats ?? []} metric="total_tokens" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 模型排行 */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ChartColumn className="size-4 text-muted-foreground" />
            {t("overview.models.title")}
          </CardTitle>
          <span className="text-xs text-muted-foreground">{t("overview.models.count", { count: models.length })}</span>
        </CardHeader>
        <CardContent className="px-0">
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
                <TableHead className="w-24">{t("overview.models.th.share")}</TableHead>
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
                    <TableRow key={`${model.name} ${model.secondary ?? ""}`}>
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="max-w-48 truncate font-medium">{model.name || "-"}</TableCell>
                      <TableCell>
                        {model.secondary ? (
                          <Badge variant="outline" className="font-normal">
                            {model.secondary}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatNumber(model.requests)}
                        {model.failed > 0 && (
                          <span className="ml-1 text-xs text-destructive">
                            ({t("overview.kpi.failed_count", { count: formatNumber(model.failed) })})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        <span className="font-semibold">{formatTokens(model.total_tokens)}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          ({formatTokens(model.input_tokens)}/{formatTokens(model.output_tokens)})
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
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
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
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
        </CardContent>
      </Card>

      {/* 客户端 Key 用量 */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <KeyRound className="size-4 text-muted-foreground" />
            {t("overview.keys.title")}
          </CardTitle>
          <span className="text-xs text-muted-foreground">{t("overview.keys.count", { count: apiKeys.length })}</span>
        </CardHeader>
        <CardContent className="px-0">
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
                        <span title={key.name}>{maskApiKey(key.name)}</span>
                        {key.name && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="text-muted-foreground hover:text-foreground"
                            title={t("overview.keys.copy_key")}
                            aria-label={t("overview.keys.copy_key")}
                            onClick={() => handleCopy(key.name)}
                          >
                            {copiedKey === key.name ? <Check className="text-primary" /> : <Copy />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatNumber(key.requests)}</TableCell>
                    <TableCell className="text-right">
                      {key.failed > 0 ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle />
                          {formatNumber(key.failed)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatTokens(key.total_tokens)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                      {formatDuration(key.avg_latency_ms)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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

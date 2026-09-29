import * as React from 'react';
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
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { CustomPriceModal } from '@/components/CustomPriceModal';
import { DonutChart } from '@/components/charts/DonutChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { groupCostDetails, type ModelPrice, type PricingState, totalCost } from '@/lib/pricing';
import {
  copyToClipboard,
  formatCost,
  formatDuration,
  formatNumber,
  formatPercent,
  formatTokens,
  formatUnitPrice,
  maskApiKey,
} from '@/lib/utils';
import type { SummaryData } from '@/types';

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
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {loading ? (
          <div className="space-y-2 py-1">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-36" />
          </div>
        ) : (
          <>
            <div className="truncate text-2xl font-bold">{value}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              {sub}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function OverviewTab({ summary, loading, pricing }: OverviewTabProps) {
  const models = summary?.model_stats ?? [];
  const maxModelTokens = Math.max(1, ...models.map((m) => m.total_tokens));
  const hourly = summary?.bucket === 'hour';
  const costs = totalCost(pricing.table, models);

  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const [customModal, setCustomModal] = React.useState<{
    modelName: string;
    currentPrice?: ModelPrice | null;
    isCustom?: boolean;
  } | null>(null);

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(text);
      setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <MetricCard
          title="总请求数"
          icon={<Activity className="h-4 w-4" />}
          loading={loading}
          value={formatNumber(summary?.total_requests ?? 0)}
          sub={
            <>
              <span className="font-medium text-foreground">
                {formatPercent(summary?.success_rate ?? 100)}
              </span>
              <span>成功率</span>
              {summary && summary.failed_requests > 0 && (
                <span className="ml-1 text-destructive font-medium">
                  ({formatNumber(summary.failed_requests)} 失败)
                </span>
              )}
            </>
          }
        />
        <MetricCard
          title="Token 总消耗"
          icon={<Zap className="h-4 w-4" />}
          loading={loading}
          value={formatTokens(summary?.total_tokens ?? 0)}
          sub={<span className="truncate">{formatNumber(summary?.total_tokens ?? 0)} tokens</span>}
        />
        <MetricCard
          title="输入 / 输出 Tokens"
          icon={<Layers className="h-4 w-4" />}
          loading={loading}
          value={`${formatTokens(summary?.input_tokens ?? 0)} / ${formatTokens(summary?.output_tokens ?? 0)}`}
          sub={
            <>
              <span>思考 {formatTokens(summary?.reasoning_tokens ?? 0)}</span>
              <span>·</span>
              <span>缓存读 {formatTokens(summary?.cache_read_tokens ?? 0)}</span>
              <span>·</span>
              <span>缓存写 {formatTokens(summary?.cache_creation_tokens ?? 0)}</span>
            </>
          }
        />
        <MetricCard
          title="平均响应 / 首字延迟"
          icon={<Clock className="h-4 w-4" />}
          loading={loading}
          value={formatDuration(summary?.avg_latency_ms ?? 0)}
          sub={<span>TTFT {formatDuration(summary?.avg_ttft_ms ?? 0)}</span>}
        />
        <MetricCard
          title="预估成本"
          icon={<CircleDollarSign className="h-4 w-4" />}
          loading={loading || pricing.loading}
          value={pricing.table ? formatCost(costs.cost) : '-'}
          sub={
            !pricing.table && !pricing.loading ? (
              <span>价格数据不可用</span>
            ) : costs.total > 0 ? (
              <span className="truncate">
                {costs.priced}/{costs.total} 个模型已匹配价格
              </span>
            ) : (
              <span>暂无价格数据</span>
            )
          }
        />
      </div>

      {/* Trend + provider distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="border-b p-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              {hourly ? '按小时走势' : '按天走势'}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {loading ? (
              <div className="flex h-48 items-center justify-center">
                <Skeleton className="h-40 w-full" />
              </div>
            ) : (
              <TrendChart points={summary?.trend ?? []} hourly={hourly} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b p-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-4 w-4 text-muted-foreground" />
              Provider 分布
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {loading ? (
              <div className="flex h-40 items-center justify-center">
                <Skeleton className="h-32 w-32 rounded-full" />
              </div>
            ) : (
              <DonutChart stats={summary?.provider_stats ?? []} metric="total_tokens" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Model ranking */}
      <Card>
        <CardHeader className="border-b p-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ChartColumn className="h-4 w-4 text-muted-foreground" />
              模型用量排行
            </CardTitle>
            <span className="text-xs text-muted-foreground">共 {models.length} 项</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>模型</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">请求数</TableHead>
                <TableHead className="text-right">Tokens（入/出）</TableHead>
                <TableHead className="text-right">思考 / 缓存读写</TableHead>
                <TableHead className="text-right">价格 (入/出 · 1M)</TableHead>
                <TableHead className="text-right">预估成本</TableHead>
                <TableHead className="text-right">平均延迟</TableHead>
                <TableHead className="w-28">占比</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <TableRow key={`model-skel-${idx}`}>
                    <TableCell colSpan={10} className="p-3">
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : models.length > 0 ? (
                models.slice(0, 15).map((m, idx) => {
                  const details = groupCostDetails(pricing.table, m);
                  const match = details?.match;
                  const isCustom = match?.matchType === 'custom';
                  const isFuzzy = match?.matchType === 'fuzzy';

                  return (
                    <TableRow key={`${m.name}-${m.secondary}-${idx}`}>
                      <TableCell className="text-center font-mono text-[11px] text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="max-w-44 truncate">{m.name || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {m.secondary ? (
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                            {m.secondary}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatNumber(m.requests)}
                        {m.failed > 0 && (
                          <span className="ml-1 text-[10px] text-destructive">
                            ({formatNumber(m.failed)} 失败)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <span className="font-semibold">{formatTokens(m.total_tokens)}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          ({formatTokens(m.input_tokens)}/{formatTokens(m.output_tokens)})
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-muted-foreground">
                        {formatTokens(m.reasoning_tokens)} / {formatTokens(m.cache_read_tokens)} /{' '}
                        {formatTokens(m.cache_creation_tokens)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono text-[11px]">
                        {match ? (
                          <button
                            type="button"
                            onClick={() =>
                              setCustomModal({
                                modelName: m.name,
                                currentPrice: match.price,
                                isCustom,
                              })
                            }
                            className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                            title="点击自定义/修改模型价格"
                          >
                            {isCustom ? (
                              <Badge
                                variant="secondary"
                                className="px-1 py-0 text-[9px] border-primary/30 text-primary"
                              >
                                自定义
                              </Badge>
                            ) : isFuzzy ? (
                              <Tooltip content={`模糊匹配自: ${match.providerId}/${match.modelId}`}>
                                <span className="text-muted-foreground">~</span>
                              </Tooltip>
                            ) : null}
                            <span>
                              {formatUnitPrice(match.price.input)} /{' '}
                              {formatUnitPrice(match.price.output)}
                            </span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setCustomModal({
                                modelName: m.name,
                                currentPrice: null,
                                isCustom: false,
                              })
                            }
                            className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-primary cursor-pointer"
                          >
                            未定价 (设置)
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono">
                        {details ? (
                          <Tooltip
                            content={
                              <div className="space-y-1 text-left font-mono text-[11px]">
                                <div>输入: {formatCost(details.breakdown.uncachedCost)}</div>
                                <div>输出: {formatCost(details.breakdown.outputCost)}</div>
                                {details.breakdown.reasoningCost > 0 && (
                                  <div>思考: {formatCost(details.breakdown.reasoningCost)}</div>
                                )}
                                {details.breakdown.cacheReadCost > 0 && (
                                  <div>缓存读: {formatCost(details.breakdown.cacheReadCost)}</div>
                                )}
                                {details.breakdown.cacheReadSavings > 0 && (
                                  <div className="text-muted-foreground">
                                    (缓存节省 ~{formatCost(details.breakdown.cacheReadSavings)})
                                  </div>
                                )}
                              </div>
                            }
                          >
                            <span className="cursor-help font-semibold">
                              {formatCost(details.cost)}
                            </span>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground font-mono">
                        {formatDuration(m.avg_latency_ms)}
                      </TableCell>
                      <TableCell>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{
                              width: `${Math.max(2, Math.round((m.total_tokens / maxModelTokens) * 100))}%`,
                            }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={10} className="p-6 text-center text-muted-foreground">
                    暂无统计数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* API key usage */}
      <Card>
        <CardHeader className="border-b p-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              客户端 Key 用量
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              共 {summary?.api_key_stats.length ?? 0} 个
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>API Key (已脱敏)</TableHead>
                <TableHead className="text-right">请求数</TableHead>
                <TableHead className="text-right">失败数</TableHead>
                <TableHead className="text-right">总 Tokens</TableHead>
                <TableHead className="text-right">平均延迟</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <TableRow key={`key-skel-${idx}`}>
                    <TableCell colSpan={5} className="p-3">
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : summary && summary.api_key_stats.length > 0 ? (
                summary.api_key_stats.slice(0, 15).map((k, idx) => (
                  <TableRow key={k.name || idx}>
                    <TableCell className="font-mono font-medium">
                      <div className="flex items-center gap-2">
                        <span title={k.name || '-'}>{maskApiKey(k.name || '-')}</span>
                        {k.name && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => handleCopy(k.name)}
                            title="复制完整 Key"
                          >
                            {copiedKey === k.name ? (
                              <Check className="h-3 w-3 text-primary" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatNumber(k.requests)}
                    </TableCell>
                    <TableCell className="text-right">
                      {k.failed > 0 ? (
                        <Badge variant="destructive" className="gap-1 px-1.5 py-0 text-[10px]">
                          <AlertCircle className="h-3 w-3" />
                          {formatNumber(k.failed)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatTokens(k.total_tokens)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground font-mono">
                      {formatDuration(k.avg_latency_ms)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="p-6 text-center text-muted-foreground">
                    暂无数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Custom Price Modal */}
      {customModal && (
        <CustomPriceModal
          open={Boolean(customModal)}
          modelName={customModal.modelName}
          currentPrice={customModal.currentPrice}
          isCustom={customModal.isCustom}
          onClose={() => setCustomModal(null)}
        />
      )}
    </div>
  );
}

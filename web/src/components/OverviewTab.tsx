import type * as React from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Clock,
  Database,
  KeyRound,
  Layers,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DonutChart } from '@/components/charts/DonutChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { formatDuration, formatNumber, formatPercent, formatTokens } from '@/lib/utils';
import type { SummaryData } from '@/types';

interface OverviewTabProps {
  summary: SummaryData | null;
  loading: boolean;
}

function MetricCard({
  title,
  icon,
  value,
  sub,
  accent,
}: {
  title: string;
  icon: React.ReactNode;
  value: string;
  sub: React.ReactNode;
  accent: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 p-4 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <span className={accent}>{icon}</span>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="truncate text-2xl font-bold">{value}</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

export function OverviewTab({ summary, loading }: OverviewTabProps) {
  const models = summary?.model_stats ?? [];
  const maxModelTokens = Math.max(1, ...models.map((m) => m.total_tokens));
  const hourly = summary?.bucket === 'hour';

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <MetricCard
          title="总请求数"
          icon={<Activity className="h-4 w-4" />}
          accent="text-muted-foreground"
          value={loading ? '…' : formatNumber(summary?.total_requests ?? 0)}
          sub={
            <>
              <span className="font-medium text-emerald-500">
                {formatPercent(summary?.success_rate ?? 100)}
              </span>
              <span>成功率</span>
              {summary && summary.failed_requests > 0 && (
                <span className="ml-1 text-rose-500">
                  ({formatNumber(summary.failed_requests)} 失败)
                </span>
              )}
            </>
          }
        />
        <MetricCard
          title="Token 总消耗"
          icon={<Zap className="h-4 w-4" />}
          accent="text-amber-500"
          value={loading ? '…' : formatTokens(summary?.total_tokens ?? 0)}
          sub={<span className="truncate">{formatNumber(summary?.total_tokens ?? 0)} tokens</span>}
        />
        <MetricCard
          title="输入 / 输出 Tokens"
          icon={<Layers className="h-4 w-4" />}
          accent="text-blue-500"
          value={
            loading
              ? '…'
              : `${formatTokens(summary?.input_tokens ?? 0)} / ${formatTokens(summary?.output_tokens ?? 0)}`
          }
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
          accent="text-indigo-500"
          value={loading ? '…' : formatDuration(summary?.avg_latency_ms ?? 0)}
          sub={<span>TTFT {formatDuration(summary?.avg_ttft_ms ?? 0)}</span>}
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
            <TrendChart points={summary?.trend ?? []} hourly={hourly} />
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
            <DonutChart stats={summary?.provider_stats ?? []} metric="total_tokens" />
          </CardContent>
        </Card>
      </div>

      {/* Model ranking */}
      <Card>
        <CardHeader className="border-b p-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              模型用量排行
            </CardTitle>
            <span className="text-xs text-muted-foreground">共 {models.length} 项</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/50 font-medium text-muted-foreground">
                <tr>
                  <th className="p-3">模型</th>
                  <th className="p-3">Provider</th>
                  <th className="p-3 text-right">请求数</th>
                  <th className="p-3 text-right">Tokens（入/出）</th>
                  <th className="p-3 text-right">思考 / 缓存读 / 缓存写</th>
                  <th className="p-3 text-right">平均延迟</th>
                  <th className="p-3" style={{ width: 120 }}>
                    占比
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {models.length > 0 ? (
                  models.slice(0, 12).map((m, idx) => (
                    <tr
                      key={`${m.name}-${m.secondary}-${idx}`}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-1.5">
                          <span className="w-4 text-[10px] text-muted-foreground">{idx + 1}</span>
                          <span className="max-w-44 truncate">{m.name || '-'}</span>
                        </div>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {m.secondary ? (
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                            {m.secondary}
                          </Badge>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="p-3 text-right font-medium">
                        {formatNumber(m.requests)}
                        {m.failed > 0 && (
                          <span className="ml-1 text-[10px] text-rose-500">
                            ({formatNumber(m.failed)} 失败)
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono">
                        <span className="font-semibold">{formatTokens(m.total_tokens)}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          ({formatTokens(m.input_tokens)}/{formatTokens(m.output_tokens)})
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono text-[11px] text-muted-foreground">
                        {formatTokens(m.reasoning_tokens)} / {formatTokens(m.cache_read_tokens)} /{' '}
                        {formatTokens(m.cache_creation_tokens)}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">
                        {formatDuration(m.avg_latency_ms)}
                      </td>
                      <td className="p-3">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{
                              width: `${Math.max(2, Math.round((m.total_tokens / maxModelTokens) * 100))}%`,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      暂无统计数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/50 font-medium text-muted-foreground">
                <tr>
                  <th className="p-3">API Key</th>
                  <th className="p-3 text-right">请求数</th>
                  <th className="p-3 text-right">失败</th>
                  <th className="p-3 text-right">Tokens</th>
                  <th className="p-3 text-right">平均延迟</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summary && summary.api_key_stats.length > 0 ? (
                  summary.api_key_stats.slice(0, 10).map((k, idx) => (
                    <tr key={k.name || idx} className="transition-colors hover:bg-muted/30">
                      <td className="max-w-56 truncate p-3 font-mono font-medium">
                        {k.name || '-'}
                      </td>
                      <td className="p-3 text-right font-medium">{formatNumber(k.requests)}</td>
                      <td className="p-3 text-right">
                        {k.failed > 0 ? (
                          <Badge variant="destructive" className="gap-1 px-1.5 py-0 text-[10px]">
                            <AlertCircle className="h-3 w-3" />
                            {formatNumber(k.failed)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono">{formatTokens(k.total_tokens)}</td>
                      <td className="p-3 text-right text-muted-foreground">
                        {formatDuration(k.avg_latency_ms)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

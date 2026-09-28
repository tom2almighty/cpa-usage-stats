import * as React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  formatCost,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatTokens,
  formatUnitPrice,
} from '@/lib/utils';
import { recordCost, type PricingState } from '@/lib/pricing';
import type { OptionsResponse, RecordListResponse, RecordsFilters } from '@/types';

interface RecordsTabProps {
  data: RecordListResponse | null;
  loading: boolean;
  options: OptionsResponse;
  filters: RecordsFilters;
  onFiltersChange: (filters: RecordsFilters) => void;
  page: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  pricing: PricingState;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      <span className="block break-all font-mono text-[11px]">{children || '-'}</span>
    </div>
  );
}

export function RecordsTab({
  data,
  loading,
  options,
  filters,
  onFiltersChange,
  page,
  onPageChange,
  pageSize,
  pricing,
}: RecordsTabProps) {
  const [expandedId, setExpandedId] = React.useState<number | null>(null);
  // Keyword is kept local and debounced so typing does not fire a query per key.
  const [keyword, setKeyword] = React.useState(filters.keyword);
  React.useEffect(() => {
    if (keyword === filters.keyword) return;
    const t = setTimeout(() => onFiltersChange({ ...filters, keyword: keyword.trim() }), 300);
    return () => clearTimeout(t);
  }, [keyword, filters, onFiltersChange]);

  const set = (patch: Partial<RecordsFilters>) => {
    onFiltersChange({ ...filters, ...patch });
    onPageChange(1);
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader className="space-y-4 border-b p-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Layers className="h-4 w-4 text-muted-foreground" />
            调用明细日志
          </CardTitle>
          <span className="text-xs text-muted-foreground">共找到 {formatNumber(total)} 条记录</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索 Key / 模型 / Request / Trace / Session…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="h-9 pl-8 text-xs"
            />
          </div>
          <Select
            value={filters.model}
            onChange={(e) => set({ model: e.target.value })}
            className="h-9 text-xs"
          >
            <option value="">全部模型</option>
            {options.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <Select
            value={filters.provider}
            onChange={(e) => set({ provider: e.target.value })}
            className="h-9 text-xs"
          >
            <option value="">全部 Provider</option>
            {options.providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <Select
            value={filters.apiKey}
            onChange={(e) => set({ apiKey: e.target.value })}
            className="h-9 text-xs"
          >
            <option value="">全部 Key</option>
            {options.api_keys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </Select>
          <Select
            value={filters.status}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'all' || v === 'success' || v === 'failed') set({ status: v });
            }}
            className="h-9 text-xs"
          >
            <option value="all">全部状态</option>
            <option value="success">仅成功</option>
            <option value="failed">仅失败</option>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-muted/50 font-medium text-muted-foreground">
              <tr>
                <th className="w-8 p-3" />
                <th className="p-3">时间</th>
                <th className="p-3">状态</th>
                <th className="p-3">模型</th>
                <th className="p-3">Provider</th>
                <th className="p-3 text-right">Tokens（入/出/总）</th>
                <th className="p-3 text-right">预估成本</th>
                <th className="p-3 text-right">耗时 / TTFT</th>
                <th className="p-3">Key / 认证</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.length > 0 ? (
                items.map((r) => {
                  const isExpanded = expandedId === r.id;
                  const cost = recordCost(pricing.table, r);
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        tabIndex={0}
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setExpandedId(isExpanded ? null : r.id);
                          }
                        }}
                        className="cursor-pointer transition-colors hover:bg-muted/30 focus:bg-muted/40 focus:outline-none"
                      >
                        <td className="p-3 text-muted-foreground">
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </td>
                        <td className="whitespace-nowrap p-3 font-mono text-[11px] text-muted-foreground">
                          {formatDateTime(r.requested_at)}
                        </td>
                        <td className="p-3">
                          {r.failed ? (
                            <Badge variant="destructive" className="gap-1 px-1.5 py-0 text-[10px]">
                              <AlertCircle className="h-3 w-3" />
                              <span>{r.status_code || 500}</span>
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1 px-1.5 py-0 text-[10px]">
                              <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                              <span>{r.status_code || 200}</span>
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 font-medium">
                          <div className="flex flex-col">
                            <span className="max-w-44 truncate">{r.model}</span>
                            {(r.alias && r.alias !== r.model) ||
                            (r.response_model && r.response_model !== r.model) ? (
                              <span className="max-w-44 truncate text-[10px] text-muted-foreground">
                                {r.alias && r.alias !== r.model ? `别名 ${r.alias}` : ''}
                                {r.alias &&
                                r.alias !== r.model &&
                                r.response_model &&
                                r.response_model !== r.model
                                  ? ' · '
                                  : ''}
                                {r.response_model && r.response_model !== r.model
                                  ? `上游 ${r.response_model}`
                                  : ''}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                            {r.provider || '-'}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-mono">
                          <span className="text-muted-foreground">
                            {formatTokens(r.input_tokens)}
                          </span>{' '}
                          /{' '}
                          <span className="text-muted-foreground">
                            {formatTokens(r.output_tokens)}
                          </span>{' '}
                          / <span className="font-semibold">{formatTokens(r.total_tokens)}</span>
                          {(r.cache_read_tokens > 0 || r.cache_creation_tokens > 0) && (
                            <div className="text-[10px] text-muted-foreground">
                              缓存 读{formatTokens(r.cache_read_tokens)} / 写
                              {formatTokens(r.cache_creation_tokens)}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap p-3 text-right font-mono">
                          {cost ? (
                            <>
                              <div>{formatCost(cost.cost)}</div>
                              <div
                                className="text-[10px] text-muted-foreground"
                                title={`models.dev: ${cost.match.providerId}/${cost.match.modelId}`}
                              >
                                {formatUnitPrice(cost.match.price.input)} /{' '}
                                {formatUnitPrice(cost.match.price.output)}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap p-3 text-right font-mono">
                          <div>{formatDuration(r.latency_ms)}</div>
                          {r.stream && r.ttft_ms > 0 && (
                            <div className="text-[10px] text-muted-foreground">
                              TTFT: {formatDuration(r.ttft_ms)}
                            </div>
                          )}
                        </td>
                        <td className="max-w-32 truncate p-3 font-mono text-[11px] text-muted-foreground">
                          {r.api_key || r.auth_id || '-'}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-muted/20">
                          <td colSpan={9} className="space-y-3 border-b border-t p-4">
                            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-4">
                              <Detail label="Request ID">{r.request_id}</Detail>
                              <Detail label="Trace ID">{r.trace_id}</Detail>
                              <Detail label="Session ID">{r.session_id}</Detail>
                              <Detail label="来源 (Source)">{r.source}</Detail>
                              <Detail label="认证 (Auth)">
                                {[r.auth_id, r.auth_index && `#${r.auth_index}`, r.auth_type]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </Detail>
                              <Detail label="上游 Base URL">{r.base_url}</Detail>
                              <Detail label="推理力度 (Reasoning)">{r.reasoning_effort}</Detail>
                              <Detail label="Service Tier（请求 → 响应）">
                                {r.service_tier || r.response_service_tier
                                  ? `${r.service_tier || '-'} → ${r.response_service_tier || '-'}`
                                  : ''}
                              </Detail>
                              <Detail label="流式 / 生成">
                                {[
                                  r.stream ? '流式' : '非流式',
                                  r.generate ? '生成' : '非生成',
                                ].join(' · ')}
                              </Detail>
                              <Detail label="Tokens 明细">
                                入 {formatNumber(r.input_tokens)} · 出{' '}
                                {formatNumber(r.output_tokens)} · 思考{' '}
                                {formatNumber(r.reasoning_tokens)} · 缓存读{' '}
                                {formatNumber(r.cache_read_tokens)} · 缓存写{' '}
                                {formatNumber(r.cache_creation_tokens)} · 总{' '}
                                {formatNumber(r.total_tokens)}
                              </Detail>
                              <Detail label="模型价格（models.dev）">
                                {cost
                                  ? `${cost.match.providerId}/${cost.match.modelId} · 入 ${formatUnitPrice(cost.match.price.input)} · 出 ${formatUnitPrice(cost.match.price.output)}${
                                      cost.match.price.cacheRead !== undefined
                                        ? ` · 缓存读 ${formatUnitPrice(cost.match.price.cacheRead)}`
                                        : ''
                                    }${
                                      cost.match.price.cacheWrite !== undefined
                                        ? ` · 缓存写 ${formatUnitPrice(cost.match.price.cacheWrite)}`
                                        : ''
                                    }`
                                  : '未匹配到价格'}
                              </Detail>
                              <Detail label="预估成本">{cost ? formatCost(cost.cost) : '-'}</Detail>
                            </div>

                            {r.failure_body && (
                              <div className="mt-2 break-all rounded-md border border-destructive/30 bg-destructive/10 p-2.5 font-mono text-xs text-destructive">
                                <div className="mb-1 text-[11px] font-semibold">
                                  失败响应错误详情:
                                </div>
                                <div>{r.failure_body}</div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    {loading ? '加载中...' : '无匹配记录'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between border-t p-4 text-xs">
            <div className="text-muted-foreground">
              第 {page} 页 / 共 {totalPages} 页 · 每页 {pageSize} 条
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>上一页</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1"
                onClick={() => onPageChange(page + 1)}
                disabled={page >= totalPages}
              >
                <span>下一页</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

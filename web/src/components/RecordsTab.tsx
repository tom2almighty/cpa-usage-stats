import * as React from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Layers,
  RotateCcw,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
import { recordCost, type PricingState } from '@/lib/pricing';
import {
  copyToClipboard,
  formatCost,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatTokens,
  formatUnitPrice,
  maskApiKey,
} from '@/lib/utils';
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

function CopyableDetail({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = async () => {
    if (!value) return;
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <div className="min-w-0 space-y-0.5">
      <span className="block text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 font-mono text-[11px]">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 truncate text-foreground hover:underline"
          >
            <span className="truncate">{value || '-'}</span>
            <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
          </a>
        ) : (
          <span className="truncate break-all">{value || '-'}</span>
        )}
        {value && value !== '-' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            title="复制"
          >
            {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
          </Button>
        )}
      </div>
    </div>
  );
}

function formatJsonSafe(raw: string): string {
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
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
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

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

  const handleCopyKey = async (key: string) => {
    const ok = await copyToClipboard(key);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    }
  };

  const hasActiveFilters =
    Boolean(keyword.trim()) ||
    Boolean(filters.model) ||
    Boolean(filters.provider) ||
    Boolean(filters.apiKey) ||
    filters.status !== 'all';

  const resetFilters = () => {
    setKeyword('');
    onFiltersChange({
      model: '',
      provider: '',
      apiKey: '',
      status: 'all',
      keyword: '',
    });
    onPageChange(1);
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = data?.items ?? [];

  return (
    <Card>
      <CardHeader className="space-y-4 border-b p-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="h-4 w-4 text-muted-foreground" />
              调用明细日志
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              共找到 {formatNumber(total)} 条记录
            </span>
          </div>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              <span>重置筛选</span>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-5">
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
                {maskApiKey(k)}
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
            <option value="success">仅成功 (200)</option>
            <option value="failed">仅失败 (4xx/5xx)</option>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>时间</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>模型</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead className="text-right">Tokens（入 / 出 / 总）</TableHead>
              <TableHead className="text-right">预估成本</TableHead>
              <TableHead className="text-right">耗时 / TTFT</TableHead>
              <TableHead>Key / 认证</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <TableRow key={`row-skel-${idx}`}>
                  <TableCell colSpan={9} className="p-3">
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : items.length > 0 ? (
              items.map((r) => {
                const isExpanded = expandedId === r.id;
                const cost = recordCost(pricing.table, r);

                // Throughput calculation for streaming
                const genTime = r.latency_ms - r.ttft_ms;
                const throughput =
                  r.stream && genTime > 100 && r.output_tokens > 0
                    ? (r.output_tokens / (genTime / 1000)).toFixed(1)
                    : null;

                return (
                  <React.Fragment key={r.id}>
                    <TableRow
                      tabIndex={0}
                      onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedId(isExpanded ? null : r.id);
                        }
                      }}
                      className="cursor-pointer transition-colors"
                    >
                      <TableCell className="text-muted-foreground">
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                        {formatDateTime(r.requested_at)}
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="font-medium">
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
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          {r.provider || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <span className="text-muted-foreground">
                          {formatTokens(r.input_tokens)}
                        </span>
                        {' / '}
                        <span className="text-muted-foreground">
                          {formatTokens(r.output_tokens)}
                        </span>
                        {' / '}
                        <span className="font-semibold">{formatTokens(r.total_tokens)}</span>
                        {(r.cache_read_tokens > 0 || r.cache_creation_tokens > 0) && (
                          <div className="text-[10px] text-muted-foreground">
                            缓存 读{formatTokens(r.cache_read_tokens)} / 写
                            {formatTokens(r.cache_creation_tokens)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono">
                        {cost ? (
                          <Tooltip
                            content={
                              <div className="space-y-1 text-left font-mono text-[11px]">
                                <div className="text-muted-foreground font-sans">
                                  {cost.match.matchType === 'custom'
                                    ? '自定义单价'
                                    : cost.match.matchType === 'fuzzy'
                                      ? `推断自: ${cost.match.providerId}/${cost.match.modelId}`
                                      : `models.dev: ${cost.match.providerId}/${cost.match.modelId}`}
                                </div>
                                <div>输入: {formatCost(cost.breakdown.uncachedCost)}</div>
                                <div>输出: {formatCost(cost.breakdown.outputCost)}</div>
                                {cost.breakdown.reasoningCost > 0 && (
                                  <div>思考: {formatCost(cost.breakdown.reasoningCost)}</div>
                                )}
                                {cost.breakdown.cacheReadCost > 0 && (
                                  <div>缓存读: {formatCost(cost.breakdown.cacheReadCost)}</div>
                                )}
                              </div>
                            }
                          >
                            <div className="cursor-help">
                              <div className="font-semibold">{formatCost(cost.cost)}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {formatUnitPrice(cost.match.price.input)} /{' '}
                                {formatUnitPrice(cost.match.price.output)}
                              </div>
                            </div>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono">
                        <div>{formatDuration(r.latency_ms)}</div>
                        {r.stream && r.ttft_ms > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            TTFT {formatDuration(r.ttft_ms)}
                            {throughput && ` · ${throughput} t/s`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <span title={r.api_key || r.auth_id || '-'}>
                            {r.api_key ? maskApiKey(r.api_key) : r.auth_id || '-'}
                          </span>
                          {r.auth_index && (
                            <Badge variant="outline" className="px-1 py-0 text-[9px]">
                              #{r.auth_index}
                            </Badge>
                          )}
                          {r.api_key && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-muted-foreground hover:text-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopyKey(r.api_key);
                              }}
                              title="复制完整 Key"
                            >
                              {copiedKey === r.api_key ? (
                                <Check className="h-3 w-3 text-primary" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={9} className="space-y-4 p-4 text-xs">
                          {/* Grid of details */}
                          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                            <CopyableDetail label="Request ID" value={r.request_id} />
                            <CopyableDetail label="Trace ID" value={r.trace_id} />
                            <CopyableDetail label="Session ID" value={r.session_id} />
                            <CopyableDetail label="来源 (Source)" value={r.source} />

                            <CopyableDetail
                              label="上游 Base URL"
                              value={r.base_url}
                              href={r.base_url?.startsWith('http') ? r.base_url : undefined}
                            />
                            <CopyableDetail
                              label="认证凭据 (Auth)"
                              value={[r.auth_id, r.auth_index && `#${r.auth_index}`, r.auth_type]
                                .filter(Boolean)
                                .join(' · ')}
                            />
                            <CopyableDetail
                              label="推理力度 (Reasoning Effort)"
                              value={r.reasoning_effort}
                            />
                            <CopyableDetail
                              label="Service Tier（请求 → 响应）"
                              value={
                                r.service_tier || r.response_service_tier
                                  ? `${r.service_tier || '-'} → ${r.response_service_tier || '-'}`
                                  : '-'
                              }
                            />

                            <CopyableDetail
                              label="模式与标记"
                              value={[
                                r.stream ? '流式 (Stream)' : '非流式',
                                r.generate ? '生成 (Generate)' : '非生成',
                              ].join(' · ')}
                            />

                            <CopyableDetail
                              label="模型定价来源"
                              value={
                                cost
                                  ? `${cost.match.providerId}/${cost.match.modelId} (${cost.match.matchType})`
                                  : '未匹配'
                              }
                            />

                            <div className="col-span-2 space-y-0.5">
                              <span className="block text-[11px] font-medium text-muted-foreground">
                                Tokens 与费用明细
                              </span>
                              <div className="font-mono text-[11px] text-foreground">
                                入 {formatNumber(r.input_tokens)} · 出{' '}
                                {formatNumber(r.output_tokens)}
                                {r.reasoning_tokens > 0 &&
                                  ` · 思考 ${formatNumber(r.reasoning_tokens)}`}
                                {r.cache_read_tokens > 0 &&
                                  ` · 缓存读 ${formatNumber(r.cache_read_tokens)}`}
                                {r.cache_creation_tokens > 0 &&
                                  ` · 缓存写 ${formatNumber(r.cache_creation_tokens)}`}
                                {' = '}
                                <span className="font-semibold">
                                  {formatNumber(r.total_tokens)}
                                </span>
                                {cost && (
                                  <span className="ml-2 font-semibold text-primary">
                                    [预估 {formatCost(cost.cost)}]
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Failure body & Headers if present */}
                          {(r.failure_body ||
                            (r.response_headers && Object.keys(r.response_headers).length > 0)) && (
                            <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                              <div className="flex items-center gap-1.5 font-medium text-destructive">
                                <AlertCircle className="h-4 w-4" />
                                <span>失败响应诊断 (HTTP {r.status_code || 500})</span>
                              </div>

                              {r.failure_body && (
                                <div className="space-y-1">
                                  <span className="text-[11px] font-medium text-muted-foreground">
                                    响应体 (Body):
                                  </span>
                                  <pre className="max-h-56 overflow-auto rounded bg-background p-2.5 font-mono text-[11px] text-foreground leading-relaxed">
                                    {formatJsonSafe(r.failure_body)}
                                  </pre>
                                </div>
                              )}

                              {r.response_headers && Object.keys(r.response_headers).length > 0 && (
                                <div className="space-y-1">
                                  <span className="text-[11px] font-medium text-muted-foreground">
                                    上游响应头 (Headers):
                                  </span>
                                  <div className="flex flex-wrap gap-1.5 rounded bg-background p-2 font-mono text-[11px]">
                                    {Object.entries(r.response_headers).map(([k, v]) => (
                                      <div
                                        key={k}
                                        className="inline-flex items-center gap-1 rounded border bg-muted/40 px-2 py-0.5"
                                      >
                                        <span className="font-semibold text-foreground">{k}:</span>
                                        <span className="text-muted-foreground">
                                          {v.join(', ')}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="p-8 text-center text-muted-foreground">
                  无匹配记录
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

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

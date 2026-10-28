import { AlertCircle, Check, CheckCircle2, Copy, Layers, RotateCcw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFormat } from "@/hooks/use-format";
import type { PricingState } from "@/hooks/use-pricing";
import { useI18n } from "@/i18n/context";
import { latencyTone, toneTextClass } from "@/lib/metrics";
import { type RecordCost, recordCost } from "@/lib/pricing";
import { cn, copyToClipboard, formatDuration, maskApiKey } from "@/lib/utils";
import type { OptionsResponse, RecordListResponse, RecordsFilters, StoredRecord } from "@/types";

interface RecordsTabProps {
  data: RecordListResponse | null;
  loading: boolean;
  options: OptionsResponse;
  filters: RecordsFilters;
  onFiltersChange: (filters: RecordsFilters) => void;
  page: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions: number[];
  pricing: PricingState;
}

const EMPTY_FILTERS: RecordsFilters = {
  model: "",
  provider: "",
  apiKey: "",
  authId: "",
  sessionId: "",
  status: "all",
  keyword: "",
};

const ROW_SKELETON_KEYS = ["row-a", "row-b", "row-c", "row-d", "row-e"];

/** base-ui Select 不接受空串作为选项值，这里用一个不会与真实值冲突的哨兵表示「全部」 */
const ALL_VALUE = "\u0000all";

/**
 * 筛选下拉。base-ui 的 SelectValue 需要 `items` 才能显示当前项标签，
 * 所以选项统一在这里构造，空串在边界处映射为「全部」。
 */
function FilterSelect({
  value,
  onChange,
  options,
  allLabel,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel: string;
  className?: string;
}) {
  const hasSelected = Boolean(value) && value !== ALL_VALUE && !options.some((o) => o.value === value);
  const items = [{ value: ALL_VALUE, label: allLabel }, ...(hasSelected ? [{ value, label: value }] : []), ...options];
  return (
    <Select
      items={items}
      value={value || ALL_VALUE}
      onValueChange={(next) => {
        if (next === null || next === undefined || next === ALL_VALUE) {
          onChange("");
        } else {
          onChange(String(next));
        }
      }}
    >
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** 单条字段：标签 + 值 + 复制。长值默认单行截断，完整内容交给原生 title。 */
function CostCell({ cost }: { cost: RecordCost | null }) {
  const { t } = useI18n();
  const { formatCost, formatUnitPrice } = useFormat();
  if (!cost) return <span className="text-muted-foreground">-</span>;

  const matchLabel =
    cost.match.matchType === "custom"
      ? t("pricing.match.custom")
      : cost.match.matchType === "fuzzy"
        ? t("pricing.match.fuzzy", { id: `${cost.match.providerId}/${cost.match.modelId}` })
        : t("pricing.match.exact", { id: `${cost.match.providerId}/${cost.match.modelId}` });

  return (
    <Tooltip>
      <TooltipTrigger render={<div className="cursor-help" />}>
        <div className="font-semibold">{formatCost(cost.cost)}</div>
        <div className="text-xs text-muted-foreground">
          {formatUnitPrice(cost.match.price.input)} / {formatUnitPrice(cost.match.price.output)}
        </div>
      </TooltipTrigger>
      <TooltipContent className="text-left">
        <div className="space-y-0.5">
          <div className="font-sans text-muted-foreground">{matchLabel}</div>
          <div className="font-mono tabular-nums">
            {t("pricing.breakdown.input")}: {formatCost(cost.breakdown.uncachedCost)}
          </div>
          <div className="font-mono tabular-nums">
            {t("pricing.breakdown.output")}: {formatCost(cost.breakdown.outputCost)}
          </div>
          {cost.breakdown.reasoningCost > 0 && (
            <div className="font-mono tabular-nums">
              {t("pricing.breakdown.reasoning")}: {formatCost(cost.breakdown.reasoningCost)}
            </div>
          )}
          {cost.breakdown.cacheReadCost > 0 && (
            <div className="font-mono tabular-nums">
              {t("pricing.breakdown.cache_read")}: {formatCost(cost.breakdown.cacheReadCost)}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function DetailRow({ record, cost }: { record: StoredRecord; cost: RecordCost | null }) {
  const { t } = useI18n();
  const { formatNumber, formatCost } = useFormat();
  const hasFailure = Boolean(record.failure_body) || Object.keys(record.response_headers ?? {}).length > 0;

  // 字段压成一行行的内联条目；长值截断并悬浮展示，避免每条记录展开后占据整屏
  const metaItems: { label: string; value: string; badge?: boolean }[] = [
    { label: t("records.detail.request_id"), value: record.request_id },
    { label: t("records.detail.trace_id"), value: record.trace_id },
    ...(record.selection_id ? [{ label: t("records.detail.selection_id"), value: record.selection_id }] : []),
    { label: t("records.detail.session_id"), value: record.session_id },
    ...(record.parent_session_id
      ? [{ label: t("records.detail.parent_session"), value: record.parent_session_id }]
      : []),
    { label: t("records.detail.base_url"), value: record.base_url },
    {
      label: t("records.detail.auth"),
      value: [record.auth_id, record.auth_index && `#${record.auth_index}`, record.auth_type]
        .filter(Boolean)
        .join(" · "),
    },
    { label: t("records.detail.executor"), value: record.executor_type },
    { label: t("records.detail.source"), value: record.source },
    { label: t("records.detail.reasoning_effort"), value: record.reasoning_effort },
    {
      label: t("records.detail.service_tier"),
      value:
        [record.service_tier, record.effective_service_tier, record.response_service_tier]
          .filter(Boolean)
          .join(" → ") || "-",
    },
    {
      label: t("records.detail.mode"),
      value: [
        record.stream ? t("records.detail.stream") : t("records.detail.non_stream"),
        record.generate ? t("records.detail.generate") : t("records.detail.not_generate"),
      ].join(" · "),
    },
    ...(record.failed && record.error_type
      ? [{ label: t("records.detail.error_type"), value: record.error_type, badge: true }]
      : []),
    {
      label: t("records.detail.pricing_source"),
      value: cost
        ? `${cost.match.providerId}/${cost.match.modelId} (${cost.match.matchType})`
        : t("records.detail.unmatched"),
      badge: Boolean(cost),
    },
    {
      label: t("records.detail.auth_source"),
      value: record.is_native_key ? t("records.detail.native_key") : record.access_provider || "-",
      badge: record.is_native_key || Boolean(record.access_provider),
    },
  ];

  // 词元与费用压成一行 KV，与上面的元信息用一条分隔线区分
  const tokenItems: { label: string; value: string; emphasis?: boolean }[] = [
    { label: t("records.detail.token_input"), value: formatNumber(record.input_tokens) },
    { label: t("records.detail.token_output"), value: formatNumber(record.output_tokens) },
    ...(record.reasoning_tokens > 0
      ? [{ label: t("records.detail.token_reasoning"), value: formatNumber(record.reasoning_tokens) }]
      : []),
    ...(record.cache_read_tokens > 0
      ? [{ label: t("records.detail.token_cache_read"), value: formatNumber(record.cache_read_tokens) }]
      : []),
    ...(record.cache_creation_tokens > 0
      ? [{ label: t("records.detail.token_cache_write"), value: formatNumber(record.cache_creation_tokens) }]
      : []),
    ...(record.cache_read_tokens > 0 && record.input_tokens > 0
      ? [
          {
            label: t("records.detail.token_cache_rate"),
            value: `${((record.cache_read_tokens / (record.input_tokens + record.cache_read_tokens)) * 100).toFixed(1)}%`,
            emphasis: true,
          },
        ]
      : []),
    { label: t("records.detail.token_total"), value: formatNumber(record.total_tokens), emphasis: true },
    ...(cost ? [{ label: t("records.detail.estimate_label"), value: formatCost(cost.cost), emphasis: true }] : []),
  ];

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={7} className="whitespace-normal px-4 py-3">
        <div className="space-y-3">
          {/* 词元与费用放在最上方，保持一行，便于快速扫读 */}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
            {tokenItems.map((item) => (
              <span key={item.label} className="inline-flex items-baseline gap-1 text-xs">
                <span className="text-muted-foreground">{item.label}</span>
                <span className={cn("font-mono tabular-nums", item.emphasis && "font-semibold text-primary")}>
                  {item.value}
                </span>
              </span>
            ))}
          </div>

          {/* 其余元信息一行一项，固定标签列让值左对齐 */}
          <div className="grid gap-1.5 border-t pt-2.5">
            {metaItems.map((item) => (
              <CompactItem key={item.label} label={item.label} value={item.value} badge={item.badge} />
            ))}
          </div>

          {hasFailure && (
            <details className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-destructive">
                <AlertCircle className="size-3.5" />
                {t("records.detail.failure_title", { status: record.status_code || 500 })}
              </summary>
              <div className="mt-2 space-y-2">
                {record.failure_body && (
                  <pre className="max-h-56 overflow-auto rounded-md bg-background p-2.5 font-mono text-xs whitespace-pre-wrap break-all">
                    {record.failure_body}
                  </pre>
                )}
                {record.response_headers && Object.keys(record.response_headers).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                    {Object.entries(record.response_headers).map(([name, values]) => (
                      <span
                        key={name}
                        className="inline-flex max-w-full min-w-0 items-baseline gap-1 rounded-md border bg-background px-2 py-0.5 whitespace-normal"
                      >
                        <span className="shrink-0 font-semibold">{name}:</span>
                        <span className="min-w-0 break-all text-muted-foreground">{values.join(", ")}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

/** 单行内联字段：标签在前、值在后，长值截断并保留完整内容供悬浮查看。 */
function CompactItem({ label, value, badge }: { label: string; value: string; badge?: boolean }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const text = value || "-";

  const handleCopy = async () => {
    if (!value || !(await copyToClipboard(value))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)_auto] items-baseline gap-2 text-xs sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
      <span className="min-w-0 text-muted-foreground">{label}</span>
      {badge ? (
        <Badge variant="secondary" className="max-w-48 justify-self-start truncate font-mono font-normal">
          {text}
        </Badge>
      ) : (
        <span className="min-w-0 truncate font-mono text-foreground" title={text}>
          {text}
        </span>
      )}
      {value && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title={t("common.copy")}
          aria-label={t("common.copy")}
          onClick={handleCopy}
        >
          {copied ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
        </Button>
      )}
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
  onPageSizeChange,
  pageSizeOptions,
  pricing,
}: RecordsTabProps) {
  const { t } = useI18n();
  const { formatNumber } = useFormat();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  // 关键字与会话 ID 本地保留并防抖，避免每敲一个字就发一次查询
  const [keyword, setKeyword] = useState(filters.keyword);
  const [sessionId, setSessionId] = useState(filters.sessionId);

  const [jumpPage, setJumpPage] = useState(String(page));

  useEffect(() => {
    setJumpPage(String(page));
  }, [page]);

  const handleJump = () => {
    const target = Number.parseInt(jumpPage, 10);
    if (!Number.isNaN(target) && target >= 1 && target <= totalPages) {
      if (target !== page) {
        onPageChange(target);
      }
    } else {
      setJumpPage(String(page));
    }
  };
  useEffect(() => {
    if (keyword === filters.keyword) return;
    const timer = setTimeout(() => onFiltersChange({ ...filters, keyword: keyword.trim() }), 300);
    return () => clearTimeout(timer);
  }, [keyword, filters, onFiltersChange]);

  useEffect(() => {
    if (sessionId === filters.sessionId) return;
    const timer = setTimeout(() => onFiltersChange({ ...filters, sessionId: sessionId.trim() }), 300);
    return () => clearTimeout(timer);
  }, [sessionId, filters, onFiltersChange]);

  const setFilter = (patch: Partial<RecordsFilters>) => {
    onFiltersChange({ ...filters, ...patch });
    onPageChange(1);
  };

  const resetFilters = () => {
    setKeyword("");
    setSessionId("");
    onFiltersChange(EMPTY_FILTERS);
    onPageChange(1);
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = data?.items ?? [];
  const hasActiveFilters =
    Boolean(keyword.trim()) ||
    Boolean(sessionId.trim()) ||
    Boolean(filters.model) ||
    Boolean(filters.provider) ||
    Boolean(filters.apiKey) ||
    Boolean(filters.authId) ||
    filters.status !== "all";

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="size-4 text-muted-foreground" />
              {t("records.title")}
            </CardTitle>
            <span className="text-xs text-muted-foreground">{t("records.count", { count: formatNumber(total) })}</span>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="xs" className="gap-1 text-muted-foreground" onClick={resetFilters}>
              <RotateCcw />
              {t("records.reset_filters")}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder={t("records.search_placeholder")}
              aria-label={t("common.search")}
              className="pl-8"
            />
          </div>

          <FilterSelect
            value={filters.model}
            onChange={(value) => setFilter({ model: value })}
            allLabel={t("records.filter.model_all")}
            options={options.models.map((model) => ({ value: model, label: model }))}
            className="w-full"
          />

          <FilterSelect
            value={filters.provider}
            onChange={(value) => setFilter({ provider: value })}
            allLabel={t("records.filter.provider_all")}
            options={options.providers.map((provider) => ({ value: provider, label: provider }))}
            className="w-full"
          />

          <FilterSelect
            value={filters.apiKey}
            onChange={(value) => setFilter({ apiKey: value })}
            allLabel={t("records.filter.key_all")}
            options={options.api_keys.map((key) => ({ value: key, label: maskApiKey(key) }))}
            className="w-full"
          />

          <FilterSelect
            value={filters.authId}
            onChange={(value) => setFilter({ authId: value })}
            allLabel={t("records.filter.auth_all")}
            options={options.auths.map((auth) => ({ value: auth, label: auth }))}
            className="w-full"
          />

          <div className="relative">
            <Input
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              placeholder={t("records.filter.session_placeholder")}
              aria-label={t("records.filter.session_placeholder")}
              className="font-mono text-xs"
            />
          </div>

          <FilterSelect
            value={filters.status === "all" ? "" : filters.status}
            onChange={(value) => setFilter({ status: (value || "all") as RecordsFilters["status"] })}
            allLabel={t("records.filter.status_all")}
            options={[
              { value: "success", label: t("records.filter.status_success") },
              { value: "failed", label: t("records.filter.status_failed") },
            ]}
            className="w-full"
          />
        </div>
      </CardHeader>

      <CardContent className="px-0">
        {!loading && items.length === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search />
              </EmptyMedia>
              <EmptyTitle>{t("records.empty")}</EmptyTitle>
              <EmptyDescription>{t("dashboard.empty.desc")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t("records.th.time")}</TableHead>
                <TableHead>{t("records.th.status")}</TableHead>
                <TableHead>{t("records.th.model")}</TableHead>
                <TableHead>{t("records.th.provider")}</TableHead>
                <TableHead className="w-32 text-right">{t("records.th.tokens")}</TableHead>
                <TableHead className="w-24 text-right">{t("records.th.cost")}</TableHead>
                <TableHead className="w-28 pr-4 text-right">{t("records.th.latency")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? ROW_SKELETON_KEYS.map((rowKey) => (
                    <TableRow key={rowKey}>
                      <TableCell colSpan={7} className="px-4">
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                : items.map((record) => {
                    const expanded = expandedId === record.id;
                    const cost = recordCost(pricing.table, record);
                    const generationMs = record.latency_ms - record.ttft_ms;
                    const throughput =
                      record.stream && generationMs > 100 && record.output_tokens > 0
                        ? (record.output_tokens / (generationMs / 1000)).toFixed(1)
                        : null;

                    return (
                      <RecordRows
                        key={record.id}
                        record={record}
                        cost={cost}
                        expanded={expanded}
                        throughput={throughput}
                        onToggle={() => setExpandedId(expanded ? null : record.id)}
                      />
                    );
                  })}
            </TableBody>
          </Table>
        )}

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {t("records.pagination.summary", { page, pages: totalPages, size: pageSize })}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{t("records.pagination.page_size")}</span>
                <Select
                  items={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
                  value={String(pageSize)}
                  onValueChange={(value) => value && onPageSizeChange(Number(value))}
                >
                  <SelectTrigger size="sm" className="w-18" aria-label={t("records.pagination.page_size")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizeOptions.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{t("records.pagination.jump")}</span>
                <Input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={jumpPage}
                  onChange={(e) => setJumpPage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleJump();
                    }
                  }}
                  onBlur={handleJump}
                  className="h-7 w-14 px-1 text-center font-mono text-xs tabular-nums"
                  aria-label={t("records.pagination.jump")}
                />
                <span>{t("records.pagination.page_unit")}</span>
              </div>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationFirst
                      text={t("records.pagination.first")}
                      aria-label={t("records.pagination.first")}
                      aria-disabled={page <= 1}
                      className={cn(page <= 1 && "pointer-events-none opacity-50")}
                      onClick={() => page > 1 && onPageChange(1)}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationPrevious
                      text={t("records.pagination.prev")}
                      aria-label={t("records.pagination.prev")}
                      aria-disabled={page <= 1}
                      className={cn(page <= 1 && "pointer-events-none opacity-50")}
                      onClick={() => page > 1 && onPageChange(page - 1)}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-2 font-mono text-xs tabular-nums">
                      {page} / {totalPages}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      text={t("records.pagination.next")}
                      aria-label={t("records.pagination.next")}
                      aria-disabled={page >= totalPages}
                      className={cn(page >= totalPages && "pointer-events-none opacity-50")}
                      onClick={() => page < totalPages && onPageChange(page + 1)}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLast
                      text={t("records.pagination.last")}
                      aria-label={t("records.pagination.last")}
                      aria-disabled={page >= totalPages}
                      className={cn(page >= totalPages && "pointer-events-none opacity-50")}
                      onClick={() => page < totalPages && onPageChange(totalPages)}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecordRows({
  record,
  cost,
  expanded,
  throughput,
  onToggle,
}: {
  record: StoredRecord;
  cost: RecordCost | null;
  expanded: boolean;
  throughput: string | null;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const { formatTokens, formatDateTime } = useFormat();
  const aliasNote =
    (record.alias && record.alias !== record.model) || (record.response_model && record.response_model !== record.model)
      ? [
          record.alias && record.alias !== record.model ? t("records.row.alias", { name: record.alias }) : "",
          record.response_model && record.response_model !== record.model
            ? t("records.row.upstream", { name: record.response_model })
            : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : "";

  return (
    <>
      <TableRow
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onToggle();
        }}
        aria-expanded={expanded}
        className="cursor-pointer aria-expanded:bg-muted/40"
      >
        <TableCell className="whitespace-nowrap py-3 pl-4 font-mono text-xs text-muted-foreground">
          {formatDateTime(record.requested_at)}
        </TableCell>
        <TableCell className="py-3">
          <span
            className={cn(
              "inline-flex items-center gap-1 font-mono tabular-nums",
              record.failed ? "text-destructive" : "text-success",
            )}
          >
            {record.failed ? <AlertCircle className="size-3" /> : <CheckCircle2 className="size-3" />}
            {record.status_code || (record.failed ? 500 : 200)}
          </span>
        </TableCell>
        <TableCell className="py-3 font-medium">
          <div className="flex max-w-48 flex-col">
            <span className="truncate" title={record.model}>
              {record.model}
            </span>
            {aliasNote && (
              <span className="truncate text-xs text-muted-foreground" title={aliasNote}>
                {aliasNote}
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="max-w-24 py-3 text-muted-foreground">
          <span className="block truncate" title={record.provider || undefined}>
            {record.provider || "-"}
          </span>
        </TableCell>
        <TableCell className="w-32 py-3 text-right font-mono tabular-nums">
          <div className="flex items-center justify-end gap-1">
            <span className="text-muted-foreground" title={t("records.detail.token_input")}>
              ↓{formatTokens(record.input_tokens)}
            </span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground" title={t("records.detail.token_output")}>
              ↑{formatTokens(record.output_tokens)}
            </span>
            <span className="text-muted-foreground">/</span>
            <span className="font-semibold text-foreground" title={t("records.detail.token_total")}>
              Σ{formatTokens(record.total_tokens)}
            </span>
          </div>
          {(record.cache_read_tokens > 0 || record.cache_creation_tokens > 0) && (
            <div className="text-xs text-muted-foreground">
              {t("records.row.cache", {
                read: formatTokens(record.cache_read_tokens),
                write: formatTokens(record.cache_creation_tokens),
              })}
            </div>
          )}
        </TableCell>
        <TableCell className="w-24 py-3 whitespace-nowrap text-right font-mono tabular-nums">
          <CostCell cost={cost} />
        </TableCell>
        <TableCell className="w-28 py-3 pr-4 whitespace-nowrap text-right font-mono tabular-nums">
          <div className={toneTextClass(latencyTone(record.latency_ms))}>{formatDuration(record.latency_ms)}</div>
          {record.stream && record.ttft_ms > 0 && (
            <div className="text-xs text-muted-foreground">
              <span className={toneTextClass(latencyTone(record.ttft_ms))}>TTFT {formatDuration(record.ttft_ms)}</span>
              {throughput && ` · ${t("records.row.throughput", { value: throughput })}`}
            </div>
          )}
        </TableCell>
      </TableRow>
      {expanded && <DetailRow record={record} cost={cost} />}
    </>
  );
}

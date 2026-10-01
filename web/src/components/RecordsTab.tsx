import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Layers,
  RotateCcw,
  Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PricingState } from "@/hooks/use-pricing";
import { useI18n } from "@/i18n/context";
import { type RecordCost, recordCost } from "@/lib/pricing";
import {
  cn,
  copyToClipboard,
  formatCost,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatTokens,
  formatUnitPrice,
  maskApiKey,
} from "@/lib/utils";
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
  pricing: PricingState;
}

const EMPTY_FILTERS: RecordsFilters = { model: "", provider: "", apiKey: "", status: "all", keyword: "" };

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
  const items = [{ value: ALL_VALUE, label: allLabel }, ...options];
  return (
    <Select
      items={items}
      value={value || ALL_VALUE}
      onValueChange={(next) => onChange(next === ALL_VALUE ? "" : String(next))}
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

function DetailItem({ label, value, href }: { label: string; value: string; href?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value || !(await copyToClipboard(value))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="min-w-0 space-y-0.5">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 font-mono text-xs">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 hover:underline"
          >
            <span className="truncate">{value || "-"}</span>
            <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
          </a>
        ) : (
          <span className="break-all">{value || "-"}</span>
        )}
        {value && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title={copied ? t("common.copied") : t("common.copy")}
            aria-label={copied ? t("common.copied") : t("common.copy")}
            onClick={handleCopy}
          >
            {copied ? <Check className="text-primary" /> : <Copy />}
          </Button>
        )}
      </div>
    </div>
  );
}

function CostCell({ cost }: { cost: RecordCost | null }) {
  const { t } = useI18n();
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
  const hasFailure = Boolean(record.failure_body) || Object.keys(record.response_headers ?? {}).length > 0;

  return (
    <TableRow className="bg-muted/40 hover:bg-muted/40">
      <TableCell colSpan={9} className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <DetailItem label={t("records.detail.request_id")} value={record.request_id} />
          <DetailItem label={t("records.detail.trace_id")} value={record.trace_id} />
          <DetailItem label={t("records.detail.session_id")} value={record.session_id} />
          <DetailItem label={t("records.detail.source")} value={record.source} />
          <DetailItem
            label={t("records.detail.base_url")}
            value={record.base_url}
            href={record.base_url?.startsWith("http") ? record.base_url : undefined}
          />
          <DetailItem
            label={t("records.detail.auth")}
            value={[record.auth_id, record.auth_index && `#${record.auth_index}`, record.auth_type]
              .filter(Boolean)
              .join(" · ")}
          />
          <DetailItem label={t("records.detail.reasoning_effort")} value={record.reasoning_effort} />
          <DetailItem
            label={t("records.detail.service_tier")}
            value={
              record.service_tier || record.response_service_tier
                ? `${record.service_tier || "-"} → ${record.response_service_tier || "-"}`
                : "-"
            }
          />
          <DetailItem
            label={t("records.detail.mode")}
            value={[
              record.stream ? t("records.detail.stream") : t("records.detail.non_stream"),
              record.generate ? t("records.detail.generate") : t("records.detail.not_generate"),
            ].join(" · ")}
          />
          <DetailItem
            label={t("records.detail.pricing_source")}
            value={
              cost
                ? `${cost.match.providerId}/${cost.match.modelId} (${cost.match.matchType})`
                : t("records.detail.unmatched")
            }
          />
          <div className="col-span-2 space-y-0.5">
            <span className="block text-xs font-medium text-muted-foreground">{t("records.detail.tokens_detail")}</span>
            <div className="font-mono text-xs">
              {t("records.detail.tokens_formula", {
                input: formatNumber(record.input_tokens),
                output: formatNumber(record.output_tokens),
              })}
              {record.reasoning_tokens > 0 &&
                t("records.detail.tokens_reasoning", { value: formatNumber(record.reasoning_tokens) })}
              {record.cache_read_tokens > 0 &&
                t("records.detail.tokens_cache_read", { value: formatNumber(record.cache_read_tokens) })}
              {record.cache_creation_tokens > 0 &&
                t("records.detail.tokens_cache_write", { value: formatNumber(record.cache_creation_tokens) })}
              <span className="font-semibold">
                {t("records.detail.tokens_total", { value: formatNumber(record.total_tokens) })}
              </span>
              {cost && (
                <span className="ml-2 font-semibold text-primary">
                  {t("records.detail.estimate", { value: formatCost(cost.cost) })}
                </span>
              )}
            </div>
          </div>
        </div>

        {hasFailure && (
          <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
              <AlertCircle className="size-4" />
              {t("records.detail.failure_title", { status: record.status_code || 500 })}
            </div>
            {record.failure_body && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{t("records.detail.failure_body")}</span>
                <pre className="max-h-56 overflow-auto rounded-md bg-background p-2.5 font-mono text-xs">
                  {record.failure_body}
                </pre>
              </div>
            )}
            {record.response_headers && Object.keys(record.response_headers).length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{t("records.detail.failure_headers")}</span>
                <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                  {Object.entries(record.response_headers).map(([name, values]) => (
                    <span
                      key={name}
                      className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-0.5"
                    >
                      <span className="font-semibold">{name}:</span>
                      <span className="text-muted-foreground">{values.join(", ")}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
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
  const { t } = useI18n();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // 关键字本地保留并防抖，避免每敲一个字就发一次查询
  const [keyword, setKeyword] = useState(filters.keyword);

  useEffect(() => {
    if (keyword === filters.keyword) return;
    const timer = setTimeout(() => onFiltersChange({ ...filters, keyword: keyword.trim() }), 300);
    return () => clearTimeout(timer);
  }, [keyword, filters, onFiltersChange]);

  const setFilter = (patch: Partial<RecordsFilters>) => {
    onFiltersChange({ ...filters, ...patch });
    onPageChange(1);
  };

  const resetFilters = () => {
    setKeyword("");
    onFiltersChange(EMPTY_FILTERS);
    onPageChange(1);
  };

  const handleCopyKey = async (key: string) => {
    if (!(await copyToClipboard(key))) return;
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items = data?.items ?? [];
  const hasActiveFilters =
    Boolean(keyword.trim()) ||
    Boolean(filters.model) ||
    Boolean(filters.provider) ||
    Boolean(filters.apiKey) ||
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
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
                <TableHead className="w-8" />
                <TableHead>{t("records.th.time")}</TableHead>
                <TableHead>{t("records.th.status")}</TableHead>
                <TableHead>{t("records.th.model")}</TableHead>
                <TableHead>{t("records.th.provider")}</TableHead>
                <TableHead className="text-right">{t("records.th.tokens")}</TableHead>
                <TableHead className="text-right">{t("records.th.cost")}</TableHead>
                <TableHead className="text-right">{t("records.th.latency")}</TableHead>
                <TableHead>{t("records.th.key")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? ROW_SKELETON_KEYS.map((rowKey) => (
                    <TableRow key={rowKey}>
                      <TableCell colSpan={9}>
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
                        copiedKey={copiedKey}
                        onToggle={() => setExpandedId(expanded ? null : record.id)}
                        onCopyKey={handleCopyKey}
                      />
                    );
                  })}
            </TableBody>
          </Table>
        )}

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {t("records.pagination.summary", { page, pages: totalPages, size: pageSize })}
            </span>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
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
                  <span className="px-2 text-xs tabular-nums">
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
              </PaginationContent>
            </Pagination>
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
  copiedKey,
  onToggle,
  onCopyKey,
}: {
  record: StoredRecord;
  cost: RecordCost | null;
  expanded: boolean;
  throughput: string | null;
  copiedKey: string | null;
  onToggle: () => void;
  onCopyKey: (key: string) => void;
}) {
  const { t } = useI18n();
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
        className="cursor-pointer"
      >
        <TableCell className="text-muted-foreground">
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
        </TableCell>
        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          {formatDateTime(record.requested_at)}
        </TableCell>
        <TableCell>
          <span
            className={cn(
              "inline-flex items-center gap-1 font-mono tabular-nums",
              record.failed ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {record.failed ? <AlertCircle className="size-3" /> : <CheckCircle2 className="size-3" />}
            {record.status_code || (record.failed ? 500 : 200)}
          </span>
        </TableCell>
        <TableCell className="font-medium">
          <div className="flex max-w-48 flex-col">
            <span className="truncate">{record.model}</span>
            {aliasNote && <span className="truncate text-xs text-muted-foreground">{aliasNote}</span>}
          </div>
        </TableCell>
        <TableCell className="text-muted-foreground">{record.provider || "-"}</TableCell>
        <TableCell className="text-right font-mono tabular-nums">
          <span className="text-muted-foreground">{formatTokens(record.input_tokens)}</span>
          {" / "}
          <span className="text-muted-foreground">{formatTokens(record.output_tokens)}</span>
          {" / "}
          <span className="font-semibold">{formatTokens(record.total_tokens)}</span>
          {(record.cache_read_tokens > 0 || record.cache_creation_tokens > 0) && (
            <div className="text-xs text-muted-foreground">
              {t("records.row.cache", {
                read: formatTokens(record.cache_read_tokens),
                write: formatTokens(record.cache_creation_tokens),
              })}
            </div>
          )}
        </TableCell>
        <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
          <CostCell cost={cost} />
        </TableCell>
        <TableCell className="whitespace-nowrap text-right font-mono tabular-nums">
          <div>{formatDuration(record.latency_ms)}</div>
          {record.stream && record.ttft_ms > 0 && (
            <div className="text-xs text-muted-foreground">
              TTFT {formatDuration(record.ttft_ms)}
              {throughput && ` · ${t("records.row.throughput", { value: throughput })}`}
            </div>
          )}
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span title={record.api_key || record.auth_id}>
              {record.api_key ? maskApiKey(record.api_key) : record.auth_id || "-"}
            </span>
            {record.auth_index && (
              <Badge variant="outline" className="font-mono text-[10px]">
                #{record.auth_index}
              </Badge>
            )}
            {record.api_key && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-foreground"
                title={t("records.row.copy_key")}
                aria-label={t("records.row.copy_key")}
                onClick={(event) => {
                  event.stopPropagation();
                  onCopyKey(record.api_key);
                }}
              >
                {copiedKey === record.api_key ? <Check className="text-primary" /> : <Copy />}
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {expanded && <DetailRow record={record} cost={cost} />}
    </>
  );
}

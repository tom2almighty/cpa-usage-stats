import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Coins,
  Copy,
  Cpu,
  ExternalLink,
  Hash,
  Layers,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
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
import { useFormat } from "@/hooks/use-format";
import type { PricingState } from "@/hooks/use-pricing";
import { useI18n } from "@/i18n/context";
import { type RecordCost, recordCost } from "@/lib/pricing";
import { cn, copyToClipboard, formatDateTime, formatDuration, maskApiKey } from "@/lib/utils";
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

/** 单条字段：标签 + 值 + 复制。长值默认单行截断，完整内容交给原生 title。 */
function DetailItem({
  label,
  value,
  href,
  badge,
}: {
  label: string;
  value: string;
  href?: string;
  /** 短枚举值（错误类型、模式等）用徽章呈现，和长 ID 拉开层次 */
  badge?: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value || !(await copyToClipboard(value))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const text = value || "-";

  return (
    // 表格单元格带 whitespace-nowrap，这里必须显式恢复正常换行，否则 truncate 不生效
    <div className="min-w-0 space-y-1 whitespace-normal">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-1 text-xs">
        {badge ? (
          <Badge variant="secondary" className="max-w-full font-mono font-normal">
            <span className="truncate">{text}</span>
          </Badge>
        ) : href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            title={value}
            className="inline-flex min-w-0 items-center gap-1 font-mono hover:underline"
          >
            <span className="min-w-0 truncate">{text}</span>
            <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
          </a>
        ) : (
          <span className="min-w-0 truncate font-mono" title={value || undefined}>
            {text}
          </span>
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

/** 分区小标题：一条细线加标签，把展开区切成可扫读的几段。 */
function SectionLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 border-b pb-1.5 text-xs font-medium text-muted-foreground">
      <span className="[&_svg]:size-3.5">{icon}</span>
      {children}
    </div>
  );
}

/** 词元/费用统计块：标签在上、等宽数字在下，比串成一行的公式好扫读。 */
function TokenStat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="space-y-0.5">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "block font-mono text-sm tabular-nums",
          emphasis ? "font-semibold text-primary" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

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

  // 三个 ID 是同构的长串，横排平铺会互相挤，单独一段纵向对齐后复制和比对都方便
  const ids = [
    { label: t("records.detail.request_id"), value: record.request_id },
    { label: t("records.detail.trace_id"), value: record.trace_id },
    { label: t("records.detail.session_id"), value: record.session_id },
    ...(record.parent_session_id
      ? [{ label: t("records.detail.parent_session"), value: record.parent_session_id }]
      : []),
  ];

  return (
    <TableRow className="bg-muted/40 hover:bg-muted/40">
      <TableCell colSpan={9} className="whitespace-normal p-0">
        <div className="space-y-4 border-l-2 border-primary/30 px-4 py-3">
          <section className="space-y-2">
            <SectionLabel icon={<Hash />}>{t("records.detail.section_ids")}</SectionLabel>
            <div className="grid gap-2 sm:grid-cols-2">
              {ids.map((item) => (
                <DetailItem key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <SectionLabel icon={<Cpu />}>{t("records.detail.section_route")}</SectionLabel>
            <div className="grid gap-2 sm:grid-cols-2">
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
              <DetailItem label={t("records.detail.executor")} value={record.executor_type} />
              <DetailItem
                label={t("records.detail.pricing_source")}
                value={
                  cost
                    ? `${cost.match.providerId}/${cost.match.modelId} (${cost.match.matchType})`
                    : t("records.detail.unmatched")
                }
              />
            </div>
          </section>

          <section className="space-y-2">
            <SectionLabel icon={<SlidersHorizontal />}>{t("records.detail.section_params")}</SectionLabel>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <DetailItem label={t("records.detail.source")} value={record.source} />
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
              {record.failed && record.error_type && (
                <DetailItem badge label={t("records.detail.error_type")} value={record.error_type} />
              )}
            </div>
          </section>

          <section className="space-y-2">
            <SectionLabel icon={<Coins />}>{t("records.detail.tokens_detail")}</SectionLabel>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <TokenStat label={t("records.detail.token_input")} value={formatNumber(record.input_tokens)} />
              <TokenStat label={t("records.detail.token_output")} value={formatNumber(record.output_tokens)} />
              {record.reasoning_tokens > 0 && (
                <TokenStat label={t("records.detail.token_reasoning")} value={formatNumber(record.reasoning_tokens)} />
              )}
              {record.cache_read_tokens > 0 && (
                <TokenStat
                  label={t("records.detail.token_cache_read")}
                  value={formatNumber(record.cache_read_tokens)}
                />
              )}
              {record.cache_creation_tokens > 0 && (
                <TokenStat
                  label={t("records.detail.token_cache_write")}
                  value={formatNumber(record.cache_creation_tokens)}
                />
              )}
              <TokenStat label={t("records.detail.token_total")} value={formatNumber(record.total_tokens)} emphasis />
              {cost && <TokenStat label={t("records.detail.estimate_label")} value={formatCost(cost.cost)} emphasis />}
            </div>
          </section>

          {hasFailure && (
            <section className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
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
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("records.detail.failure_headers")}
                  </span>
                  <div className="flex flex-wrap gap-1.5 font-mono text-xs">
                    {Object.entries(record.response_headers).map(([name, values]) => (
                      // 表格基类带 whitespace-nowrap，这里必须显式复位，否则单个超长 header 值会撑出 chip
                      <span
                        key={name}
                        className="inline-flex max-w-full min-w-0 items-baseline gap-1 whitespace-normal rounded-md border bg-background px-2 py-0.5"
                      >
                        <span className="shrink-0 font-semibold">{name}:</span>
                        <span className="min-w-0 break-all text-muted-foreground">{values.join(", ")}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
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
  const { formatNumber } = useFormat();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // 关键字与会话 ID 本地保留并防抖，避免每敲一个字就发一次查询
  const [keyword, setKeyword] = useState(filters.keyword);
  const [sessionId, setSessionId] = useState(filters.sessionId);

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
                <TableHead className="w-8" />
                <TableHead>{t("records.th.time")}</TableHead>
                <TableHead>{t("records.th.status")}</TableHead>
                <TableHead>{t("records.th.model")}</TableHead>
                <TableHead>{t("records.th.provider")}</TableHead>
                <TableHead className="w-32 text-right">{t("records.th.tokens")}</TableHead>
                <TableHead className="w-24 text-right">{t("records.th.cost")}</TableHead>
                <TableHead className="w-24 text-right">{t("records.th.latency")}</TableHead>
                <TableHead className="max-w-40">{t("records.th.key")}</TableHead>
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
  const { formatTokens } = useFormat();
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
        className="group/row cursor-pointer aria-expanded:bg-muted/50"
      >
        <TableCell className="text-muted-foreground">
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-200",
              expanded ? "rotate-180" : "opacity-60 group-hover/row:opacity-100",
            )}
          />
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
        <TableCell className="max-w-24 text-muted-foreground">
          <span className="block truncate" title={record.provider || undefined}>
            {record.provider || "-"}
          </span>
        </TableCell>
        <TableCell className="w-32 text-right font-mono tabular-nums">
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
        <TableCell className="w-24 whitespace-nowrap text-right font-mono tabular-nums">
          <CostCell cost={cost} />
        </TableCell>
        <TableCell className="w-24 whitespace-nowrap text-right font-mono tabular-nums">
          <div>{formatDuration(record.latency_ms)}</div>
          {record.stream && record.ttft_ms > 0 && (
            <div className="text-xs text-muted-foreground">
              TTFT {formatDuration(record.ttft_ms)}
              {throughput && ` · ${t("records.row.throughput", { value: throughput })}`}
            </div>
          )}
        </TableCell>
        <TableCell className="max-w-40 font-mono text-xs text-muted-foreground">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate" title={record.api_key || record.auth_id || undefined}>
              {record.api_key ? maskApiKey(record.api_key) : record.auth_id || "-"}
            </span>
            {record.auth_index && (
              <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                #{record.auth_index}
              </Badge>
            )}
            {record.api_key && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 text-muted-foreground hover:text-foreground"
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

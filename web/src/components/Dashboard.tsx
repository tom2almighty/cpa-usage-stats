import * as React from 'react';
import { ChartColumn, Moon, RefreshCw, Sun } from 'lucide-react';
import { AuthDialog } from '@/components/AuthDialog';
import { OverviewTab } from '@/components/OverviewTab';
import { PricingSource } from '@/components/PricingSource';
import { RecordsTab } from '@/components/RecordsTab';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  fetchOptions,
  fetchRecords,
  fetchSummary,
  setManagementKey,
  UnauthorizedError,
} from '@/lib/api';
import { clearOwnKey, resolveManagementKey, storeOwnKey } from '@/lib/auth';
import { usePricing } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import type {
  OptionsResponse,
  RecordListResponse,
  RecordsFilters,
  SummaryData,
  TabKey,
  TimeRange,
} from '@/types';

const PAGE_SIZE = 15;

const EMPTY_FILTERS: RecordsFilters = {
  model: '',
  provider: '',
  apiKey: '',
  status: 'all',
  keyword: '',
};

const RANGE_OPTIONS: { label: string; value: TimeRange }[] = [
  { label: '今日', value: 'today' },
  { label: '昨天', value: 'yesterday' },
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
  { label: '全部', value: 'all' },
];

const REFRESH_OPTIONS = [
  { label: '不自动刷新', value: '0' },
  { label: '每 10 秒', value: '10' },
  { label: '每 30 秒', value: '30' },
  { label: '每 60 秒', value: '60' },
];

export function Dashboard() {
  const [tab, setTab] = React.useState<TabKey>('overview');
  const [range, setRange] = React.useState<TimeRange>('today');

  // Filters shared by both tabs; keyword typing is debounced inside RecordsTab.
  const [filters, setFilters] = React.useState<RecordsFilters>(EMPTY_FILTERS);
  const [page, setPage] = React.useState(1);

  const [summary, setSummary] = React.useState<SummaryData | null>(null);
  const [records, setRecords] = React.useState<RecordListResponse | null>(null);
  const [options, setOptions] = React.useState<OptionsResponse>({
    models: [],
    providers: [],
    api_keys: [],
  });

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');

  const [needsAuth, setNeedsAuth] = React.useState(false);
  const [authError, setAuthError] = React.useState('');
  // 密钥解析完成前不发任何请求
  const [keyChecked, setKeyChecked] = React.useState(false);

  const [autoRefresh, setAutoRefresh] = React.useState('0');

  // models.dev prices: fetched once per day and cached in localStorage.
  const pricing = usePricing();

  const [darkMode, setDarkMode] = React.useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches
      );
    }
    return false;
  });

  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Resolve the management key once on mount; without one show the fallback
  // dialog instead of firing requests that can only 401.
  React.useEffect(() => {
    const key = resolveManagementKey();
    setManagementKey(key || null);
    setNeedsAuth(!key);
    setKeyChecked(true);
  }, []);

  const load = React.useCallback(async () => {
    setRefreshing(true);
    setLoadError('');
    try {
      // 先用 options 探测密钥：密钥错误时只消耗 1 次认证失败计数（CPA 连续 5 次失败封禁 IP 30 分钟）
      setOptions(await fetchOptions());
      const failed =
        filters.status === 'all' ? undefined : filters.status === 'failed' ? 'true' : 'false';
      const shared = {
        range,
        model: filters.model,
        provider: filters.provider,
        apiKey: filters.apiKey,
        failed,
        keyword: filters.keyword,
      };
      const [summaryRes, recordsRes] = await Promise.all([
        fetchSummary(shared),
        fetchRecords(shared, page, PAGE_SIZE),
      ]);
      setSummary(summaryRes);
      setRecords(recordsRes);
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        setNeedsAuth(true);
        setAuthError('管理密钥无效或已过期，请重新输入。');
      } else {
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range, filters, page]);

  // 只有在确认拿到密钥之后才请求数据；没有密钥时只显示输入框，绝不发无鉴权请求
  React.useEffect(() => {
    if (!keyChecked || needsAuth) return;
    void load();
  }, [keyChecked, needsAuth, load]);

  // Auto refresh loop.
  React.useEffect(() => {
    if (autoRefresh === '0' || !keyChecked || needsAuth) return;
    const id = setInterval(() => {
      void load();
    }, Number(autoRefresh) * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, keyChecked, needsAuth, load]);

  const handleAuthSubmit = (key: string) => {
    setManagementKey(key || null);
    if (key) {
      storeOwnKey(key);
    } else {
      clearOwnKey();
    }
    // 交给加载 effect：needsAuth 置为 false 后才会请求，错误密钥只消耗 1 次失败计数
    setNeedsAuth(!key);
    setAuthError('');
    setLoading(true);
  };

  const handleAuthReset = () => {
    clearOwnKey();
    setManagementKey(null);
    setNeedsAuth(true);
    setAuthError('');
  };

  if (needsAuth) {
    return <AuthDialog onSubmit={handleAuthSubmit} error={authError} />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            <ChartColumn className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">CLIProxyAPI 用量统计</h1>
            <p className="text-xs text-muted-foreground md:text-sm">
              v8 用量观察能力 · SQLite 持久化 · 请求 / Token / 成本多维看板
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Time range */}
          <div className="inline-flex rounded-md border bg-muted/40 p-1">
            {RANGE_OPTIONS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setRange(item.value);
                  setPage(1);
                }}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  range === item.value
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Select
            value={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.value)}
            className="h-8 w-32 text-xs"
            title="自动刷新"
          >
            {REFRESH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => void load()}
            disabled={refreshing}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            <span>刷新</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleAuthReset}
            title="重置管理密钥"
          >
            <span className="text-xs font-medium">密钥</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDarkMode(!darkMode)}
            className="h-8 w-8"
            title="切换深浅主题"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex w-full rounded-lg border bg-muted/40 p-1 sm:w-auto">
        {(
          [
            { key: 'overview', label: '用量总览' },
            { key: 'records', label: '调用明细' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              'flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none',
              tab === t.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          数据加载失败：{loadError}
        </div>
      )}

      <PricingSource pricing={pricing} />

      {tab === 'overview' ? (
        <OverviewTab summary={summary} loading={loading} pricing={pricing} />
      ) : (
        <RecordsTab
          data={records}
          loading={loading}
          options={options}
          filters={filters}
          onFiltersChange={(f) => {
            setFilters(f);
            setPage(1);
          }}
          page={page}
          onPageChange={setPage}
          pageSize={PAGE_SIZE}
          pricing={pricing}
        />
      )}
    </div>
  );
}

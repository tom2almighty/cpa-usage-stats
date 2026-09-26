import * as React from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Layers,
  Moon,
  RefreshCw,
  Search,
  Sun,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatDuration, formatNumber, formatTokens } from '@/lib/utils';
import type { RecordListResponse, SummaryData, TimeRange } from '@/types';

export function Dashboard() {
  const [range, setRange] = React.useState<TimeRange>('today');
  const [summary, setSummary] = React.useState<SummaryData | null>(null);
  const [recordsData, setRecordsData] = React.useState<RecordListResponse | null>(null);
  const [models, setModels] = React.useState<string[]>([]);
  const [providers, setProviders] = React.useState<string[]>([]);

  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  // Filters for records
  const [page, setPage] = React.useState(1);
  const [pageSize] = React.useState(15);
  const [selectedModel, setSelectedModel] = React.useState('');
  const [selectedProvider, setSelectedProvider] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'success' | 'failed'>('all');
  const [keyword, setKeyword] = React.useState('');
  const [expandedId, setExpandedId] = React.useState<number | null>(null);

  // Theme
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
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Fetch Summary
  const fetchSummary = React.useCallback(async () => {
    try {
      const res = await fetch(`?action=summary&range=${range}`);
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (e) {
      console.error('fetch summary failed:', e);
    }
  }, [range]);

  // Fetch Records
  const fetchRecords = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('action', 'records');
      params.set('page', String(page));
      params.set('page_size', String(pageSize));
      params.set('range', range);

      if (selectedModel) params.set('model', selectedModel);
      if (selectedProvider) params.set('provider', selectedProvider);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (statusFilter === 'success') params.set('failed', 'false');
      if (statusFilter === 'failed') params.set('failed', 'true');

      const res = await fetch(`?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRecordsData(data);
      }
    } catch (e) {
      console.error('fetch records failed:', e);
    }
  }, [page, pageSize, range, selectedModel, selectedProvider, statusFilter, keyword]);

  // Fetch Models and Providers
  const fetchOptions = React.useCallback(async () => {
    try {
      const [mRes, pRes] = await Promise.all([fetch('?action=models'), fetch('?action=providers')]);
      if (mRes.ok) {
        const mData = await mRes.json();
        setModels(mData.models || []);
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        setProviders(pData.providers || []);
      }
    } catch (e) {
      console.error('fetch options failed:', e);
    }
  }, []);

  const loadAll = React.useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchSummary(), fetchRecords(), fetchOptions()]);
    setLoading(false);
    setRefreshing(false);
  }, [fetchSummary, fetchRecords, fetchOptions]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Reload records when filters change
  React.useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-5">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">CLIProxyAPI 用量统计</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              实时持久化与多维度请求用量看板
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Time range buttons */}
          <div className="inline-flex rounded-md border p-1 bg-muted/40">
            {(
              [
                { label: '今日', val: 'today' },
                { label: '昨天', val: 'yesterday' },
                { label: '近 7 天', val: '7d' },
                { label: '近 30 天', val: '30d' },
                { label: '全部', val: 'all' },
              ] as const
            ).map((item) => (
              <button
                key={item.val}
                type="button"
                onClick={() => {
                  setRange(item.val);
                  setPage(1);
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  range === item.val
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadAll}
            disabled={refreshing}
            className="h-8 gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>刷新</span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDarkMode(!darkMode)}
            className="h-8 w-8"
            title="切换深浅主题"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Requests */}
        <Card>
          <CardHeader className="p-4 pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">总请求数</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{formatNumber(summary?.total_requests ?? 0)}</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              <span className="text-emerald-500 font-medium">
                {summary?.success_rate ? `${summary.success_rate.toFixed(1)}%` : '100%'}
              </span>
              <span>成功率</span>
              {summary && summary.failed_requests > 0 && (
                <span className="text-rose-500 ml-1">({summary.failed_requests} 失败)</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Total Tokens */}
        <Card>
          <CardHeader className="p-4 pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Token 消耗总计
            </CardTitle>
            <Zap className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-bold">{formatTokens(summary?.total_tokens ?? 0)}</div>
            <div className="text-xs text-muted-foreground mt-1 truncate">
              {formatNumber(summary?.total_tokens ?? 0)} tokens
            </div>
          </CardContent>
        </Card>

        {/* Input / Output Tokens */}
        <Card>
          <CardHeader className="p-4 pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              输入 / 输出 Tokens
            </CardTitle>
            <Layers className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-base font-bold flex items-center justify-between">
              <span>入: {formatTokens(summary?.input_tokens ?? 0)}</span>
              <span className="text-muted-foreground">/</span>
              <span>出: {formatTokens(summary?.output_tokens ?? 0)}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex justify-between">
              <span>思考: {formatTokens(summary?.reasoning_tokens ?? 0)}</span>
              <span>缓存: {formatTokens(summary?.cached_tokens ?? 0)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Latency & TTFT */}
        <Card>
          <CardHeader className="p-4 pb-2 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              平均响应 / 首字延迟
            </CardTitle>
            <Clock className="w-4 h-4 text-indigo-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-xl font-bold">{formatDuration(summary?.avg_latency_ms ?? 0)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              TTFT (首字): {formatDuration(summary?.avg_ttft_ms ?? 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle Section: Model Breakdown & Daily Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Model Ranking Table */}
        <Card className="lg:col-span-2">
          <CardHeader className="p-4 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Cpu className="w-4 h-4 text-muted-foreground" />
                模型用量排行
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                共 {summary?.model_stats.length || 0} 个模型
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                  <tr>
                    <th className="p-3">模型</th>
                    <th className="p-3">提供方</th>
                    <th className="p-3 text-right">请求数</th>
                    <th className="p-3 text-right">总 Tokens</th>
                    <th className="p-3 text-right">思考 / 缓存</th>
                    <th className="p-3 text-right">平均延迟</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary && summary.model_stats.length > 0 ? (
                    summary.model_stats.slice(0, 10).map((m, idx) => (
                      <tr key={idx} className="hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium flex items-center gap-1.5">
                          <span className="text-muted-foreground w-4 text-[10px]">{idx + 1}</span>
                          <span className="truncate max-w-[180px]">{m.model}</span>
                        </td>
                        <td className="p-3 text-muted-foreground">
                          <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                            {m.provider}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-medium">
                          {formatNumber(m.total_requests)}
                          {m.failed_requests > 0 && (
                            <span className="text-rose-500 text-[10px] ml-1">
                              ({m.failed_requests}!)
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-semibold">
                          {formatTokens(m.total_tokens)}
                        </td>
                        <td className="p-3 text-right text-muted-foreground text-[11px]">
                          {formatTokens(m.reasoning_tokens)} / {formatTokens(m.cached_tokens)}
                        </td>
                        <td className="p-3 text-right text-muted-foreground">
                          {formatDuration(m.avg_latency_ms)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-muted-foreground">
                        暂无统计数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Daily Trend & Provider Distribution */}
        <div className="space-y-6">
          {/* Daily Trend */}
          <Card>
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-sm font-semibold">每日调用走势</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {summary && summary.daily_stats.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {summary.daily_stats.slice(-10).map((d) => {
                    const maxReq = Math.max(...summary.daily_stats.map((x) => x.total_requests), 1);
                    const pct = Math.min(100, Math.round((d.total_requests / maxReq) * 100));
                    return (
                      <div key={d.date} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-mono text-muted-foreground">{d.date}</span>
                          <span className="font-medium">
                            {formatNumber(d.total_requests)} 次 ({formatTokens(d.total_tokens)})
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground text-center py-4">暂无每日走势</div>
              )}
            </CardContent>
          </Card>

          {/* Provider Stats */}
          <Card>
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-sm font-semibold">Provider 供应商分布</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-2">
                {summary && summary.provider_stats.length > 0 ? (
                  summary.provider_stats.map((p) => (
                    <div
                      key={p.provider}
                      className="flex items-center justify-between text-xs p-2 rounded bg-muted/40"
                    >
                      <span className="font-medium">{p.provider}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {formatNumber(p.total_requests)} 次
                        </span>
                        <Badge variant="secondary" className="font-mono">
                          {formatTokens(p.total_tokens)}
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground text-center py-2">暂无数据</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Records Table Section */}
      <Card>
        <CardHeader className="p-4 border-b space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" />
              调用明细日志
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              共找到 {formatNumber(recordsData?.total ?? 0)} 条记录
            </span>
          </div>

          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="搜索 Key / Model / TraceID..."
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  setPage(1);
                }}
                className="pl-8 h-9 text-xs"
              />
            </div>

            {/* Model Filter */}
            <Select
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value);
                setPage(1);
              }}
              className="text-xs h-9"
            >
              <option value="">全部模型</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>

            {/* Provider Filter */}
            <Select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                setPage(1);
              }}
              className="text-xs h-9"
            >
              <option value="">全部 Provider</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>

            {/* Status Filter */}
            <Select
              value={statusFilter}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'all' || val === 'success' || val === 'failed') {
                  setStatusFilter(val);
                }
                setPage(1);
              }}
              className="text-xs h-9"
            >
              <option value="all">全部状态</option>
              <option value="success">仅成功</option>
              <option value="failed">仅失败</option>
            </Select>
          </div>
        </CardHeader>

        {/* Table Content */}
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 text-muted-foreground font-medium border-b">
                <tr>
                  <th className="p-3 w-8" />
                  <th className="p-3">时间</th>
                  <th className="p-3">状态</th>
                  <th className="p-3">模型</th>
                  <th className="p-3">Provider</th>
                  <th className="p-3 text-right">Tokens (入/出/总)</th>
                  <th className="p-3 text-right">耗时 / TTFT</th>
                  <th className="p-3">客户端 Key / Auth</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recordsData && recordsData.items.length > 0 ? (
                  recordsData.items.map((r) => {
                    const isExpanded = expandedId === r.id;
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
                          className="hover:bg-muted/30 cursor-pointer transition-colors focus:bg-muted/40 focus:outline-none"
                        >
                          <td className="p-3 text-muted-foreground">
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${
                                isExpanded ? 'rotate-180' : ''
                              }`}
                            />
                          </td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap font-mono text-[11px]">
                            {r.requested_at?.replace('T', ' ')?.slice(0, 19)}
                          </td>
                          <td className="p-3">
                            {r.failed ? (
                              <Badge
                                variant="destructive"
                                className="gap-1 text-[10px] py-0 px-1.5"
                              >
                                <AlertCircle className="w-3 h-3" />
                                <span>{r.status_code || 500}</span>
                              </Badge>
                            ) : (
                              <Badge variant="success" className="gap-1 text-[10px] py-0 px-1.5">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>200</span>
                              </Badge>
                            )}
                          </td>
                          <td className="p-3 font-medium">
                            <div className="flex flex-col">
                              <span>{r.model}</span>
                              {r.alias && r.alias !== r.model && (
                                <span className="text-[10px] text-muted-foreground">
                                  别名: {r.alias}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5">
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
                          </td>
                          <td className="p-3 text-right font-mono whitespace-nowrap">
                            <div>{formatDuration(r.latency_ms)}</div>
                            {r.stream && r.ttft_ms > 0 && (
                              <div className="text-[10px] text-muted-foreground">
                                TTFT: {formatDuration(r.ttft_ms)}
                              </div>
                            )}
                          </td>
                          <td className="p-3 font-mono text-muted-foreground text-[11px] truncate max-w-[120px]">
                            {r.api_key || r.auth_id || '-'}
                          </td>
                        </tr>

                        {/* Expanded details row */}
                        {isExpanded && (
                          <tr className="bg-muted/20">
                            <td colSpan={8} className="p-4 space-y-2 border-t border-b">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">
                                    Request ID
                                  </span>
                                  <span className="font-mono text-[11px] break-all">
                                    {r.request_id || '-'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">
                                    Trace ID
                                  </span>
                                  <span className="font-mono text-[11px]">{r.trace_id || '-'}</span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">
                                    思考 / 缓存 Tokens
                                  </span>
                                  <span className="font-mono">
                                    {r.reasoning_tokens} / {r.cached_tokens}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground block text-[11px]">
                                    流式传输 (Stream)
                                  </span>
                                  <span>{r.stream ? '是' : '否'}</span>
                                </div>
                              </div>

                              {r.failure_body && (
                                <div className="mt-2 p-2.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-mono break-all">
                                  <div className="font-semibold mb-1 text-[11px]">
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
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      {loading ? '加载中...' : '无匹配记录'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {recordsData && recordsData.total > 0 && (
            <div className="flex items-center justify-between p-4 border-t text-xs">
              <div className="text-muted-foreground">
                第 {recordsData.page} 页 / 共 {Math.ceil(recordsData.total / pageSize)} 页
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="h-8 gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>上一页</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page * pageSize >= recordsData.total}
                  className="h-8 gap-1"
                >
                  <span>下一页</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

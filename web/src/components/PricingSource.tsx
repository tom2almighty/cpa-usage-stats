import { Button } from '@/components/ui/button';
import type { PricingState } from '@/lib/pricing';
import { RefreshCw, Sparkles } from 'lucide-react';

/**
 * Where the prices come from. Always rendered so cost numbers stay honest
 * about being list-price estimates.
 */
export function PricingSource({ pricing }: { pricing: PricingState }) {
  const { table, loading, error, refresh } = pricing;
  const updatedAt = table
    ? new Date(table.fetchedAt).toLocaleString('zh-CN', {
        hour12: false,
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '';

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {loading ? (
        <span>模型价格更新中…</span>
      ) : error && !table ? (
        <span className="font-medium text-destructive">价格获取失败：{error}</span>
      ) : (
        <span>
          价格数据源 <span className="font-medium text-foreground">models.dev</span>
          {updatedAt && ` · ${updatedAt}`}
          <span className="hidden sm:inline"> · 标准价折算</span>
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={refresh}
        disabled={loading}
        className="h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
        title="从 models.dev 重新拉取最新模型价格"
      >
        <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        <span>刷新</span>
      </Button>
    </div>
  );
}

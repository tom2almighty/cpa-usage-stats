import type { PricingState } from '@/lib/pricing';

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
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {loading ? (
        <span>价格数据加载中…</span>
      ) : error && !table ? (
        <span className="text-destructive">价格数据获取失败：{error}</span>
      ) : (
        <span>
          价格来自 models.dev
          {updatedAt && ` · 更新于 ${updatedAt}`}
          {' · 按标准价估算，不含阶梯价与折扣'}
        </span>
      )}
      <button
        type="button"
        onClick={refresh}
        disabled={loading}
        className="rounded-md px-1.5 py-0.5 font-medium underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
      >
        刷新价格
      </button>
    </div>
  );
}

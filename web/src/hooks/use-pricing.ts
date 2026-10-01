import { useCallback, useEffect, useState } from "react";
import { loadPricing, type PricingTable } from "@/lib/pricing";

export interface PricingState {
  table: PricingTable | null;
  loading: boolean;
  error: string;
  /** 强制重新拉取 models.dev 目录 */
  refresh: () => void;
  /** 自定义价格改动后重新匹配（无需重新拉取目录） */
  reload: () => void;
}

/** 加载 models.dev 价格表（带本地缓存）并暴露手动刷新。 */
export function usePricing(): PricingState {
  const [table, setTable] = useState<PricingTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [request, setRequest] = useState({ id: 0, force: false });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadPricing(request.force)
      .then((next) => {
        if (!alive) return;
        setTable(next);
        setError("");
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [request]);

  const refresh = useCallback(() => setRequest((prev) => ({ id: prev.id + 1, force: true })), []);
  const reload = useCallback(() => setRequest((prev) => ({ id: prev.id + 1, force: false })), []);

  return { table, loading, error, refresh, reload };
}

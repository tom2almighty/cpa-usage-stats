import { RefreshCw, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import type { PricingState } from "@/hooks/use-pricing";
import { useI18n } from "@/i18n/context";

/**
 * 价格来源说明。成本数字是按 models.dev 列表价折算的估算值，
 * 所以这里始终展示来源与更新时间，避免被当成账单。
 */
export function PricingSource({ pricing }: { pricing: PricingState }) {
  const { t } = useI18n();
  const { table, loading, error, refresh } = pricing;

  const updatedAt = useMemo(
    () =>
      table
        ? new Date(table.fetchedAt).toLocaleString(undefined, {
            hour12: false,
            dateStyle: "short",
            timeStyle: "short",
          })
        : "",
    [table],
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <Sparkles className="size-3.5 shrink-0" />
      {loading ? (
        <span>{t("pricing.loading")}</span>
      ) : error && !table ? (
        <span className="font-medium text-destructive">{t("pricing.failed", { message: error })}</span>
      ) : (
        <span>
          {t("pricing.source")} <span className="font-medium text-foreground">{t("pricing.provider_name")}</span>
          {updatedAt && ` · ${updatedAt}`}
          <span className="hidden sm:inline"> · {t("pricing.standard_note")}</span>
        </span>
      )}
      <Button
        variant="ghost"
        size="xs"
        onClick={refresh}
        disabled={loading}
        title={t("pricing.refresh_title")}
        className="gap-1 text-muted-foreground hover:text-foreground"
      >
        <RefreshCw className={loading ? "animate-spin" : undefined} />
        {t("common.refresh")}
      </Button>
    </div>
  );
}

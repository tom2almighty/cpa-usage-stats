import { ShieldAlert } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/context";
import { formatNumber } from "@/lib/utils";
import type { FailureStat } from "@/types";

interface FailurePanelProps {
  failures: FailureStat[];
  totalFailed: number;
}

/** 失败请求按上游状态码 + 错误类型归组，附一条样本响应体便于定位。 */
export function FailurePanel({ failures, totalFailed }: FailurePanelProps) {
  const { t } = useI18n();

  if (failures.length === 0) {
    return (
      <Empty className="border-0 py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldAlert />
          </EmptyMedia>
          <EmptyTitle>{t("failures.empty")}</EmptyTitle>
          <EmptyDescription>{t("failures.empty_desc")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const maxRequests = Math.max(...failures.map((item) => item.requests));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-24">{t("failures.th.status")}</TableHead>
          <TableHead>{t("failures.th.type")}</TableHead>
          <TableHead className="text-right">{t("failures.th.requests")}</TableHead>
          <TableHead className="w-28 text-right">{t("failures.th.share")}</TableHead>
          <TableHead>{t("failures.th.sample")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {failures.map((failure) => {
          const share = totalFailed > 0 ? (failure.requests / totalFailed) * 100 : 0;
          return (
            <TableRow key={`${failure.status_code}-${failure.error_type ?? ""}`}>
              <TableCell className="font-mono tabular-nums text-destructive">{failure.status_code || "-"}</TableCell>
              <TableCell className="font-mono text-xs">{failure.error_type || t("failures.no_type")}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatNumber(failure.requests)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-destructive"
                      style={{ width: `${Math.max(2, Math.round((failure.requests / maxRequests) * 100))}%` }}
                    />
                  </div>
                  <span className="w-9 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {share.toFixed(0)}%
                  </span>
                </div>
              </TableCell>
              <TableCell className="max-w-0">
                {failure.sample ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={<span className="block cursor-help truncate font-mono text-xs text-muted-foreground" />}
                    >
                      {failure.sample}
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">
                        {failure.sample}
                      </pre>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

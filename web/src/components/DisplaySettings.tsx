import { Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormat } from "@/hooks/use-format";
import { useI18n } from "@/i18n/context";
import type { Currency, NumberStyle } from "@/lib/format";

// 值到词条的映射显式写出来：值里带连字符/大写，直接拼 key 既对不上也过不了类型检查
const NUMBER_STYLES = [
  { value: "localized", labelKey: "display.number_style_localized" },
  { value: "en-compact", labelKey: "display.number_style_en" },
] as const satisfies readonly { value: NumberStyle; labelKey: string }[];

const CURRENCIES = [
  { value: "USD", labelKey: "display.currency_usd" },
  { value: "CNY", labelKey: "display.currency_cny" },
] as const satisfies readonly { value: Currency; labelKey: string }[];

/**
 * 数字单位与币种的展示偏好。改动立即生效并落到 localStorage，
 * 与语言/主题的交互一致，所以这里不设「保存」。
 */
export function DisplaySettings() {
  const { t } = useI18n();
  const { preferences, update } = useFormat();
  const [open, setOpen] = useState(false);
  // 汇率用本地文本态，避免用户打到一半（"7."）就被规范化
  const [rate, setRate] = useState(() => String(preferences.exchangeRate));

  const rateNumber = Number(rate);
  const rateInvalid = rate.trim() === "" || !Number.isFinite(rateNumber) || rateNumber <= 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setRate(String(preferences.exchangeRate));
        setOpen(next);
      }}
    >
      <DialogTrigger
        render={<Button variant="ghost" size="icon" aria-label={t("display.action")} title={t("display.action")} />}
      >
        <Settings2 />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("display.title")}</DialogTitle>
          <DialogDescription>{t("display.desc")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="display-number-style">{t("display.number_style")}</Label>
            <Select
              items={NUMBER_STYLES.map((item) => ({ value: item.value, label: t(item.labelKey) }))}
              value={preferences.numberStyle}
              onValueChange={(value) => value && update({ numberStyle: value as NumberStyle })}
            >
              <SelectTrigger id="display-number-style" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NUMBER_STYLES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {t(item.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("display.number_style_hint")}</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="display-currency">{t("display.currency")}</Label>
            <Select
              items={CURRENCIES.map((item) => ({ value: item.value, label: t(item.labelKey) }))}
              value={preferences.currency}
              onValueChange={(value) => value && update({ currency: value as Currency })}
            >
              <SelectTrigger id="display-currency" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {t(item.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("display.currency_hint")}</p>
          </div>

          {preferences.currency === "CNY" && (
            <div className="grid gap-2">
              <Label htmlFor="display-rate">{t("display.exchange_rate")}</Label>
              <Input
                id="display-rate"
                inputMode="decimal"
                value={rate}
                aria-invalid={rateInvalid}
                onChange={(event) => {
                  const next = event.target.value;
                  setRate(next);
                  const value = Number(next);
                  if (next.trim() !== "" && Number.isFinite(value) && value > 0) update({ exchangeRate: value });
                }}
                className="font-mono"
              />
              {rateInvalid ? (
                <p className="text-xs text-destructive">{t("display.exchange_rate_invalid")}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("display.exchange_rate_hint")}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("common.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

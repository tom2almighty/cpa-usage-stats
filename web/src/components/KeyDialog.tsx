import { Check, Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n/context";
import type { KeySource } from "@/lib/auth";

interface KeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前是否已有可用密钥 */
  hasKey: boolean;
  source: KeySource;
  error: string;
  onSave: (key: string) => void;
  onClear: () => void;
}

/** 管理密钥入口：输入 / 覆盖 / 清除本地保存的密钥。 */
export function KeyDialog({ open, onOpenChange, hasKey, source, error, onSave, onClear }: KeyDialogProps) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (open) {
      setValue("");
      setRevealed(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            {t("dashboard.key.dialog_title")}
          </DialogTitle>
          <DialogDescription>{t("dashboard.key.dialog_desc")}</DialogDescription>
          {hasKey && (
            <p className="text-xs text-muted-foreground">
              {t("dashboard.key.status_connected")} ·{" "}
              {t("dashboard.key.source_label", { source: t(`dashboard.key.source.${source}`) })}
            </p>
          )}
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim()) onSave(value);
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="management-key">{t("dashboard.key.label")}</Label>
            <div className="flex gap-2">
              <Input
                id="management-key"
                type={revealed ? "text" : "password"}
                autoComplete="off"
                placeholder={t("dashboard.key.placeholder")}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={revealed ? t("dashboard.key.hide") : t("dashboard.key.show")}
                title={revealed ? t("dashboard.key.hide") : t("dashboard.key.show")}
                onClick={() => setRevealed((prev) => !prev)}
              >
                {revealed ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">{t("dashboard.key.ban_hint")}</p>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              onClick={() => {
                onClear();
                onOpenChange(false);
              }}
            >
              <Trash2 />
              {t("dashboard.key.clear")}
            </Button>
            <Button type="submit" size="sm" className="gap-1.5" disabled={!value.trim()}>
              <Check />
              {t("dashboard.key.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

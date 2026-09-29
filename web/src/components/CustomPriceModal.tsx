import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { type ModelPrice, removeCustomPrice, setCustomPrice } from '@/lib/pricing';

interface CustomPriceModalProps {
  modelName: string;
  currentPrice?: ModelPrice | null;
  isCustom?: boolean;
  open: boolean;
  onClose: () => void;
}

export function CustomPriceModal({
  modelName,
  currentPrice,
  isCustom = false,
  open,
  onClose,
}: CustomPriceModalProps) {
  const [inputPrice, setInputPrice] = React.useState('');
  const [outputPrice, setOutputPrice] = React.useState('');
  const [cacheReadPrice, setCacheReadPrice] = React.useState('');
  const [cacheWritePrice, setCacheWritePrice] = React.useState('');
  const [reasoningPrice, setReasoningPrice] = React.useState('');
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setInputPrice(currentPrice?.input !== undefined ? String(currentPrice.input) : '');
      setOutputPrice(currentPrice?.output !== undefined ? String(currentPrice.output) : '');
      setCacheReadPrice(
        currentPrice?.cacheRead !== undefined ? String(currentPrice.cacheRead) : '',
      );
      setCacheWritePrice(
        currentPrice?.cacheWrite !== undefined ? String(currentPrice.cacheWrite) : '',
      );
      setReasoningPrice(
        currentPrice?.reasoning !== undefined ? String(currentPrice.reasoning) : '',
      );
      setError('');
    }
  }, [open, currentPrice]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const inp = Number.parseFloat(inputPrice);
    const out = Number.parseFloat(outputPrice);
    if (!Number.isFinite(inp) || inp < 0 || !Number.isFinite(out) || out < 0) {
      setError('请输入有效的非负输入与输出单价');
      return;
    }

    const price: ModelPrice = {
      input: inp,
      output: out,
    };

    const cr = Number.parseFloat(cacheReadPrice);
    if (Number.isFinite(cr) && cr >= 0) price.cacheRead = cr;
    const cw = Number.parseFloat(cacheWritePrice);
    if (Number.isFinite(cw) && cw >= 0) price.cacheWrite = cw;
    const rz = Number.parseFloat(reasoningPrice);
    if (Number.isFinite(rz) && rz >= 0) price.reasoning = rz;

    setCustomPrice(modelName, price);
    onClose();
  };

  const handleReset = () => {
    removeCustomPrice(modelName);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <form onSubmit={handleSave} className="space-y-4">
        <DialogHeader>
          <DialogTitle>自定义模型价格</DialogTitle>
          <DialogDescription>
            为模型{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">
              {modelName}
            </code>{' '}
            设置单价（美元 / 100万 Tokens）。价格保存在本地，优先于官方目录。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <label htmlFor="price-input" className="font-medium text-foreground">
              输入单价 ($ / 1M) *
            </label>
            <Input
              id="price-input"
              type="number"
              step="any"
              min="0"
              placeholder="例如 3.00"
              value={inputPrice}
              onChange={(e) => setInputPrice(e.target.value)}
              required
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="price-output" className="font-medium text-foreground">
              输出单价 ($ / 1M) *
            </label>
            <Input
              id="price-output"
              type="number"
              step="any"
              min="0"
              placeholder="例如 15.00"
              value={outputPrice}
              onChange={(e) => setOutputPrice(e.target.value)}
              required
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="price-cacheread" className="text-muted-foreground">
              缓存读取单价 (可选)
            </label>
            <Input
              id="price-cacheread"
              type="number"
              step="any"
              min="0"
              placeholder="例如 0.30"
              value={cacheReadPrice}
              onChange={(e) => setCacheReadPrice(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="price-cachewrite" className="text-muted-foreground">
              缓存写入单价 (可选)
            </label>
            <Input
              id="price-cachewrite"
              type="number"
              step="any"
              min="0"
              placeholder="例如 3.75"
              value={cacheWritePrice}
              onChange={(e) => setCacheWritePrice(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <label htmlFor="price-reasoning" className="text-muted-foreground">
              思考/推理单价 (可选，缺省沿用输出价)
            </label>
            <Input
              id="price-reasoning"
              type="number"
              step="any"
              min="0"
              placeholder="缺省等于输出单价"
              value={reasoningPrice}
              onChange={(e) => setReasoningPrice(e.target.value)}
              className="h-8 text-xs font-mono"
            />
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter className="gap-2">
          {isCustom && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="text-destructive hover:bg-destructive/10"
            >
              清除自定义价格
            </Button>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" size="sm">
            保存
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

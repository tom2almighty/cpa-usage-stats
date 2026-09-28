import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface AuthDialogProps {
  /** Called with the key to use; empty string clears a saved key. */
  onSubmit: (key: string) => void;
  error?: string;
}

/**
 * Fallback for when the management key cannot be resolved from the management
 * center's storage ("remember password" off, or a cross-origin deployment).
 */
export function AuthDialog({ onSubmit, error }: AuthDialogProps) {
  const [value, setValue] = useState('');

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <CardTitle>需要管理密钥</CardTitle>
          <CardDescription>
            {
              '未能自动读取管理密钥（cpa-dashboard 未保存密钥、管理中心未勾选「记住密码」，或面板与 CLIProxyAPI 跨源部署）。请输入管理密钥后重试。'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(value.trim());
            }}
            className="flex gap-2"
          >
            <Input
              type="password"
              placeholder="管理密钥 (management key)"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
            <Button type="submit" disabled={!value.trim()}>
              连接
            </Button>
          </form>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            {'密钥仅保存在浏览器 localStorage，用于调用本插件的管理接口。'}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {
              '管理密钥连续输错 5 次会被 CLIProxyAPI 判定为认证失败并临时封禁该 IP 约 30 分钟，请确认密钥无误后再连接。'
            }
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

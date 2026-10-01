import { useCallback, useState } from "react";
import { clearOwnKey, getStoredOwnKey, type KeySource, resolveManagementKey, storeOwnKey } from "@/lib/auth";

interface ManagementKeyState {
  /** 当前密钥，空串表示没有可用密钥 */
  key: string;
  source: KeySource;
  /** 用户主动输入的密钥会覆盖自动解析结果 */
  setKey: (key: string) => void;
  clear: () => void;
}

/**
 * 解析一次管理密钥并在会话内保持。优先使用本插件保存的密钥，
 * 其次复用面板/管理中心保存的密钥，都没有时为空。
 */
export function useManagementKey(): ManagementKeyState {
  const [state, setState] = useState(() => resolveManagementKey());

  const setKey = useCallback((key: string) => {
    const trimmed = key.trim();
    storeOwnKey(trimmed);
    setState({ key: trimmed, source: "own" });
  }, []);

  const clear = useCallback(() => {
    clearOwnKey();
    setState(resolveManagementKey());
  }, []);

  return { key: state.key, source: state.source, setKey, clear };
}

export { getStoredOwnKey };

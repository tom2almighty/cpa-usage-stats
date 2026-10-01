/**
 * 管理密钥解析。
 *
 * 看板由 CLIProxyAPI 以资源页形式挂在管理中心 iframe 内，同源时可以复用
 * 面板保存的密钥；跨源或未保存时退回用户手动输入，存在本插件自己的键里。
 * 顺序：本插件保存 → cpa-dashboard 面板保存 → 管理中心保存。
 */

const MC_AUTH_KEY = "cli-proxy-auth";
const ENC_PREFIX = "enc::v1::";
const SECRET_SALT = "cli-proxy-api-webui::secure-storage";
const OWN_KEY_STORAGE = "cpa-usage-stats.management-key";
const PANEL_KEY_STORAGE = "cpa-dashboard.management-key";

export type KeySource = "own" | "panel" | "center";

interface ResolvedKey {
  key: string;
  source: KeySource;
}

function readStorage(read: () => string): string {
  try {
    return read() ?? "";
  } catch {
    // 隐私模式下 storage 不可用
    return "";
  }
}

function getKeyBytes(): Uint8Array {
  const host = window.location.host;
  const ua = navigator.userAgent;
  return new TextEncoder().encode(`${SECRET_SALT}|${host}|${ua}`);
}

function xorBytes(data: Uint8Array, keyBytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ keyBytes[i % keyBytes.length];
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** 管理中心用 XOR + base64 混淆保存连接状态，这里做同样的还原 */
function deobfuscate(payload: string): string {
  if (!payload.startsWith(ENC_PREFIX)) return payload;
  const encrypted = base64ToBytes(payload.slice(ENC_PREFIX.length));
  return new TextDecoder().decode(xorBytes(encrypted, getKeyBytes()));
}

export function getStoredOwnKey(): string {
  return readStorage(() => localStorage.getItem(OWN_KEY_STORAGE) ?? "");
}

export function storeOwnKey(key: string) {
  try {
    if (key) {
      localStorage.setItem(OWN_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(OWN_KEY_STORAGE);
    }
  } catch {
    // 隐私模式下无法持久化，本次会话仍然可用
  }
}

export function clearOwnKey() {
  storeOwnKey("");
}

function fromPanel(): string {
  return readStorage(() => sessionStorage.getItem(PANEL_KEY_STORAGE) ?? localStorage.getItem(PANEL_KEY_STORAGE) ?? "");
}

function fromManagementCenter(): string {
  const raw = readStorage(() => localStorage.getItem(MC_AUTH_KEY) ?? "");
  if (!raw) return "";
  try {
    const parsed: unknown = JSON.parse(deobfuscate(raw));
    if (parsed && typeof parsed === "object" && "managementKey" in parsed) {
      const key: unknown = parsed.managementKey;
      return typeof key === "string" ? key : "";
    }
  } catch {
    // 非同源、混淆格式变化或内容损坏
  }
  return "";
}

/** 返回可用的管理密钥及其来源；都没有时返回空 key。 */
export function resolveManagementKey(): ResolvedKey {
  const own = getStoredOwnKey();
  if (own) return { key: own, source: "own" };

  const panel = fromPanel();
  if (panel) return { key: panel, source: "panel" };

  const center = fromManagementCenter();
  if (center) return { key: center, source: "center" };

  return { key: "", source: "own" };
}

/**
 * 插件管理接口的 base。资源页始终由 CLIProxyAPI 自己提供，因此接口默认同源；
 * `?api_base=` 用于本地起前端调试远程宿主。
 */
export function resolveApiBase(): string {
  try {
    const override = new URLSearchParams(window.location.search).get("api_base");
    if (override) return override.replace(/\/+$/, "");
  } catch {
    // URL 异常时按同源处理
  }
  return window.location.origin;
}

/**
 * Management-key resolution for the trusted plugin resource page.
 *
 * The official management center persists its connection state (including the
 * management key when "remember password" is on) in localStorage under
 * 'cli-proxy-auth', obfuscated with a reversible XOR + base64 scheme. The
 * plugin resource page runs same-origin inside the management center iframe,
 * so it can decode that entry and reuse the key against the plugin's own
 * /v0/management routes. When decoding fails (cross-origin deployment or
 * "remember password" off) the dashboard falls back to a key the user types
 * in, stored under this plugin's own localStorage entry.
 */

const MC_AUTH_KEY = 'cli-proxy-auth';
const ENC_PREFIX = 'enc::v1::';
const SECRET_SALT = 'cli-proxy-api-webui::secure-storage';
export const OWN_KEY_STORAGE = 'cpa-usage-stats.management-key';

function getKeyBytes(): Uint8Array {
  // Same inputs as the management center: the salt, the page host and the
  // user agent. Inside the iframe host and UA match the parent page.
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

export function deobfuscate(payload: string): string {
  if (!payload.startsWith(ENC_PREFIX)) return payload;
  const encrypted = base64ToBytes(payload.slice(ENC_PREFIX.length));
  return new TextDecoder().decode(xorBytes(encrypted, getKeyBytes()));
}

/** Key the user typed in, stored under the plugin's own entry. */
export function getStoredOwnKey(): string {
  try {
    return localStorage.getItem(OWN_KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function storeOwnKey(key: string) {
  try {
    if (key) {
      localStorage.setItem(OWN_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(OWN_KEY_STORAGE);
    }
  } catch {
    // Storage may be unavailable (privacy mode); the key just won't persist.
  }
}

export function clearOwnKey() {
  storeOwnKey('');
}

/**
 * Returns the management key to use, trying in order:
 * 1. the key saved by this dashboard,
 * 2. the management center's saved key (same-origin only).
 */
export function resolveManagementKey(): string {
  const own = getStoredOwnKey();
  if (own) return own;
  try {
    const raw = localStorage.getItem(MC_AUTH_KEY);
    if (!raw) return '';
    const parsed: unknown = JSON.parse(deobfuscate(raw));
    if (parsed && typeof parsed === 'object') {
      const key = (parsed as Record<string, unknown>).managementKey;
      if (typeof key === 'string') return key;
    }
  } catch {
    // Not same-origin, obfuscation format changed, or garbage — fall through.
  }
  return '';
}

/**
 * Base URL for the plugin management API. The resource page is always served
 * by CLIProxyAPI itself, so the API lives on the page's own origin. A
 * ?api_base= query param overrides it for local development against a
 * separately running host.
 */
export function resolveApiBase(): string {
  try {
    const override = new URLSearchParams(window.location.search).get('api_base');
    if (override) return override.replace(/\/+$/, '');
  } catch {
    // Malformed URL; fall through to same-origin.
  }
  return window.location.origin;
}

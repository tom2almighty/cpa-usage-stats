import { resolveApiBase } from "@/lib/auth";
import type { OptionsResponse, RecordListResponse, RuntimeStats, SummaryData } from "@/types";

const API_BASE = "/v0/management/plugins/cpa-usage-stats";

/** 401：密钥缺失或无效 */
export class UnauthorizedError extends Error {
  constructor() {
    super("management key required");
    this.name = "UnauthorizedError";
  }
}

interface ApiFilters {
  range: string;
  model: string;
  provider: string;
  apiKey: string;
  authId: string;
  sessionId: string;
  failed?: string;
  keyword?: string;
}

async function request<T>(key: string, path: string, params: Record<string, string>): Promise<T> {
  // 没有密钥就不发请求：CPA 会把无鉴权请求计入认证失败次数，连续 5 次会封禁该 IP
  if (!key) throw new UnauthorizedError();

  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== ""));
  const suffix = query.toString() ? `?${query}` : "";
  const res = await fetch(`${resolveApiBase()}${API_BASE}${path}${suffix}`, {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // 非 JSON 错误体，保留 HTTP 状态
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function filterParams(filters: ApiFilters): Record<string, string> {
  return {
    range: filters.range,
    model: filters.model,
    provider: filters.provider,
    api_key: filters.apiKey,
    auth_id: filters.authId,
    session_id: filters.sessionId,
    failed: filters.failed ?? "",
    keyword: filters.keyword?.trim() ?? "",
  };
}

export function fetchSummary(key: string, filters: ApiFilters): Promise<SummaryData> {
  return request<SummaryData>(key, "/summary", filterParams(filters));
}

export function fetchRecords(
  key: string,
  filters: ApiFilters,
  page: number,
  pageSize: number,
): Promise<RecordListResponse> {
  return request<RecordListResponse>(key, "/records", {
    ...filterParams(filters),
    page: String(page),
    page_size: String(pageSize),
  });
}

export function fetchOptions(key: string): Promise<OptionsResponse> {
  return request<OptionsResponse>(key, "/options", {});
}

export function fetchStats(key: string): Promise<RuntimeStats> {
  return request<RuntimeStats>(key, "/stats", {});
}

/**
 * 查询缓存按密钥分域：密钥变了缓存不能复用，但也不能把密钥本身写进
 * queryKey（会被 devtools/缓存序列化）。这里只留一个稳定的短指纹。
 */
export function keyFingerprint(key: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

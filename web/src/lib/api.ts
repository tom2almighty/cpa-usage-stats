import { resolveApiBase } from '@/lib/auth';
import type { OptionsResponse, RecordListResponse, SummaryData } from '@/types';

const API_BASE = '/v0/management/plugins/cpa-usage-stats';

export class UnauthorizedError extends Error {
  constructor() {
    super('management key required');
    this.name = 'UnauthorizedError';
  }
}

let bearer: string | null = null;

/** Set the management key used on every request; null clears it. */
export function setManagementKey(key: string | null) {
  const trimmed = key?.trim();
  bearer = trimmed ? trimmed : null;
}

export function hasManagementKey(): boolean {
  return bearer !== null;
}

async function request<T>(path: string, params: Record<string, string>): Promise<T> {
  // 没有密钥就不要发请求：CPA 会把无鉴权请求计入认证失败次数，连续 5 次会封禁该 IP 约 30 分钟
  if (!bearer) {
    throw new UnauthorizedError();
  }
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== '' && v !== undefined),
  );
  const res = await fetch(
    `${resolveApiBase()}${API_BASE}${path}${query.toString() ? `?${query}` : ''}`,
    {
      headers: { Authorization: `Bearer ${bearer}` },
    },
  );
  if (res.status === 401) {
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      // Non-JSON error body; keep the HTTP status message.
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function filterParams(filters: {
  range: string;
  model: string;
  provider: string;
  apiKey: string;
  failed?: string;
  keyword?: string;
}): Record<string, string> {
  return {
    range: filters.range,
    model: filters.model,
    provider: filters.provider,
    api_key: filters.apiKey,
    failed: filters.failed ?? '',
    keyword: filters.keyword?.trim() ?? '',
  };
}

export function fetchSummary(filters: Parameters<typeof filterParams>[0]): Promise<SummaryData> {
  return request<SummaryData>('/summary', filterParams(filters));
}

export function fetchRecords(
  filters: Parameters<typeof filterParams>[0],
  page: number,
  pageSize: number,
): Promise<RecordListResponse> {
  return request<RecordListResponse>('/records', {
    ...filterParams(filters),
    page: String(page),
    page_size: String(pageSize),
  });
}

export function fetchOptions(): Promise<OptionsResponse> {
  return request<OptionsResponse>('/options', {});
}

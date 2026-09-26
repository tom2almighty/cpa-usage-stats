export interface ModelStat {
  model: string;
  provider: string;
  total_requests: number;
  failed_requests: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  avg_latency_ms: number;
}

export interface ProviderStat {
  provider: string;
  total_requests: number;
  failed_requests: number;
  total_tokens: number;
}

export interface DailyStat {
  date: string;
  total_requests: number;
  failed_requests: number;
  total_tokens: number;
}

export interface SummaryData {
  total_requests: number;
  success_requests: number;
  failed_requests: number;
  success_rate: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  avg_latency_ms: number;
  avg_ttft_ms: number;
  model_stats: ModelStat[];
  provider_stats: ProviderStat[];
  daily_stats: DailyStat[];
}

export interface StoredRecord {
  id: number;
  request_id: string;
  trace_id: string;
  provider: string;
  model: string;
  alias: string;
  api_key: string;
  auth_id: string;
  auth_type: string;
  source: string;
  stream: boolean;
  requested_at: string;
  latency_ms: number;
  ttft_ms: number;
  failed: boolean;
  status_code: number;
  failure_body?: string;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  total_tokens: number;
}

export interface RecordListResponse {
  total: number;
  page: number;
  page_size: number;
  items: StoredRecord[];
}

export type TimeRange = 'today' | 'yesterday' | '7d' | '30d' | 'all';

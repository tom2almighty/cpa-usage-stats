export interface GroupStat {
  name: string;
  /** Provider (model grouping) or auth index (auth grouping). */
  secondary?: string;
  requests: number;
  failed: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  avg_ttft_ms: number;
  stream_requests: number;
}

export interface TrendPoint {
  bucket: string;
  requests: number;
  failed: number;
  tokens: number;
  input_tokens: number;
  output_tokens: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
}

/** Failed requests grouped by upstream status and machine-readable error type. */
export interface FailureStat {
  status_code: number;
  error_type?: string;
  requests: number;
  sample?: string;
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
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cache_hit_rate: number;
  avg_latency_ms: number;
  avg_ttft_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  avg_output_tps: number;
  stream_requests: number;
  dropped_records: number;
  model_stats: GroupStat[];
  provider_stats: GroupStat[];
  api_key_stats: GroupStat[];
  auth_stats: GroupStat[];
  session_stats: GroupStat[];
  failure_stats: FailureStat[];
  bucket: "hour" | "day";
  trend: TrendPoint[];
}

export interface StoredRecord {
  id: number;
  request_id: string;
  trace_id: string;
  session_id: string;
  parent_session_id: string;
  provider: string;
  base_url: string;
  executor_type: string;
  model: string;
  response_model: string;
  alias: string;
  api_key: string;
  auth_id: string;
  auth_index: string;
  auth_type: string;
  source: string;
  reasoning_effort: string;
  service_tier: string;
  response_service_tier: string;
  stream: boolean;
  generate: boolean;
  requested_at: string;
  latency_ms: number;
  ttft_ms: number;
  failed: boolean;
  status_code: number;
  error_type?: string;
  failure_body?: string;
  response_headers?: Record<string, string[]>;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
}

export interface RecordListResponse {
  total: number;
  page: number;
  page_size: number;
  items: StoredRecord[];
}

export interface OptionsResponse {
  models: string[];
  providers: string[];
  api_keys: string[];
  auths: string[];
}

/** Runtime counters that live outside the database. */
export interface RuntimeStats {
  dropped_records: number;
  queue_depth: number;
  queue_capacity: number;
}

export type TimeRange = "today" | "yesterday" | "7d" | "30d" | "all";

export type TabKey = "overview" | "records";

export interface RecordsFilters {
  model: string;
  provider: string;
  apiKey: string;
  authId: string;
  sessionId: string;
  status: "all" | "success" | "failed";
  keyword: string;
}

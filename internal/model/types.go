package model

import (
	"encoding/json"
	"net/http"
	"net/url"
	"time"
)

// Envelope is the standard JSON envelope used by C ABI plugin communication.
type Envelope struct {
	OK     bool            `json:"ok"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *EnvelopeError  `json:"error,omitempty"`
}

// EnvelopeError represents an RPC error.
type EnvelopeError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// UsageRecord describes request usage and billing metadata from CLIProxyAPI.
type UsageRecord struct {
	RequestID           string        `json:"RequestID,omitempty"`
	TraceID             string        `json:"TraceID,omitempty"`
	Provider            string        `json:"Provider,omitempty"`
	BaseURL             string        `json:"BaseURL,omitempty"`
	ExecutorType        string        `json:"ExecutorType,omitempty"`
	Model               string        `json:"Model,omitempty"`
	Alias               string        `json:"Alias,omitempty"`
	APIKey              string        `json:"APIKey,omitempty"`
	SessionID           string        `json:"SessionID,omitempty"`
	ParentSessionID     string        `json:"ParentSessionID,omitempty"`
	AuthID              string        `json:"AuthID,omitempty"`
	AuthIndex           string        `json:"AuthIndex,omitempty"`
	AuthType            string        `json:"AuthType,omitempty"`
	Source              string        `json:"Source,omitempty"`
	ReasoningEffort     string        `json:"ReasoningEffort,omitempty"`
	ServiceTier         string        `json:"ServiceTier,omitempty"`
	ResponseServiceTier string        `json:"ResponseServiceTier,omitempty"`
	ResponseModel       string        `json:"ResponseModel,omitempty"`
	Generate            bool          `json:"Generate,omitempty"`
	Stream              bool          `json:"Stream,omitempty"`
	RequestedAt         time.Time     `json:"RequestedAt"`
	Latency             time.Duration `json:"Latency"`
	TTFT                time.Duration `json:"TTFT"`
	Failed              bool          `json:"Failed"`
	Failure             UsageFailure  `json:"Failure,omitempty"`
	Detail              UsageDetail   `json:"Detail"`
	ResponseHeaders     http.Header   `json:"ResponseHeaders,omitempty"`
}

// UsageFailure describes an upstream or executor failure.
type UsageFailure struct {
	StatusCode int    `json:"StatusCode,omitempty"`
	Body       string `json:"Body,omitempty"`
}

// UsageDetail contains token accounting counters.
type UsageDetail struct {
	InputTokens         int64 `json:"InputTokens"`
	OutputTokens        int64 `json:"OutputTokens"`
	ReasoningTokens     int64 `json:"ReasoningTokens"`
	CachedTokens        int64 `json:"CachedTokens"`
	CacheReadTokens     int64 `json:"CacheReadTokens"`
	CacheCreationTokens int64 `json:"CacheCreationTokens"`
	TotalTokens         int64 `json:"TotalTokens"`
}

// StoredRecord represents a record stored in SQLite.
type StoredRecord struct {
	ID              int64     `json:"id"`
	RequestID       string    `json:"request_id"`
	TraceID         string    `json:"trace_id"`
	Provider        string    `json:"provider"`
	Model           string    `json:"model"`
	Alias           string    `json:"alias"`
	APIKey          string    `json:"api_key"`
	AuthID          string    `json:"auth_id"`
	AuthType        string    `json:"auth_type"`
	Source          string    `json:"source"`
	Stream          bool      `json:"stream"`
	RequestedAt     time.Time `json:"requested_at"`
	LatencyMs       int64     `json:"latency_ms"`
	TTFTMs          int64     `json:"ttft_ms"`
	Failed          bool      `json:"failed"`
	StatusCode      int       `json:"status_code"`
	FailureBody     string    `json:"failure_body,omitempty"`
	InputTokens     int64     `json:"input_tokens"`
	OutputTokens    int64     `json:"output_tokens"`
	ReasoningTokens int64     `json:"reasoning_tokens"`
	CachedTokens    int64     `json:"cached_tokens"`
	TotalTokens     int64     `json:"total_tokens"`
}

// ManagementRequest describes an incoming HTTP request via management API.
type ManagementRequest struct {
	Method  string      `json:"Method"`
	Path    string      `json:"Path"`
	Headers http.Header `json:"Headers"`
	Query   url.Values  `json:"Query"`
	Body    []byte      `json:"Body"`
}

// ManagementResponse describes a response to Management API.
type ManagementResponse struct {
	StatusCode int         `json:"StatusCode"`
	Headers    http.Header `json:"Headers"`
	Body       []byte      `json:"Body"`
}

// ManagementRegistrationResponse declares routes and resources.
type ManagementRegistrationResponse struct {
	Routes    []ManagementRoute `json:"routes,omitempty"`
	Resources []ResourceRoute   `json:"resources,omitempty"`
}

// ManagementRoute describes one plugin-owned Management API route.
type ManagementRoute struct {
	Method      string `json:"Method"`
	Path        string `json:"Path"`
	Description string `json:"Description,omitempty"`
}

// ResourceRoute describes one plugin-owned browser-navigable resource route.
type ResourceRoute struct {
	Path        string `json:"Path"`
	Menu        string `json:"Menu"`
	Description string `json:"Description"`
}

// UsageFilter represents query filter parameters.
type UsageFilter struct {
	StartTime *time.Time
	EndTime   *time.Time
	Model     string
	Provider  string
	APIKey    string
	Failed    *bool
	Keyword   string
	Page      int
	PageSize  int
}

// SummaryResponse represents aggregated statistics for a time range.
type SummaryResponse struct {
	TotalRequests   int64        `json:"total_requests"`
	FailedRequests  int64        `json:"failed_requests"`
	TotalTokens     int64        `json:"total_tokens"`
	InputTokens     int64        `json:"input_tokens"`
	OutputTokens    int64        `json:"output_tokens"`
	ReasoningTokens int64        `json:"reasoning_tokens"`
	CachedTokens    int64        `json:"cached_tokens"`
	AvgLatencyMs    float64      `json:"avg_latency_ms"`
	AvgTTFTMs       float64      `json:"avg_ttft_ms"`
	Models          []GroupStat  `json:"models"`
	Providers       []GroupStat  `json:"providers"`
	APIKeys         []GroupStat  `json:"api_keys"`
	Bucket          string       `json:"bucket"`
	Trend           []TrendPoint `json:"trend"`
}

// GroupStat aggregates usage for one model, provider or API key.
type GroupStat struct {
	Name         string  `json:"name"`
	Requests     int64   `json:"requests"`
	Failed       int64   `json:"failed"`
	TotalTokens  int64   `json:"total_tokens"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	CachedTokens int64   `json:"cached_tokens"`
	AvgLatencyMs float64 `json:"avg_latency_ms"`
}

// TrendPoint is one hour ("2006-01-02 15") or day ("2006-01-02") bucket.
type TrendPoint struct {
	Bucket   string `json:"bucket"`
	Requests int64  `json:"requests"`
	Failed   int64  `json:"failed"`
	Tokens   int64  `json:"tokens"`
}

// RecordListResponse represents paginated records response.
type RecordListResponse struct {
	Total    int64          `json:"total"`
	Page     int            `json:"page"`
	PageSize int            `json:"page_size"`
	Items    []StoredRecord `json:"items"`
}

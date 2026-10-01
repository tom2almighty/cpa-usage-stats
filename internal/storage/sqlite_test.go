package storage

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"cpa-usage-stats/internal/model"
)

func TestStorageSummaryRecordsAndRetention(t *testing.T) {
	store, err := New(filepath.Join(t.TempDir(), "usage.db"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer store.Close()

	now := time.Now()
	records := []model.UsageRecord{
		{
			RequestID:       "req-1",
			Provider:        "openai",
			Model:           "gpt-5",
			ResponseModel:   "gpt-5.2",
			SessionID:       "sess-1",
			APIKey:          "sk-a",
			AuthIndex:       "0",
			ReasoningEffort: "high",
			ServiceTier:     "priority",
			RequestedAt:     now.Add(-2 * time.Hour),
			Latency:         1500 * time.Millisecond,
			TTFT:            300 * time.Millisecond,
			Stream:          true,
			Detail:          model.UsageDetail{InputTokens: 100, OutputTokens: 50, CachedTokens: 20, CacheReadTokens: 15, CacheCreationTokens: 5, TotalTokens: 150},
		},
		{
			RequestID:   "req-2",
			Provider:    "claude",
			Model:       "claude-sonnet-4-5",
			APIKey:      "sk-b",
			RequestedAt: now.Add(-1 * time.Hour).UTC(), // host may send UTC; must be stored as local wall time
			Latency:     2000 * time.Millisecond,
			Failed:      true,
			Failure:     model.UsageFailure{StatusCode: 429, Body: "rate limit exceeded"},
			Detail:      model.UsageDetail{InputTokens: 200, TotalTokens: 200},
		},
		{
			RequestID:   "req-old",
			Model:       "gpt-5",
			RequestedAt: now.AddDate(0, 0, -10),
		},
	}
	if err := store.InsertBatch(records); err != nil {
		t.Fatalf("InsertBatch: %v", err)
	}

	start := now.Add(-3 * time.Hour)
	summary, err := store.GetSummary(model.UsageFilter{StartTime: &start}, true)
	if err != nil {
		t.Fatalf("GetSummary: %v", err)
	}
	if summary.TotalRequests != 2 || summary.FailedRequests != 1 || summary.TotalTokens != 350 {
		t.Errorf("totals = %d req / %d failed / %d tokens, want 2/1/350", summary.TotalRequests, summary.FailedRequests, summary.TotalTokens)
	}
	if summary.SuccessRate != 50 {
		t.Errorf("success rate = %v, want 50", summary.SuccessRate)
	}
	if summary.CacheReadTokens != 15 || summary.CacheCreationTokens != 5 {
		t.Errorf("cache split = read %d / creation %d, want 15/5", summary.CacheReadTokens, summary.CacheCreationTokens)
	}
	if summary.AvgTTFTMs != 300 {
		t.Errorf("avg ttft = %v, want 300 (stream-only)", summary.AvgTTFTMs)
	}
	if len(summary.Models) != 2 || summary.Models[0].Name != "claude-sonnet-4-5" {
		t.Errorf("models should be ordered by tokens desc, got %+v", summary.Models)
	}
	if len(summary.Models) > 0 && summary.Models[0].Secondary != "claude" {
		t.Errorf("model group should carry provider in secondary, got %+v", summary.Models[0])
	}
	if len(summary.APIKeys) != 2 || len(summary.Providers) != 2 {
		t.Errorf("want 2 api keys and 2 providers, got %d / %d", len(summary.APIKeys), len(summary.Providers))
	}
	if summary.Bucket != "hour" || len(summary.Trend) == 0 || len(summary.Trend[0].Bucket) != len("2006-01-02 15") {
		t.Errorf("unexpected hourly trend: bucket=%s trend=%+v", summary.Bucket, summary.Trend)
	}
	if summary.Trend[0].InputTokens == 0 || summary.Trend[0].OutputTokens == 0 {
		t.Errorf("trend points should carry input/output tokens, got %+v", summary.Trend[0])
	}

	options, err := store.GetOptions()
	if err != nil {
		t.Fatalf("GetOptions: %v", err)
	}
	if len(options.Models) != 2 || options.Models[0] != "claude-sonnet-4-5" || len(options.APIKeys) != 2 {
		t.Errorf("options = %+v", options)
	}

	failedOnly := true
	list, err := store.GetRecords(model.UsageFilter{StartTime: &start, Failed: &failedOnly, Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("GetRecords: %v", err)
	}
	if list.Total != 1 || list.Items[0].FailureBody != "rate limit exceeded" || !list.Items[0].Failed {
		t.Fatalf("failed filter returned %+v", list)
	}
	if got := list.Items[0].RequestedAt; got.Sub(records[1].RequestedAt).Abs() > time.Millisecond {
		t.Errorf("requested_at round trip = %v, want %v", got, records[1].RequestedAt)
	}

	if affected, err := store.CleanRetention(7); err != nil || affected != 1 {
		t.Errorf("CleanRetention(7) = %d, %v; want 1 old record removed", affected, err)
	}
}

// TestLegacySchemaRebuilt verifies that a database created by the pre-v8
// plugin is dropped and rebuilt on open instead of failing queries.
func TestLegacySchemaRebuilt(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "usage.db")

	legacy := `
	CREATE TABLE usage_records (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		request_id TEXT NOT NULL,
		trace_id TEXT,
		provider TEXT,
		model TEXT,
		alias TEXT,
		api_key TEXT,
		auth_id TEXT,
		auth_type TEXT,
		source TEXT,
		stream INTEGER,
		requested_at DATETIME NOT NULL,
		latency_ms INTEGER,
		ttft_ms INTEGER,
		failed INTEGER,
		status_code INTEGER,
		failure_body TEXT,
		input_tokens INTEGER,
		output_tokens INTEGER,
		reasoning_tokens INTEGER,
		cached_tokens INTEGER,
		total_tokens INTEGER
	);
	INSERT INTO usage_records (request_id, model, requested_at) VALUES ('legacy-1', 'old-model', '2026-01-01 00:00:00.000');
	`
	if _, err := sql.Open("sqlite", dbPath); err != nil {
		t.Fatalf("open legacy db: %v", err)
	}
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open legacy db: %v", err)
	}
	if _, err := db.Exec(legacy); err != nil {
		t.Fatalf("create legacy table: %v", err)
	}
	_ = db.Close()

	store, err := New(dbPath)
	if err != nil {
		t.Fatalf("New on legacy db: %v", err)
	}
	defer store.Close()

	var version int
	if err := store.db.QueryRow("PRAGMA user_version").Scan(&version); err != nil || version != schemaVersion {
		t.Fatalf("user_version = %d, %v; want %d", version, err, schemaVersion)
	}
	var count int
	if err := store.db.QueryRow("SELECT COUNT(*) FROM usage_records").Scan(&count); err != nil || count != 0 {
		t.Fatalf("legacy rows survived rebuild: %d, %v", count, err)
	}
	if err := store.InsertBatch([]model.UsageRecord{{RequestID: "new-1", Model: "gpt-5", RequestedAt: time.Now(), Detail: model.UsageDetail{TotalTokens: 1}}}); err != nil {
		t.Fatalf("insert into rebuilt table: %v", err)
	}
}

// TestV8FieldsRoundTrip verifies the v8-only columns survive a write/read cycle.
func TestV8FieldsRoundTrip(t *testing.T) {
	store, err := New(filepath.Join(t.TempDir(), "usage.db"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer store.Close()

	in := model.UsageRecord{
		RequestID:           "req-8",
		TraceID:             "ab12cd34",
		SessionID:           "sess-8",
		Provider:            "codex",
		BaseURL:             "https://upstream.example.com",
		Model:               "gpt-5",
		ResponseModel:       "gpt-5.2",
		Alias:               "my-gpt",
		APIKey:              "sk-v8",
		AuthID:              "auth-8",
		AuthIndex:           "3",
		AuthType:            "oauth",
		Source:              "openai",
		ReasoningEffort:     "medium",
		ServiceTier:         "default",
		ResponseServiceTier: "priority",
		Generate:            true,
		Stream:              true,
		RequestedAt:         time.Now(),
		Detail:              model.UsageDetail{InputTokens: 10, OutputTokens: 5, ReasoningTokens: 7, CachedTokens: 9, CacheReadTokens: 8, CacheCreationTokens: 2, TotalTokens: 15},
	}
	if err := store.InsertBatch([]model.UsageRecord{in}); err != nil {
		t.Fatalf("InsertBatch: %v", err)
	}

	list, err := store.GetRecords(model.UsageFilter{Keyword: "sess-8"})
	if err != nil {
		t.Fatalf("GetRecords: %v", err)
	}
	if list.Total != 1 {
		t.Fatalf("keyword over session_id found %d records, want 1", list.Total)
	}
	got := list.Items[0]
	if got.SessionID != in.SessionID || got.ResponseModel != in.ResponseModel || got.BaseURL != in.BaseURL ||
		got.AuthIndex != in.AuthIndex || got.ReasoningEffort != in.ReasoningEffort ||
		got.ServiceTier != in.ServiceTier || got.ResponseServiceTier != in.ResponseServiceTier ||
		!got.Generate || !got.Stream ||
		got.CacheReadTokens != 8 || got.CacheCreationTokens != 2 || got.ReasoningTokens != 7 {
		t.Errorf("v8 fields round trip mismatch: %+v", got)
	}
}

// TestFailureHeadersSaved verifies response headers are only saved on failed requests,
// filtered for sensitive headers, and retrieved properly.
func TestFailureHeadersSaved(t *testing.T) {
	store, err := New(filepath.Join(t.TempDir(), "usage.db"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer store.Close()

	successReq := model.UsageRecord{
		RequestID:   "req-success",
		Model:       "gpt-4o",
		Failed:      false,
		RequestedAt: time.Now(),
		ResponseHeaders: map[string][]string{
			"Content-Type": {"application/json"},
			"X-Request-Id": {"req-success"},
		},
	}

	failedReq := model.UsageRecord{
		RequestID:   "req-failed",
		Model:       "gpt-4o",
		Failed:      true,
		Failure:     model.UsageFailure{StatusCode: 429, Body: "rate limited"},
		RequestedAt: time.Now(),
		ResponseHeaders: map[string][]string{
			"Content-Type":  {"application/json"},
			"Retry-After":   {"30"},
			"X-Request-Id":  {"trace-xyz"},
			"Set-Cookie":    {"secret_session=123"},
			"Authorization": {"Bearer secret"},
		},
	}

	if err := store.InsertBatch([]model.UsageRecord{successReq, failedReq}); err != nil {
		t.Fatalf("InsertBatch: %v", err)
	}

	list, err := store.GetRecords(model.UsageFilter{})
	if err != nil {
		t.Fatalf("GetRecords: %v", err)
	}
	if list.Total != 2 {
		t.Fatalf("expected 2 records, got %d", list.Total)
	}

	for _, item := range list.Items {
		if !item.Failed {
			if len(item.ResponseHeaders) != 0 {
				t.Errorf("successful request should not persist response headers, got %+v", item.ResponseHeaders)
			}
		} else {
			if len(item.ResponseHeaders) == 0 {
				t.Fatalf("failed request should persist response headers")
			}
			if _, ok := item.ResponseHeaders["Set-Cookie"]; ok {
				t.Errorf("Set-Cookie should have been filtered out")
			}
			if _, ok := item.ResponseHeaders["Authorization"]; ok {
				t.Errorf("Authorization should have been filtered out")
			}
			if item.ResponseHeaders["Retry-After"][0] != "30" {
				t.Errorf("expected Retry-After 30, got %v", item.ResponseHeaders["Retry-After"])
			}
			if item.ResponseHeaders["X-Request-Id"][0] != "trace-xyz" {
				t.Errorf("expected X-Request-Id trace-xyz, got %v", item.ResponseHeaders["X-Request-Id"])
			}
		}
	}
}

// TestErrorTypeExtraction covers the upstream error shapes the dashboard
// groups by: nested under "error" (OpenAI/Anthropic), flat (Google/Azure),
// and bodies that carry no identifier at all.
func TestErrorTypeExtraction(t *testing.T) {
	cases := []struct {
		name string
		body string
		want string
	}{
		{"openai nested", `{"error":{"message":"rate limited","type":"rate_limit_error"}}`, "rate_limit_error"},
		{"anthropic nested code", `{"error":{"type":"api_error","code":"overloaded"}}`, "api_error"},
		{"flat type", `{"type":"invalid_request_error","message":"bad"}`, "invalid_request_error"},
		{"flat code", `{"code":"RESOURCE_EXHAUSTED"}`, "RESOURCE_EXHAUSTED"},
		{"non json", `<html>502 Bad Gateway</html>`, ""},
		{"empty", ``, ""},
		{"json without identifier", `{"message":"nope"}`, ""},
		{"numeric code is not an identifier", `{"code":429}`, ""},
	}
	for _, tc := range cases {
		if got := extractErrorType(tc.body); got != tc.want {
			t.Errorf("%s: extractErrorType(%q) = %q, want %q", tc.name, tc.body, got, tc.want)
		}
	}
}

// TestSummaryDerivedMetrics verifies percentiles, cache hit rate, streaming
// throughput and the new auth/session/failure groupings.
func TestSummaryDerivedMetrics(t *testing.T) {
	store, err := New(filepath.Join(t.TempDir(), "usage.db"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer store.Close()

	now := time.Now()
	latencies := []time.Duration{100, 200, 300, 400, 500}
	records := make([]model.UsageRecord, 0, len(latencies))
	for i, latency := range latencies {
		records = append(records, model.UsageRecord{
			RequestID:   fmt.Sprintf("req-%d", i),
			Provider:    "openai",
			Model:       "gpt-5",
			SessionID:   "sess-shared",
			AuthID:      "auth-A",
			AuthIndex:   "0",
			AuthType:    "oauth",
			RequestedAt: now,
			Latency:     latency * time.Millisecond,
			TTFT:        50 * time.Millisecond,
			Stream:      true,
			Detail: model.UsageDetail{
				InputTokens:     100,
				OutputTokens:    200,
				CacheReadTokens: 300,
				TotalTokens:     600,
			},
		})
	}
	// One failure with a parseable error type.
	records = append(records, model.UsageRecord{
		RequestID:   "req-fail",
		Provider:    "openai",
		Model:       "gpt-5",
		SessionID:   "sess-shared",
		AuthID:      "auth-B",
		AuthIndex:   "1",
		AuthType:    "oauth",
		RequestedAt: now,
		Latency:     10 * time.Second,
		Failed:      true,
		Failure:     model.UsageFailure{StatusCode: 429, Body: `{"error":{"type":"rate_limit_error"}}`},
		Detail:      model.UsageDetail{TotalTokens: 0},
	})
	if err := store.InsertBatch(records); err != nil {
		t.Fatalf("InsertBatch: %v", err)
	}

	start := now.Add(-time.Hour)
	summary, err := store.GetSummary(model.UsageFilter{StartTime: &start}, true)
	if err != nil {
		t.Fatalf("GetSummary: %v", err)
	}

	if summary.P50LatencyMs != 300 {
		t.Errorf("p50 = %v, want 300", summary.P50LatencyMs)
	}
	if summary.P95LatencyMs != 10000 {
		t.Errorf("p95 = %v, want 10000 (the slow failure)", summary.P95LatencyMs)
	}
	if summary.P99LatencyMs != 10000 {
		t.Errorf("p99 = %v, want 10000", summary.P99LatencyMs)
	}
	// cache_read / (input + cache_read) = 1500 / (500 + 1500) = 75%
	if summary.CacheHitRate != 75 {
		t.Errorf("cache hit rate = %v, want 75", summary.CacheHitRate)
	}
	if summary.StreamRequests != 5 {
		t.Errorf("stream requests = %d, want 5", summary.StreamRequests)
	}
	// 200 output tokens over (latency - ttft): 100ms,200ms,...  -> avg 2000 t/s
	if summary.AvgOutputTps <= 0 {
		t.Errorf("avg output tps = %v, want > 0", summary.AvgOutputTps)
	}

	if len(summary.Auths) != 2 {
		t.Fatalf("auth groups = %d, want 2", len(summary.Auths))
	}
	var authA model.GroupStat
	for _, a := range summary.Auths {
		if a.Secondary == "0" {
			authA = a
		}
	}
	if authA.Name != "auth-A · oauth" {
		t.Errorf("auth name = %q, want %q", authA.Name, "auth-A · oauth")
	}
	if authA.Requests != 5 || authA.Failed != 0 {
		t.Errorf("auth-A = %d requests / %d failed, want 5/0", authA.Requests, authA.Failed)
	}

	if len(summary.Sessions) != 1 || summary.Sessions[0].Name != "sess-shared" || summary.Sessions[0].Requests != 6 {
		t.Errorf("session groups = %+v, want one sess-shared with 6 requests", summary.Sessions)
	}

	if len(summary.Failures) != 1 {
		t.Fatalf("failure groups = %+v, want 1", summary.Failures)
	}
	if summary.Failures[0].StatusCode != 429 || summary.Failures[0].ErrorType != "rate_limit_error" || summary.Failures[0].Requests != 1 {
		t.Errorf("failure stat = %+v", summary.Failures[0])
	}
	if summary.Failures[0].Sample == "" {
		t.Errorf("failure stat should carry a body sample")
	}

	// Trend points must carry the extended token split and latency stats.
	if len(summary.Trend) == 0 {
		t.Fatal("trend is empty")
	}
	point := summary.Trend[0]
	if point.CacheReadTokens != 1500 || point.AvgLatencyMs <= 0 || point.P95LatencyMs <= 0 {
		t.Errorf("trend point = %+v, want cache read 1500 and latency stats", point)
	}
}

// TestRecordsFilterByAuthAndSession covers the new exact-match filters.
func TestRecordsFilterByAuthAndSession(t *testing.T) {
	store, err := New(filepath.Join(t.TempDir(), "usage.db"))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer store.Close()

	now := time.Now()
	if err := store.InsertBatch([]model.UsageRecord{
		{RequestID: "a", AuthID: "auth-A", SessionID: "sess-1", RequestedAt: now},
		{RequestID: "b", AuthID: "auth-B", SessionID: "sess-1", RequestedAt: now},
		{RequestID: "c", AuthID: "auth-B", SessionID: "sess-2", RequestedAt: now},
	}); err != nil {
		t.Fatalf("InsertBatch: %v", err)
	}

	byAuth, err := store.GetRecords(model.UsageFilter{AuthID: "auth-B"})
	if err != nil {
		t.Fatalf("GetRecords(auth): %v", err)
	}
	if byAuth.Total != 2 {
		t.Errorf("auth filter total = %d, want 2", byAuth.Total)
	}

	bySession, err := store.GetRecords(model.UsageFilter{Session: "sess-1"})
	if err != nil {
		t.Fatalf("GetRecords(session): %v", err)
	}
	if bySession.Total != 2 {
		t.Errorf("session filter total = %d, want 2", bySession.Total)
	}
}

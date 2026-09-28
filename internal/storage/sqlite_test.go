package storage

import (
	"database/sql"
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

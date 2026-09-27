package storage

import (
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
			RequestID:   "req-1",
			Provider:    "openai",
			Model:       "gpt-5",
			APIKey:      "sk-a",
			RequestedAt: now.Add(-2 * time.Hour),
			Latency:     1500 * time.Millisecond,
			TTFT:        300 * time.Millisecond,
			Stream:      true,
			Detail:      model.UsageDetail{InputTokens: 100, OutputTokens: 50, CachedTokens: 20, TotalTokens: 150},
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
	if summary.AvgTTFTMs != 300 {
		t.Errorf("avg ttft = %v, want 300 (stream-only)", summary.AvgTTFTMs)
	}
	if len(summary.Models) != 2 || summary.Models[0].Name != "claude-sonnet-4-5" {
		t.Errorf("models should be ordered by tokens desc, got %+v", summary.Models)
	}
	if len(summary.APIKeys) != 2 || len(summary.Providers) != 2 {
		t.Errorf("want 2 api keys and 2 providers, got %d / %d", len(summary.APIKeys), len(summary.Providers))
	}
	if summary.Bucket != "hour" || len(summary.Trend) == 0 || len(summary.Trend[0].Bucket) != len("2006-01-02 15") {
		t.Errorf("unexpected hourly trend: bucket=%s trend=%+v", summary.Bucket, summary.Trend)
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

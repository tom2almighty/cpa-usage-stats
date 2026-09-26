package storage

import (
	"path/filepath"
	"testing"
	"time"

	"cpa-usage-stats/internal/model"
)

func TestStorageLifecycleAndQueries(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_usage.db")

	store, err := New(dbPath)
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	now := time.Now()
	records := []model.UsageRecord{
		{
			RequestID:   "req-1",
			TraceID:     "trace-1",
			Provider:    "openai",
			Model:       "gpt-5",
			Alias:       "gpt-5",
			APIKey:      "sk-test-1",
			RequestedAt: now.Add(-2 * time.Hour),
			Latency:     1500 * time.Millisecond,
			TTFT:        300 * time.Millisecond,
			Stream:      true,
			Failed:      false,
			Detail: model.UsageDetail{
				InputTokens:     100,
				OutputTokens:    50,
				ReasoningTokens: 10,
				CachedTokens:    20,
				TotalTokens:     150,
			},
		},
		{
			RequestID:   "req-2",
			TraceID:     "trace-2",
			Provider:    "anthropic",
			Model:       "claude-3-7-sonnet",
			Alias:       "sonnet",
			APIKey:      "sk-test-2",
			RequestedAt: now.Add(-1 * time.Hour),
			Latency:     2000 * time.Millisecond,
			TTFT:        500 * time.Millisecond,
			Stream:      true,
			Failed:      true,
			Failure: model.UsageFailure{
				StatusCode: 429,
				Body:       "rate limit exceeded",
			},
			Detail: model.UsageDetail{
				InputTokens:  200,
				OutputTokens: 0,
				TotalTokens:  200,
			},
		},
	}

	if err := store.InsertBatch(records); err != nil {
		t.Fatalf("InsertBatch failed: %v", err)
	}

	// Test Summary
	summary, err := store.GetSummary(model.UsageFilter{})
	if err != nil {
		t.Fatalf("GetSummary failed: %v", err)
	}

	if summary.TotalRequests != 2 {
		t.Errorf("expected 2 total requests, got %d", summary.TotalRequests)
	}
	if summary.SuccessRequests != 1 {
		t.Errorf("expected 1 success request, got %d", summary.SuccessRequests)
	}
	if summary.FailedRequests != 1 {
		t.Errorf("expected 1 failed request, got %d", summary.FailedRequests)
	}
	if summary.TotalTokens != 350 {
		t.Errorf("expected 350 total tokens, got %d", summary.TotalTokens)
	}
	if len(summary.ModelStats) != 2 {
		t.Errorf("expected 2 model stats, got %d", len(summary.ModelStats))
	}

	// Test Records
	recList, err := store.GetRecords(model.UsageFilter{Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("GetRecords failed: %v", err)
	}
	if recList.Total != 2 {
		t.Errorf("expected total 2, got %d", recList.Total)
	}
	if len(recList.Items) != 2 {
		t.Errorf("expected 2 items, got %d", len(recList.Items))
	}

	// Test Filter by failed
	failedOnly := true
	failedList, err := store.GetRecords(model.UsageFilter{Failed: &failedOnly, Page: 1, PageSize: 10})
	if err != nil {
		t.Fatalf("GetRecords failed: %v", err)
	}
	if failedList.Total != 1 {
		t.Errorf("expected 1 failed record, got %d", failedList.Total)
	}
	if failedList.Items[0].FailureBody != "rate limit exceeded" {
		t.Errorf("expected failure body 'rate limit exceeded', got %s", failedList.Items[0].FailureBody)
	}

	// Test Distinct Models
	models, err := store.GetDistinctModels()
	if err != nil {
		t.Fatalf("GetDistinctModels failed: %v", err)
	}
	if len(models) != 2 {
		t.Errorf("expected 2 distinct models, got %d", len(models))
	}

	// Test Retention
	affected, err := store.CleanRetention(1) // 1 day retention, both records are within 2 hours so 0 cleaned
	if err != nil {
		t.Fatalf("CleanRetention failed: %v", err)
	}
	if affected != 0 {
		t.Errorf("expected 0 cleaned, got %d", affected)
	}
}

package worker

import (
	"path/filepath"
	"testing"
	"time"

	"cpa-usage-stats/internal/config"
	"cpa-usage-stats/internal/model"
	"cpa-usage-stats/internal/storage"
)

func TestWorkerBatchAndFlush(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_worker.db")

	store, err := storage.New(dbPath)
	if err != nil {
		t.Fatalf("failed to create storage: %v", err)
	}
	defer store.Close()

	cfg := config.Config{
		BatchSize:       5,
		FlushIntervalMs: 100,
		ChannelSize:     100,
		RetentionDays:   0,
	}

	w := New(cfg, store)

	// Send 3 records (less than BatchSize)
	for i := 1; i <= 3; i++ {
		ok := w.Enqueue(model.UsageRecord{
			RequestID: "req-" + string(rune('0'+i)),
			Model:     "gpt-5",
			Detail: model.UsageDetail{
				TotalTokens: int64(i * 10),
			},
		})
		if !ok {
			t.Fatalf("failed to enqueue record %d", i)
		}
	}

	// Wait for ticker flush
	time.Sleep(250 * time.Millisecond)

	summary, err := store.GetSummary(model.UsageFilter{}, false)
	if err != nil {
		t.Fatalf("GetSummary error: %v", err)
	}
	if summary.TotalRequests != 3 {
		t.Errorf("expected 3 records flushed via ticker, got %d", summary.TotalRequests)
	}

	// Send 2 more and call Stop, should flush remaining
	w.Enqueue(model.UsageRecord{RequestID: "req-4", Model: "gpt-5"})
	w.Enqueue(model.UsageRecord{RequestID: "req-5", Model: "gpt-5"})
	w.Stop()

	summaryAfter, err := store.GetSummary(model.UsageFilter{}, false)
	if err != nil {
		t.Fatalf("GetSummary after stop error: %v", err)
	}
	if summaryAfter.TotalRequests != 5 {
		t.Errorf("expected 5 records flushed after stop, got %d", summaryAfter.TotalRequests)
	}
}

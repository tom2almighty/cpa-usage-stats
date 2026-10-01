package worker

import (
	"log"
	"sync"
	"sync/atomic"
	"time"

	"cpa-usage-stats/internal/config"
	"cpa-usage-stats/internal/model"
	"cpa-usage-stats/internal/storage"
)

// Worker handles asynchronous usage record processing and batch insertion.
type Worker struct {
	cfg     config.Config
	store   *storage.Storage
	queue   chan model.UsageRecord
	done    chan struct{}
	wg      sync.WaitGroup
	dropped atomic.Int64
}

// New creates and starts a new Worker.
func New(cfg config.Config, store *storage.Storage) *Worker {
	w := &Worker{
		cfg:   cfg,
		store: store,
		queue: make(chan model.UsageRecord, cfg.ChannelSize),
		done:  make(chan struct{}),
	}

	w.wg.Add(1)
	go w.run()

	if cfg.RetentionDays > 0 {
		w.wg.Add(1)
		go w.retentionLoop()
	}

	return w
}

// Enqueue puts a record into the processing queue without blocking.
func (w *Worker) Enqueue(record model.UsageRecord) bool {
	// Filter excluded models
	for _, m := range w.cfg.ExcludeModels {
		if m != "" && (record.Model == m || record.Alias == m) {
			return true
		}
	}

	select {
	case w.queue <- record:
		return true
	default:
		w.dropped.Add(1)
		return false
	}
}

// DroppedCount returns total dropped records count due to full queue.
func (w *Worker) DroppedCount() int64 {
	return w.dropped.Load()
}

// QueueDepth returns the number of records currently waiting to be flushed.
func (w *Worker) QueueDepth() int {
	return len(w.queue)
}

// Stats reports runtime counters for the dashboard.
func (w *Worker) Stats() model.RuntimeStats {
	return model.RuntimeStats{
		DroppedRecords: w.dropped.Load(),
		QueueDepth:     len(w.queue),
		QueueCapacity:  cap(w.queue),
	}
}

func (w *Worker) run() {
	defer w.wg.Done()

	interval := time.Duration(w.cfg.FlushIntervalMs) * time.Millisecond
	if interval < 50*time.Millisecond {
		interval = 50 * time.Millisecond
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	batch := make([]model.UsageRecord, 0, w.cfg.BatchSize)

	flush := func() {
		if len(batch) == 0 {
			return
		}
		if err := w.store.InsertBatch(batch); err != nil {
			log.Printf("[cpa-usage-stats] batch insert error: %v (count: %d)", err, len(batch))
		}
		batch = make([]model.UsageRecord, 0, w.cfg.BatchSize)
	}

	for {
		select {
		case <-w.done:
			// Drain remaining in queue
			for {
				select {
				case r := <-w.queue:
					batch = append(batch, r)
					if len(batch) >= w.cfg.BatchSize {
						flush()
					}
				default:
					flush()
					return
				}
			}
		case r := <-w.queue:
			batch = append(batch, r)
			if len(batch) >= w.cfg.BatchSize {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

func (w *Worker) retentionLoop() {
	defer w.wg.Done()

	// Run every 12 hours
	ticker := time.NewTicker(12 * time.Hour)
	defer ticker.Stop()

	// Initial run
	if affected, err := w.store.CleanRetention(w.cfg.RetentionDays); err == nil && affected > 0 {
		log.Printf("[cpa-usage-stats] cleaned %d expired usage records", affected)
	}

	for {
		select {
		case <-w.done:
			return
		case <-ticker.C:
			if affected, err := w.store.CleanRetention(w.cfg.RetentionDays); err == nil && affected > 0 {
				log.Printf("[cpa-usage-stats] cleaned %d expired usage records", affected)
			}
		}
	}
}

// Stop gracefully flushes remaining queue records and shuts down worker.
func (w *Worker) Stop() {
	close(w.done)
	w.wg.Wait()
}

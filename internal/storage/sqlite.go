package storage

import (
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"

	_ "modernc.org/sqlite"

	"cpa-usage-stats/internal/model"
)

const (
	timeLayout = "2006-01-02 15:04:05.000"
	// Upstream error pages can be large HTML documents; keep enough to debug.
	maxFailureBody = 4 << 10
)

// Storage handles SQLite persistent storage.
type Storage struct {
	db *sql.DB
	mu sync.RWMutex
}

// New creates and initializes a SQLite storage instance.
func New(dbPath string) (*Storage, error) {
	// WAL + NORMAL sync for write throughput. _timezone=Local makes the driver
	// parse the zone-less DATETIME text back as server-local time (default is UTC).
	dsn := fmt.Sprintf("%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)&_timezone=Local", dbPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite db: %w", err)
	}

	// Connection pool tuning for embedded SQLite
	db.SetMaxOpenConns(1) // Single writer safe for WAL
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)

	s := &Storage{db: db}
	if err := s.initSchema(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("init sqlite schema: %w", err)
	}

	return s, nil
}

// Close closes the underlying database.
func (s *Storage) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

func (s *Storage) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS usage_records (
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

	CREATE INDEX IF NOT EXISTS idx_usage_requested_at ON usage_records(requested_at);
	CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_records(model);
	CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_records(provider);
	CREATE INDEX IF NOT EXISTS idx_usage_api_key ON usage_records(api_key);
	CREATE INDEX IF NOT EXISTS idx_usage_failed ON usage_records(failed);
	`
	_, err := s.db.Exec(schema)
	return err
}

// InsertBatch inserts multiple usage records in a single transaction.
func (s *Storage) InsertBatch(records []model.UsageRecord) error {
	if len(records) == 0 {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.Prepare(`
		INSERT INTO usage_records (
			request_id, trace_id, provider, model, alias, api_key, auth_id, auth_type, source,
			stream, requested_at, latency_ms, ttft_ms, failed, status_code, failure_body,
			input_tokens, output_tokens, reasoning_tokens, cached_tokens, total_tokens
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return fmt.Errorf("prepare insert: %w", err)
	}
	defer stmt.Close()

	for _, r := range records {
		reqAt := r.RequestedAt
		if reqAt.IsZero() {
			reqAt = time.Now()
		}
		failureBody := r.Failure.Body
		if len(failureBody) > maxFailureBody {
			failureBody = strings.ToValidUTF8(failureBody[:maxFailureBody], "")
		}

		_, err := stmt.Exec(
			r.RequestID,
			r.TraceID,
			r.Provider,
			r.Model,
			r.Alias,
			r.APIKey,
			r.AuthID,
			r.AuthType,
			r.Source,
			r.Stream,
			// Stored as server-local wall time so day/hour buckets match the
			// time ranges computed in handler.
			reqAt.Local().Format(timeLayout),
			r.Latency.Milliseconds(),
			r.TTFT.Milliseconds(),
			r.Failed,
			r.Failure.StatusCode,
			failureBody,
			r.Detail.InputTokens,
			r.Detail.OutputTokens,
			r.Detail.ReasoningTokens,
			r.Detail.CachedTokens,
			r.Detail.TotalTokens,
		)
		if err != nil {
			return fmt.Errorf("exec insert: %w", err)
		}
	}

	return tx.Commit()
}

func buildWhere(filter model.UsageFilter) (string, []interface{}) {
	var clauses []string
	var args []interface{}

	if filter.StartTime != nil {
		clauses = append(clauses, "requested_at >= ?")
		args = append(args, filter.StartTime.Format(timeLayout))
	}
	if filter.EndTime != nil {
		clauses = append(clauses, "requested_at < ?")
		args = append(args, filter.EndTime.Format(timeLayout))
	}
	if filter.Model != "" {
		clauses = append(clauses, "model = ?")
		args = append(args, filter.Model)
	}
	if filter.Provider != "" {
		clauses = append(clauses, "provider = ?")
		args = append(args, filter.Provider)
	}
	if filter.APIKey != "" {
		clauses = append(clauses, "api_key = ?")
		args = append(args, filter.APIKey)
	}
	if filter.Failed != nil {
		if *filter.Failed {
			clauses = append(clauses, "failed = 1")
		} else {
			clauses = append(clauses, "failed = 0")
		}
	}
	if filter.Keyword != "" {
		kw := "%" + filter.Keyword + "%"
		clauses = append(clauses, "(request_id LIKE ? OR trace_id LIKE ? OR model LIKE ? OR alias LIKE ? OR api_key LIKE ? OR failure_body LIKE ?)")
		args = append(args, kw, kw, kw, kw, kw, kw)
	}

	where := ""
	if len(clauses) > 0 {
		where = "WHERE " + strings.Join(clauses, " AND ")
	}
	return where, args
}

// GetSummary returns aggregated statistics for the filter. The trend is
// bucketed by hour when hourly is true, by day otherwise.
func (s *Storage) GetSummary(filter model.UsageFilter, hourly bool) (*model.SummaryResponse, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	where, args := buildWhere(filter)

	resp := &model.SummaryResponse{Bucket: "day"}
	err := s.db.QueryRow(fmt.Sprintf(`
		SELECT
			COUNT(*),
			COALESCE(SUM(failed), 0),
			COALESCE(SUM(total_tokens), 0),
			COALESCE(SUM(input_tokens), 0),
			COALESCE(SUM(output_tokens), 0),
			COALESCE(SUM(reasoning_tokens), 0),
			COALESCE(SUM(cached_tokens), 0),
			COALESCE(AVG(latency_ms), 0),
			COALESCE(AVG(CASE WHEN stream = 1 AND ttft_ms > 0 THEN ttft_ms END), 0)
		FROM usage_records %s
	`, where), args...).Scan(
		&resp.TotalRequests,
		&resp.FailedRequests,
		&resp.TotalTokens,
		&resp.InputTokens,
		&resp.OutputTokens,
		&resp.ReasoningTokens,
		&resp.CachedTokens,
		&resp.AvgLatencyMs,
		&resp.AvgTTFTMs,
	)
	if err != nil {
		return nil, fmt.Errorf("query total summary: %w", err)
	}

	if resp.Models, err = s.groupStats("model", where, args); err != nil {
		return nil, err
	}
	if resp.Providers, err = s.groupStats("provider", where, args); err != nil {
		return nil, err
	}
	if resp.APIKeys, err = s.groupStats("api_key", where, args); err != nil {
		return nil, err
	}

	// "2006-01-02 15" for hours, "2006-01-02" for days.
	bucketLen := 10
	if hourly {
		resp.Bucket = "hour"
		bucketLen = 13
	}
	rows, err := s.db.Query(fmt.Sprintf(`
		SELECT SUBSTR(requested_at, 1, %d) AS bucket, COUNT(*), SUM(failed), COALESCE(SUM(total_tokens), 0)
		FROM usage_records %s
		GROUP BY bucket
		ORDER BY bucket
	`, bucketLen, where), args...)
	if err != nil {
		return nil, fmt.Errorf("query trend: %w", err)
	}
	defer rows.Close()

	resp.Trend = []model.TrendPoint{}
	for rows.Next() {
		var p model.TrendPoint
		if err := rows.Scan(&p.Bucket, &p.Requests, &p.Failed, &p.Tokens); err != nil {
			return nil, fmt.Errorf("scan trend: %w", err)
		}
		resp.Trend = append(resp.Trend, p)
	}
	return resp, rows.Err()
}

// groupStats aggregates usage by one column. column is a fixed identifier from
// GetSummary, never user input.
func (s *Storage) groupStats(column, where string, args []interface{}) ([]model.GroupStat, error) {
	rows, err := s.db.Query(fmt.Sprintf(`
		SELECT
			COALESCE(%[1]s, ''),
			COUNT(*) AS requests,
			SUM(failed),
			COALESCE(SUM(total_tokens), 0) AS tokens,
			COALESCE(SUM(input_tokens), 0),
			COALESCE(SUM(output_tokens), 0),
			COALESCE(SUM(cached_tokens), 0),
			COALESCE(AVG(latency_ms), 0)
		FROM usage_records %[2]s
		GROUP BY %[1]s
		ORDER BY tokens DESC, requests DESC
	`, column, where), args...)
	if err != nil {
		return nil, fmt.Errorf("query %s stats: %w", column, err)
	}
	defer rows.Close()

	stats := []model.GroupStat{}
	for rows.Next() {
		var g model.GroupStat
		if err := rows.Scan(&g.Name, &g.Requests, &g.Failed, &g.TotalTokens, &g.InputTokens, &g.OutputTokens, &g.CachedTokens, &g.AvgLatencyMs); err != nil {
			return nil, fmt.Errorf("scan %s stats: %w", column, err)
		}
		stats = append(stats, g)
	}
	return stats, rows.Err()
}

// GetRecords returns paginated usage records.
func (s *Storage) GetRecords(filter model.UsageFilter) (*model.RecordListResponse, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	where, args := buildWhere(filter)

	var total int64
	if err := s.db.QueryRow("SELECT COUNT(*) FROM usage_records "+where, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count records: %w", err)
	}

	page := max(filter.Page, 1)
	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = 20
	}
	pageSize = min(pageSize, 100)

	rows, err := s.db.Query(fmt.Sprintf(`
		SELECT
			id, request_id, trace_id, provider, model, alias, api_key, auth_id, auth_type, source,
			stream, requested_at, latency_ms, ttft_ms, failed, status_code, COALESCE(failure_body, ''),
			input_tokens, output_tokens, reasoning_tokens, cached_tokens, total_tokens
		FROM usage_records
		%s
		ORDER BY id DESC
		LIMIT ? OFFSET ?
	`, where), append(args, pageSize, (page-1)*pageSize)...)
	if err != nil {
		return nil, fmt.Errorf("query records: %w", err)
	}
	defer rows.Close()

	items := make([]model.StoredRecord, 0, pageSize)
	for rows.Next() {
		var r model.StoredRecord
		err := rows.Scan(
			&r.ID,
			&r.RequestID,
			&r.TraceID,
			&r.Provider,
			&r.Model,
			&r.Alias,
			&r.APIKey,
			&r.AuthID,
			&r.AuthType,
			&r.Source,
			&r.Stream,
			&r.RequestedAt,
			&r.LatencyMs,
			&r.TTFTMs,
			&r.Failed,
			&r.StatusCode,
			&r.FailureBody,
			&r.InputTokens,
			&r.OutputTokens,
			&r.ReasoningTokens,
			&r.CachedTokens,
			&r.TotalTokens,
		)
		if err != nil {
			return nil, fmt.Errorf("scan record: %w", err)
		}
		items = append(items, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate records: %w", err)
	}

	return &model.RecordListResponse{
		Total:    total,
		Page:     page,
		PageSize: pageSize,
		Items:    items,
	}, nil
}

// CleanRetention removes records older than retentionDays.
func (s *Storage) CleanRetention(retentionDays int) (int64, error) {
	if retentionDays <= 0 {
		return 0, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := time.Now().AddDate(0, 0, -retentionDays).Format(timeLayout)
	res, err := s.db.Exec("DELETE FROM usage_records WHERE requested_at < ?", cutoff)
	if err != nil {
		return 0, fmt.Errorf("clean retention: %w", err)
	}
	return res.RowsAffected()
}

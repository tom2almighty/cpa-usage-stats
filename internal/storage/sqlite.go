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

// Storage handles SQLite persistent storage.
type Storage struct {
	db *sql.DB
	mu sync.RWMutex
}

// New creates and initializes a SQLite storage instance.
func New(dbPath string) (*Storage, error) {
	// Enable WAL mode, busy timeout, and normal synchronous mode for high performance
	dsn := fmt.Sprintf("%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)", dbPath)
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
		streamVal := 0
		if r.Stream {
			streamVal = 1
		}
		failedVal := 0
		if r.Failed {
			failedVal = 1
		}
		latencyMs := r.Latency.Milliseconds()
		ttftMs := r.TTFT.Milliseconds()

		reqAt := r.RequestedAt
		if reqAt.IsZero() {
			reqAt = time.Now()
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
			streamVal,
			reqAt.Format("2006-01-02 15:04:05.000"),
			latencyMs,
			ttftMs,
			failedVal,
			r.Failure.StatusCode,
			r.Failure.Body,
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
		args = append(args, filter.StartTime.Format("2006-01-02 15:04:05"))
	}
	if filter.EndTime != nil {
		clauses = append(clauses, "requested_at <= ?")
		args = append(args, filter.EndTime.Format("2006-01-02 15:04:05"))
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

// GetSummary returns overall aggregated statistics for the filter.
func (s *Storage) GetSummary(filter model.UsageFilter) (*model.SummaryResponse, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	where, args := buildWhere(filter)

	// 1. Overall stats
	queryTotal := fmt.Sprintf(`
		SELECT
			COUNT(*),
			COALESCE(SUM(CASE WHEN failed = 0 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN failed = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(total_tokens), 0),
			COALESCE(SUM(input_tokens), 0),
			COALESCE(SUM(output_tokens), 0),
			COALESCE(SUM(reasoning_tokens), 0),
			COALESCE(SUM(cached_tokens), 0),
			COALESCE(AVG(latency_ms), 0),
			COALESCE(AVG(CASE WHEN stream = 1 AND ttft_ms > 0 THEN ttft_ms ELSE NULL END), 0)
		FROM usage_records
		%s
	`, where)

	resp := &model.SummaryResponse{
		ModelStats:    []model.ModelStat{},
		ProviderStats: []model.ProviderStat{},
		DailyStats:    []model.DailyStat{},
	}

	row := s.db.QueryRow(queryTotal, args...)
	err := row.Scan(
		&resp.TotalRequests,
		&resp.SuccessRequests,
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

	if resp.TotalRequests > 0 {
		resp.SuccessRate = float64(resp.SuccessRequests) / float64(resp.TotalRequests) * 100
	}

	// 2. Model breakdown
	queryModel := fmt.Sprintf(`
		SELECT
			COALESCE(model, 'unknown'),
			COALESCE(provider, 'unknown'),
			COUNT(*),
			COALESCE(SUM(CASE WHEN failed = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(total_tokens), 0),
			COALESCE(SUM(input_tokens), 0),
			COALESCE(SUM(output_tokens), 0),
			COALESCE(SUM(reasoning_tokens), 0),
			COALESCE(SUM(cached_tokens), 0),
			COALESCE(AVG(latency_ms), 0)
		FROM usage_records
		%s
		GROUP BY model, provider
		ORDER BY SUM(total_tokens) DESC, COUNT(*) DESC
		LIMIT 50
	`, where)

	rows, err := s.db.Query(queryModel, args...)
	if err != nil {
		return nil, fmt.Errorf("query model summary: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var m model.ModelStat
		if err := rows.Scan(
			&m.Model,
			&m.Provider,
			&m.TotalRequests,
			&m.FailedRequests,
			&m.TotalTokens,
			&m.InputTokens,
			&m.OutputTokens,
			&m.ReasoningTokens,
			&m.CachedTokens,
			&m.AvgLatencyMs,
		); err != nil {
			return nil, fmt.Errorf("scan model stat: %w", err)
		}
		resp.ModelStats = append(resp.ModelStats, m)
	}

	// 3. Provider breakdown
	queryProvider := fmt.Sprintf(`
		SELECT
			COALESCE(provider, 'unknown'),
			COUNT(*),
			COALESCE(SUM(CASE WHEN failed = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(total_tokens), 0)
		FROM usage_records
		%s
		GROUP BY provider
		ORDER BY SUM(total_tokens) DESC, COUNT(*) DESC
	`, where)

	pRows, err := s.db.Query(queryProvider, args...)
	if err != nil {
		return nil, fmt.Errorf("query provider summary: %w", err)
	}
	defer pRows.Close()

	for pRows.Next() {
		var p model.ProviderStat
		if err := pRows.Scan(&p.Provider, &p.TotalRequests, &p.FailedRequests, &p.TotalTokens); err != nil {
			return nil, fmt.Errorf("scan provider stat: %w", err)
		}
		resp.ProviderStats = append(resp.ProviderStats, p)
	}

	// 4. Daily trend (recent 30 days)
	queryDaily := fmt.Sprintf(`
		SELECT
			SUBSTR(requested_at, 1, 10) as day,
			COUNT(*),
			COALESCE(SUM(CASE WHEN failed = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(total_tokens), 0)
		FROM usage_records
		%s
		GROUP BY day
		ORDER BY day ASC
		LIMIT 60
	`, where)

	dRows, err := s.db.Query(queryDaily, args...)
	if err != nil {
		return nil, fmt.Errorf("query daily trend: %w", err)
	}
	defer dRows.Close()

	for dRows.Next() {
		var d model.DailyStat
		if err := dRows.Scan(&d.Date, &d.TotalRequests, &d.FailedRequests, &d.TotalTokens); err != nil {
			return nil, fmt.Errorf("scan daily stat: %w", err)
		}
		resp.DailyStats = append(resp.DailyStats, d)
	}

	return resp, nil
}

// GetRecords returns paginated usage records.
func (s *Storage) GetRecords(filter model.UsageFilter) (*model.RecordListResponse, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	where, args := buildWhere(filter)

	// Count total
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM usage_records %s", where)
	var total int64
	if err := s.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count records: %w", err)
	}

	page := filter.Page
	if page < 1 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = 20
	} else if pageSize > 100 {
		pageSize = 100
	}

	offset := (page - 1) * pageSize

	query := fmt.Sprintf(`
		SELECT
			id, request_id, trace_id, provider, model, alias, api_key, auth_id, auth_type, source,
			stream, requested_at, latency_ms, ttft_ms, failed, status_code, COALESCE(failure_body, ''),
			input_tokens, output_tokens, reasoning_tokens, cached_tokens, total_tokens
		FROM usage_records
		%s
		ORDER BY id DESC
		LIMIT ? OFFSET ?
	`, where)

	queryArgs := append(args, pageSize, offset)
	rows, err := s.db.Query(query, queryArgs...)
	if err != nil {
		return nil, fmt.Errorf("query records: %w", err)
	}
	defer rows.Close()

	items := make([]model.StoredRecord, 0, pageSize)
	for rows.Next() {
		var r model.StoredRecord
		var streamVal, failedVal int
		var reqAtStr string

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
			&streamVal,
			&reqAtStr,
			&r.LatencyMs,
			&r.TTFTMs,
			&failedVal,
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

		r.Stream = streamVal == 1
		r.Failed = failedVal == 1
		t, parseErr := time.Parse("2006-01-02 15:04:05.000", reqAtStr)
		if parseErr != nil {
			t, _ = time.Parse("2006-01-02 15:04:05", reqAtStr)
		}
		r.RequestedAt = t

		items = append(items, r)
	}

	return &model.RecordListResponse{
		Total:    total,
		Page:     page,
		PageSize: pageSize,
		Items:    items,
	}, nil
}

// GetDistinctModels returns list of existing model names.
func (s *Storage) GetDistinctModels() ([]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query("SELECT DISTINCT model FROM usage_records WHERE model != '' ORDER BY model ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var models []string
	for rows.Next() {
		var m string
		if err := rows.Scan(&m); err == nil {
			models = append(models, m)
		}
	}
	return models, nil
}

// GetDistinctProviders returns list of existing provider names.
func (s *Storage) GetDistinctProviders() ([]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query("SELECT DISTINCT provider FROM usage_records WHERE provider != '' ORDER BY provider ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var providers []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err == nil {
			providers = append(providers, p)
		}
	}
	return providers, nil
}

// CleanRetention removes records older than retentionDays.
func (s *Storage) CleanRetention(retentionDays int) (int64, error) {
	if retentionDays <= 0 {
		return 0, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := time.Now().AddDate(0, 0, -retentionDays).Format("2006-01-02 15:04:05")
	res, err := s.db.Exec("DELETE FROM usage_records WHERE requested_at < ?", cutoff)
	if err != nil {
		return 0, fmt.Errorf("clean retention: %w", err)
	}
	return res.RowsAffected()
}

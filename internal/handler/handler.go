package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"cpa-usage-stats/internal/model"
	"cpa-usage-stats/internal/storage"
)

// Handler processes management and resource requests.
type Handler struct {
	store       *storage.Storage
	htmlContent []byte
	mu          sync.RWMutex
}

// New creates a new Handler.
func New(store *storage.Storage, htmlContent []byte) *Handler {
	return &Handler{
		store:       store,
		htmlContent: htmlContent,
	}
}

// SetHTMLContent updates the embedded HTML content.
func (h *Handler) SetHTMLContent(content []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.htmlContent = content
}

// Handle processes an incoming ManagementRequest.
func (h *Handler) Handle(req model.ManagementRequest) (model.ManagementResponse, error) {
	path := strings.TrimRight(req.Path, "/")
	action := req.Query.Get("action")

	// 1. Check for summary
	if action == "summary" || strings.HasSuffix(path, "/summary") {
		return h.handleSummary(req)
	}

	// 2. Check for records
	if action == "records" || strings.HasSuffix(path, "/records") {
		return h.handleRecords(req)
	}

	// 3. Check for distinct models
	if action == "models" || strings.HasSuffix(path, "/models") {
		return h.handleModels()
	}

	// 4. Check for distinct providers
	if action == "providers" || strings.HasSuffix(path, "/providers") {
		return h.handleProviders()
	}

	// 5. Default: serve the single-page dashboard HTML
	return h.handleHTML()
}

func (h *Handler) handleHTML() (model.ManagementResponse, error) {
	h.mu.RLock()
	body := h.htmlContent
	h.mu.RUnlock()

	if len(body) == 0 {
		body = []byte("<!DOCTYPE html><html><head><meta charset='utf-8'><title>CPA Usage Dashboard</title></head><body><h3>Usage Stats Dashboard Loading...</h3></body></html>")
	}

	headers := http.Header{}
	headers.Set("Content-Type", "text/html; charset=utf-8")
	headers.Set("Cache-Control", "no-cache, no-store, must-revalidate")

	return model.ManagementResponse{
		StatusCode: http.StatusOK,
		Headers:    headers,
		Body:       body,
	}, nil
}

func (h *Handler) handleSummary(req model.ManagementRequest) (model.ManagementResponse, error) {
	filter := parseFilter(req)
	summary, err := h.store.GetSummary(filter)
	if err != nil {
		return jsonError(http.StatusInternalServerError, "query_summary_failed", err.Error())
	}
	return jsonOK(summary)
}

func (h *Handler) handleRecords(req model.ManagementRequest) (model.ManagementResponse, error) {
	filter := parseFilter(req)
	records, err := h.store.GetRecords(filter)
	if err != nil {
		return jsonError(http.StatusInternalServerError, "query_records_failed", err.Error())
	}
	return jsonOK(records)
}

func (h *Handler) handleModels() (model.ManagementResponse, error) {
	models, err := h.store.GetDistinctModels()
	if err != nil {
		return jsonError(http.StatusInternalServerError, "query_models_failed", err.Error())
	}
	return jsonOK(map[string]interface{}{"models": models})
}

func (h *Handler) handleProviders() (model.ManagementResponse, error) {
	providers, err := h.store.GetDistinctProviders()
	if err != nil {
		return jsonError(http.StatusInternalServerError, "query_providers_failed", err.Error())
	}
	return jsonOK(map[string]interface{}{"providers": providers})
}

func parseFilter(req model.ManagementRequest) model.UsageFilter {
	filter := model.UsageFilter{
		Page:     1,
		PageSize: 20,
	}

	if p, err := strconv.Atoi(req.Query.Get("page")); err == nil && p > 0 {
		filter.Page = p
	}
	if ps, err := strconv.Atoi(req.Query.Get("page_size")); err == nil && ps > 0 {
		filter.PageSize = ps
	}

	if m := strings.TrimSpace(req.Query.Get("model")); m != "" {
		filter.Model = m
	}
	if p := strings.TrimSpace(req.Query.Get("provider")); p != "" {
		filter.Provider = p
	}
	if k := strings.TrimSpace(req.Query.Get("api_key")); k != "" {
		filter.APIKey = k
	}
	if kw := strings.TrimSpace(req.Query.Get("keyword")); kw != "" {
		filter.Keyword = kw
	}

	if failedStr := req.Query.Get("failed"); failedStr != "" {
		f := failedStr == "true" || failedStr == "1"
		filter.Failed = &f
	}

	// Parse date range: start_time and end_time (RFC3339 or YYYY-MM-DD or relative like 'today', '7d', '30d')
	rangeParam := req.Query.Get("range")
	now := time.Now()
	switch rangeParam {
	case "today":
		start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		filter.StartTime = &start
	case "yesterday":
		y := now.AddDate(0, 0, -1)
		start := time.Date(y.Year(), y.Month(), y.Day(), 0, 0, 0, 0, y.Location())
		end := time.Date(y.Year(), y.Month(), y.Day(), 23, 59, 59, 999999999, y.Location())
		filter.StartTime = &start
		filter.EndTime = &end
	case "7d":
		start := now.AddDate(0, 0, -7)
		filter.StartTime = &start
	case "30d":
		start := now.AddDate(0, 0, -30)
		filter.StartTime = &start
	default:
		if s := req.Query.Get("start_time"); s != "" {
			if t, err := parseTime(s); err == nil {
				filter.StartTime = &t
			}
		}
		if e := req.Query.Get("end_time"); e != "" {
			if t, err := parseTime(e); err == nil {
				filter.EndTime = &t
			}
		}
	}

	return filter
}

func parseTime(s string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02 15:04:05", s); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02", s); err == nil {
		return t, nil
	}
	return time.Time{}, http.ErrNotSupported
}

func jsonOK(data interface{}) (model.ManagementResponse, error) {
	body, err := json.Marshal(data)
	if err != nil {
		return jsonError(http.StatusInternalServerError, "marshal_error", err.Error())
	}
	headers := http.Header{}
	headers.Set("Content-Type", "application/json; charset=utf-8")
	return model.ManagementResponse{
		StatusCode: http.StatusOK,
		Headers:    headers,
		Body:       body,
	}, nil
}

func jsonError(statusCode int, code, message string) (model.ManagementResponse, error) {
	errBody, _ := json.Marshal(map[string]interface{}{
		"error": map[string]interface{}{
			"code":    code,
			"message": message,
		},
	})
	headers := http.Header{}
	headers.Set("Content-Type", "application/json; charset=utf-8")
	return model.ManagementResponse{
		StatusCode: statusCode,
		Headers:    headers,
		Body:       errBody,
	}, nil
}

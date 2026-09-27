package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"cpa-usage-stats/internal/model"
	"cpa-usage-stats/internal/storage"
)

// APIBasePath is where the host mounts this plugin's authenticated routes.
const APIBasePath = "/v0/management/plugins/cpa-usage-stats"

// Handle serves plugin HTTP requests. Data is only returned on the
// management routes, which the host protects with the management key; the
// unauthenticated resource route only ever gets the dashboard HTML.
func Handle(store *storage.Storage, html []byte, req model.ManagementRequest) model.ManagementResponse {
	if !strings.HasPrefix(req.Path, APIBasePath+"/") {
		return htmlResponse(html)
	}
	if store == nil {
		return jsonError(http.StatusServiceUnavailable, "storage_unavailable", "usage storage is not initialized")
	}

	filter, hourly := parseFilter(req.Query)
	switch strings.TrimPrefix(req.Path, APIBasePath) {
	case "/summary":
		summary, err := store.GetSummary(filter, hourly)
		if err != nil {
			return jsonError(http.StatusInternalServerError, "query_summary_failed", err.Error())
		}
		return jsonOK(summary)
	case "/records":
		records, err := store.GetRecords(filter)
		if err != nil {
			return jsonError(http.StatusInternalServerError, "query_records_failed", err.Error())
		}
		return jsonOK(records)
	default:
		return jsonError(http.StatusNotFound, "not_found", "unknown endpoint")
	}
}

func htmlResponse(body []byte) model.ManagementResponse {
	headers := http.Header{}
	headers.Set("Content-Type", "text/html; charset=utf-8")
	headers.Set("Cache-Control", "no-cache")
	return model.ManagementResponse{StatusCode: http.StatusOK, Headers: headers, Body: body}
}

// parseFilter maps query params to a filter. range is one of today,
// yesterday, 7d, 30d or all (default); today/yesterday get hourly trends.
func parseFilter(q map[string][]string) (model.UsageFilter, bool) {
	get := func(key string) string {
		if v := q[key]; len(v) > 0 {
			return strings.TrimSpace(v[0])
		}
		return ""
	}

	filter := model.UsageFilter{
		Model:    get("model"),
		Provider: get("provider"),
		APIKey:   get("api_key"),
		Keyword:  get("keyword"),
	}
	filter.Page, _ = strconv.Atoi(get("page"))
	filter.PageSize, _ = strconv.Atoi(get("page_size"))
	if failed := get("failed"); failed != "" {
		f := failed == "true" || failed == "1"
		filter.Failed = &f
	}

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	daysBack := func(n int) *time.Time {
		t := today.AddDate(0, 0, -n)
		return &t
	}
	hourly := false
	switch get("range") {
	case "today":
		filter.StartTime, hourly = &today, true
	case "yesterday":
		filter.StartTime, filter.EndTime, hourly = daysBack(1), &today, true
	case "7d":
		filter.StartTime = daysBack(6)
	case "30d":
		filter.StartTime = daysBack(29)
	}
	return filter, hourly
}

func jsonOK(data any) model.ManagementResponse {
	body, err := json.Marshal(data)
	if err != nil {
		return jsonError(http.StatusInternalServerError, "marshal_error", err.Error())
	}
	return jsonResponse(http.StatusOK, body)
}

func jsonError(statusCode int, code, message string) model.ManagementResponse {
	body, _ := json.Marshal(map[string]string{"code": code, "message": message})
	return jsonResponse(statusCode, body)
}

func jsonResponse(statusCode int, body []byte) model.ManagementResponse {
	headers := http.Header{}
	headers.Set("Content-Type", "application/json; charset=utf-8")
	return model.ManagementResponse{StatusCode: statusCode, Headers: headers, Body: body}
}

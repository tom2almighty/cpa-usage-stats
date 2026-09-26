package plugin

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"cpa-usage-stats/internal/model"
)

func TestEndToEndIntegration(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "e2e_usage.db")

	instance := GetInstance()

	// Read built HTML file to set in instance
	distHTML, err := os.ReadFile("../../web/dist/index.html")
	if err == nil && len(distHTML) > 0 {
		instance.SetEmbeddedHTML(distHTML)
	}

	// 1. Register plugin
	cfgYAML := "db_path: " + dbPath + "\nbatch_size: 3\nflush_interval_ms: 100\n"
	regReq, _ := json.Marshal(map[string]string{"config_yaml": cfgYAML})
	regRespRaw, err := instance.HandleCall("plugin.register", regReq)
	if err != nil {
		t.Fatalf("register error: %v", err)
	}

	var regEnv model.Envelope
	if err := json.Unmarshal(regRespRaw, &regEnv); err != nil || !regEnv.OK {
		t.Fatalf("register failed: %v", regEnv.Error)
	}

	// 2. Register management routes & menu resources
	mgmtRegRespRaw, err := instance.HandleCall("management.register", nil)
	if err != nil {
		t.Fatalf("management.register error: %v", err)
	}
	var mgmtRegEnv model.Envelope
	_ = json.Unmarshal(mgmtRegRespRaw, &mgmtRegEnv)
	if !mgmtRegEnv.OK {
		t.Fatalf("management.register failed")
	}

	var mgmtRegResp model.ManagementRegistrationResponse
	_ = json.Unmarshal(mgmtRegEnv.Result, &mgmtRegResp)
	if len(mgmtRegResp.Resources) != 1 || mgmtRegResp.Resources[0].Path != "/dashboard" {
		t.Fatalf("expected resource path /dashboard, got: %+v", mgmtRegResp.Resources)
	}

	// 3. Request Dashboard HTML
	htmlReq := model.ManagementRequest{
		Method: "GET",
		Path:   "/v0/resource/plugins/cpa-usage-stats/dashboard",
	}
	htmlReqBytes, _ := json.Marshal(htmlReq)
	htmlRespRaw, err := instance.HandleCall("management.handle", htmlReqBytes)
	if err != nil {
		t.Fatalf("management.handle html error: %v", err)
	}
	var htmlEnv model.Envelope
	_ = json.Unmarshal(htmlRespRaw, &htmlEnv)
	var htmlResp model.ManagementResponse
	_ = json.Unmarshal(htmlEnv.Result, &htmlResp)

	if htmlResp.StatusCode != 200 {
		t.Errorf("expected 200 status for HTML, got %d", htmlResp.StatusCode)
	}
	if !strings.Contains(htmlResp.Headers.Get("Content-Type"), "text/html") {
		t.Errorf("expected text/html content-type, got %s", htmlResp.Headers.Get("Content-Type"))
	}
	if !strings.Contains(string(htmlResp.Body), "<!doctype html>") && !strings.Contains(string(htmlResp.Body), "<!DOCTYPE html>") {
		t.Errorf("expected HTML body, got: %s", string(htmlResp.Body)[:100])
	}

	// 4. Ingest multiple usage records (successful and failed)
	testRecords := []model.UsageRecord{
		{
			RequestID:   "req-1",
			TraceID:     "tr-1",
			Provider:    "openai",
			Model:       "gpt-5",
			Alias:       "gpt-5",
			APIKey:      "sk-test-client",
			Stream:      true,
			RequestedAt: time.Now().Add(-5 * time.Minute),
			Latency:     1200 * time.Millisecond,
			TTFT:        250 * time.Millisecond,
			Failed:      false,
			Detail: model.UsageDetail{
				InputTokens:     500,
				OutputTokens:    120,
				ReasoningTokens: 60,
				CachedTokens:    100,
				TotalTokens:     620,
			},
		},
		{
			RequestID:   "req-2",
			TraceID:     "tr-2",
			Provider:    "anthropic",
			Model:       "claude-3-7-sonnet",
			Alias:       "sonnet-3.7",
			APIKey:      "sk-test-client",
			Stream:      false,
			RequestedAt: time.Now().Add(-4 * time.Minute),
			Latency:     800 * time.Millisecond,
			Failed:      false,
			Detail: model.UsageDetail{
				InputTokens:  1000,
				OutputTokens: 300,
				TotalTokens:  1300,
			},
		},
		{
			RequestID:   "req-3",
			TraceID:     "tr-3",
			Provider:    "google",
			Model:       "gemini-2.5-flash",
			Alias:       "gemini-flash",
			APIKey:      "sk-another-client",
			Stream:      true,
			RequestedAt: time.Now().Add(-2 * time.Minute),
			Latency:     500 * time.Millisecond,
			Failed:      true,
			Failure: model.UsageFailure{
				StatusCode: 503,
				Body:       "model overloaded",
			},
			Detail: model.UsageDetail{
				InputTokens: 300,
				TotalTokens: 300,
			},
		},
	}

	for _, rec := range testRecords {
		recBytes, _ := json.Marshal(rec)
		_, _ = instance.HandleCall("usage.handle", recBytes)
	}

	// Wait for batch ticker flush
	time.Sleep(250 * time.Millisecond)

	// 5. Query Summary API
	summaryReq := model.ManagementRequest{
		Method: "GET",
		Path:   "/v0/resource/plugins/cpa-usage-stats/dashboard",
		Query:  map[string][]string{"action": {"summary"}},
	}
	summaryReqBytes, _ := json.Marshal(summaryReq)
	summaryRespRaw, err := instance.HandleCall("management.handle", summaryReqBytes)
	if err != nil {
		t.Fatalf("query summary error: %v", err)
	}
	var sumEnv model.Envelope
	_ = json.Unmarshal(summaryRespRaw, &sumEnv)
	var sumMgmtResp model.ManagementResponse
	_ = json.Unmarshal(sumEnv.Result, &sumMgmtResp)

	var summary model.SummaryResponse
	if err := json.Unmarshal(sumMgmtResp.Body, &summary); err != nil {
		t.Fatalf("unmarshal summary response failed: %v", err)
	}

	if summary.TotalRequests != 3 {
		t.Errorf("expected 3 total requests, got %d", summary.TotalRequests)
	}
	if summary.FailedRequests != 1 {
		t.Errorf("expected 1 failed request, got %d", summary.FailedRequests)
	}
	if summary.TotalTokens != 2220 {
		t.Errorf("expected 2220 total tokens, got %d", summary.TotalTokens)
	}
	if len(summary.ModelStats) != 3 {
		t.Errorf("expected 3 model stats, got %d", len(summary.ModelStats))
	}

	// 6. Query Records API
	recordsReq := model.ManagementRequest{
		Method: "GET",
		Path:   "/v0/resource/plugins/cpa-usage-stats/dashboard",
		Query:  map[string][]string{"action": {"records"}, "page": {"1"}, "page_size": {"10"}},
	}
	recordsReqBytes, _ := json.Marshal(recordsReq)
	recordsRespRaw, err := instance.HandleCall("management.handle", recordsReqBytes)
	if err != nil {
		t.Fatalf("query records error: %v", err)
	}
	var recEnv model.Envelope
	_ = json.Unmarshal(recordsRespRaw, &recEnv)
	var recMgmtResp model.ManagementResponse
	_ = json.Unmarshal(recEnv.Result, &recMgmtResp)

	var recordsList model.RecordListResponse
	if err := json.Unmarshal(recMgmtResp.Body, &recordsList); err != nil {
		t.Fatalf("unmarshal records response failed: %v", err)
	}

	if recordsList.Total != 3 {
		t.Errorf("expected 3 records, got %d", recordsList.Total)
	}

	// 7. Query Distinct Models and Providers
	modelsReq := model.ManagementRequest{
		Method: "GET",
		Path:   "/v0/resource/plugins/cpa-usage-stats/dashboard",
		Query:  map[string][]string{"action": {"models"}},
	}
	modelsReqBytes, _ := json.Marshal(modelsReq)
	modelsRespRaw, _ := instance.HandleCall("management.handle", modelsReqBytes)
	var modelsEnv model.Envelope
	_ = json.Unmarshal(modelsRespRaw, &modelsEnv)
	var modelsMgmtResp model.ManagementResponse
	_ = json.Unmarshal(modelsEnv.Result, &modelsMgmtResp)

	var modelsData map[string][]string
	_ = json.Unmarshal(modelsMgmtResp.Body, &modelsData)
	if len(modelsData["models"]) != 3 {
		t.Errorf("expected 3 distinct models, got %d", len(modelsData["models"]))
	}

	// 8. Shutdown
	_, _ = instance.HandleCall("plugin.shutdown", nil)
}

package plugin

import (
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"cpa-usage-stats/internal/model"
)

func TestPluginLifecycle(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_plugin.db")

	instance := GetInstance()

	// 1. Test plugin.register
	configYAML := "db_path: " + dbPath + "\nbatch_size: 2\nflush_interval_ms: 100\n"
	regReq, _ := json.Marshal(map[string]string{"config_yaml": configYAML})

	regRespRaw, err := instance.HandleCall("plugin.register", regReq)
	if err != nil {
		t.Fatalf("plugin.register failed: %v", err)
	}

	var regEnv model.Envelope
	if err := json.Unmarshal(regRespRaw, &regEnv); err != nil {
		t.Fatalf("unmarshal register envelope failed: %v", err)
	}
	if !regEnv.OK {
		t.Fatalf("expected register ok=true, got false: %v", regEnv.Error)
	}

	// 2. Test management.register
	mgmtRegRespRaw, err := instance.HandleCall("management.register", nil)
	if err != nil {
		t.Fatalf("management.register failed: %v", err)
	}
	var mgmtRegEnv model.Envelope
	_ = json.Unmarshal(mgmtRegRespRaw, &mgmtRegEnv)
	if !mgmtRegEnv.OK {
		t.Fatalf("expected management.register ok=true")
	}

	// 3. Test usage.handle
	record := model.UsageRecord{
		RequestID: "req-test-1",
		Provider:  "openai",
		Model:     "gpt-5",
		Detail: model.UsageDetail{
			TotalTokens: 100,
		},
	}
	recordBytes, _ := json.Marshal(record)
	usageRespRaw, err := instance.HandleCall("usage.handle", recordBytes)
	if err != nil {
		t.Fatalf("usage.handle failed: %v", err)
	}
	var usageEnv model.Envelope
	_ = json.Unmarshal(usageRespRaw, &usageEnv)
	if !usageEnv.OK {
		t.Fatalf("expected usage.handle ok=true")
	}

	// Wait for worker batch flush
	time.Sleep(200 * time.Millisecond)

	// 4. Test management.handle (query summary)
	mgmtReq := model.ManagementRequest{
		Method: "GET",
		Path:   "/v0/resource/plugins/cpa-usage-stats/dashboard",
		Query:  map[string][]string{"action": {"summary"}},
	}
	mgmtReqBytes, _ := json.Marshal(mgmtReq)
	mgmtHandleRespRaw, err := instance.HandleCall("management.handle", mgmtReqBytes)
	if err != nil {
		t.Fatalf("management.handle failed: %v", err)
	}
	var mgmtHandleEnv model.Envelope
	_ = json.Unmarshal(mgmtHandleRespRaw, &mgmtHandleEnv)
	if !mgmtHandleEnv.OK {
		t.Fatalf("expected management.handle ok=true")
	}

	var mgmtResp model.ManagementResponse
	_ = json.Unmarshal(mgmtHandleEnv.Result, &mgmtResp)
	if mgmtResp.StatusCode != 200 {
		t.Errorf("expected status code 200, got %d", mgmtResp.StatusCode)
	}

	var summary model.SummaryResponse
	_ = json.Unmarshal(mgmtResp.Body, &summary)
	if summary.TotalRequests != 1 {
		t.Errorf("expected 1 total request in summary, got %d", summary.TotalRequests)
	}

	// 5. Test shutdown
	_, _ = instance.HandleCall("plugin.shutdown", nil)
}

package plugin

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"cpa-usage-stats/internal/handler"
	"cpa-usage-stats/internal/model"
)

// hostRegistration mirrors the fields CLIProxyAPI's validPlugin checks after
// both plugin.register and plugin.reconfigure.
type hostRegistration struct {
	SchemaVersion uint32 `json:"schema_version"`
	Metadata      struct {
		Name, Version, Author, GitHubRepository string
	} `json:"metadata"`
	Capabilities map[string]bool `json:"capabilities"`
}

func call(t *testing.T, method string, req any) json.RawMessage {
	t.Helper()
	payload, _ := json.Marshal(req)
	raw, err := GetInstance().HandleCall(method, payload)
	if err != nil {
		t.Fatalf("%s: %v", method, err)
	}
	var env model.Envelope
	if err := json.Unmarshal(raw, &env); err != nil || !env.OK {
		t.Fatalf("%s: envelope %s", method, raw)
	}
	return env.Result
}

func manage(t *testing.T, path string, query map[string][]string) model.ManagementResponse {
	t.Helper()
	var resp model.ManagementResponse
	result := call(t, "management.handle", model.ManagementRequest{Method: "GET", Path: path, Query: query})
	if err := json.Unmarshal(result, &resp); err != nil {
		t.Fatalf("decode management response: %v", err)
	}
	return resp
}

func TestPluginLifecycle(t *testing.T) {
	GetInstance().SetEmbeddedHTML([]byte("<!doctype html><title>dashboard</title>"))
	cfgYAML := []byte("db_path: " + filepath.Join(t.TempDir(), "usage.db") + "\nbatch_size: 1\nflush_interval_ms: 50\n")

	// Startup calls register once, then reconfigure on every later config
	// apply. An empty reconfigure reply made the host unregister the plugin.
	for _, tc := range []struct {
		method     string
		hostSchema uint32
		wantSchema uint32
	}{
		{"plugin.register", 6, 6},
		{"plugin.reconfigure", 6, 6},
		// The plugin speaks v8 only: it claims its schema regardless of what
		// an older host advertises, so pre-v8 hosts drop it instead of
		// silently mis-decoding management responses.
		{"plugin.reconfigure", 1, 6},
	} {
		var reg hostRegistration
		result := call(t, tc.method, map[string]any{"config_yaml": cfgYAML, "schema_version": tc.hostSchema})
		if err := json.Unmarshal(result, &reg); err != nil {
			t.Fatalf("%s: decode: %v", tc.method, err)
		}
		m := reg.Metadata
		if m.Name == "" || m.Version == "" || m.Author == "" || m.GitHubRepository == "" || !reg.Capabilities["usage_plugin"] {
			t.Fatalf("%s: host would reject registration %+v", tc.method, reg)
		}
		if reg.SchemaVersion != tc.wantSchema {
			t.Errorf("%s with host schema %d: got schema %d, want %d", tc.method, tc.hostSchema, reg.SchemaVersion, tc.wantSchema)
		}
	}

	call(t, "usage.handle", model.UsageRecord{RequestID: "req-1", Model: "gpt-5", SessionID: "sess-1", ResponseModel: "gpt-5.2", RequestedAt: time.Now(), Detail: model.UsageDetail{TotalTokens: 100, CacheReadTokens: 30}})
	time.Sleep(200 * time.Millisecond)

	resp := manage(t, handler.APIBasePath+"/summary", map[string][]string{"range": {"today"}})
	var summary model.SummaryResponse
	if err := json.Unmarshal(resp.Body, &summary); err != nil || resp.StatusCode != 200 {
		t.Fatalf("summary: status %d body %s", resp.StatusCode, resp.Body)
	}
	if summary.TotalRequests != 1 || summary.TotalTokens != 100 || summary.Bucket != "hour" {
		t.Errorf("summary = %+v", summary)
	}
	if summary.SuccessRequests != 1 || summary.SuccessRate != 100 {
		t.Errorf("success accounting = %+v", summary)
	}
	if len(summary.Models) != 1 || summary.Models[0].Secondary != "" {
		t.Errorf("model stats = %+v", summary.Models)
	}

	resp = manage(t, handler.APIBasePath+"/records", nil)
	var records model.RecordListResponse
	if err := json.Unmarshal(resp.Body, &records); err != nil || resp.StatusCode != 200 {
		t.Fatalf("records: status %d body %s", resp.StatusCode, resp.Body)
	}
	if records.Total != 1 || records.Items[0].SessionID != "sess-1" || records.Items[0].ResponseModel != "gpt-5.2" {
		t.Errorf("records = %+v", records)
	}

	resp = manage(t, handler.APIBasePath+"/options", nil)
	var options model.OptionsResponse
	if err := json.Unmarshal(resp.Body, &options); err != nil || resp.StatusCode != 200 {
		t.Fatalf("options: status %d body %s", resp.StatusCode, resp.Body)
	}
	if len(options.Models) != 1 || options.Models[0] != "gpt-5" {
		t.Errorf("options = %+v", options)
	}

	// Quiesce drains and stops the worker: later records are dropped, but the
	// management API and storage stay alive until shutdown.
	call(t, "plugin.quiesce", nil)
	call(t, "usage.handle", model.UsageRecord{RequestID: "req-2", Model: "gpt-5", RequestedAt: time.Now()})
	time.Sleep(120 * time.Millisecond)
	resp = manage(t, handler.APIBasePath+"/records", nil)
	if err := json.Unmarshal(resp.Body, &records); err != nil {
		t.Fatalf("records after quiesce: %v", resp.Body)
	}
	if records.Total != 1 {
		t.Errorf("quiesced plugin must drop new records, got total %d", records.Total)
	}

	// The resource route is unauthenticated: it must never answer with data.
	resp = manage(t, "/v0/resource/plugins/cpa-usage-stats/dashboard", map[string][]string{"action": {"records"}})
	if !strings.HasPrefix(resp.Headers.Get("Content-Type"), "text/html") || strings.Contains(string(resp.Body), "req-1") {
		t.Errorf("resource route leaked data: %s %s", resp.Headers.Get("Content-Type"), resp.Body)
	}

	call(t, "plugin.shutdown", nil)
}

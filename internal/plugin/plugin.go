package plugin

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	"cpa-usage-stats/internal/config"
	"cpa-usage-stats/internal/handler"
	"cpa-usage-stats/internal/model"
	"cpa-usage-stats/internal/storage"
	"cpa-usage-stats/internal/worker"
)

// Instance is the singleton plugin instance.
type Instance struct {
	mu            sync.RWMutex
	cfg           config.Config
	currentDBPath string
	store         *storage.Storage
	worker        *worker.Worker
	handler       *handler.Handler
	htmlContent   []byte
}

var (
	pluginInstance *Instance
	once           sync.Once
)

// GetInstance returns the singleton plugin instance.
func GetInstance() *Instance {
	once.Do(func() {
		pluginInstance = &Instance{}
	})
	return pluginInstance
}

// SetEmbeddedHTML sets the dashboard HTML for the plugin.
func (p *Instance) SetEmbeddedHTML(html []byte) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.htmlContent = html
	if p.handler != nil {
		p.handler.SetHTMLContent(html)
	}
}

// HandleCall routes incoming C ABI method calls.
func (p *Instance) HandleCall(method string, payload []byte) ([]byte, error) {
	switch method {
	case "plugin.register":
		return p.handleRegister(payload)
	case "plugin.reconfigure":
		return p.handleReconfigure(payload)
	case "plugin.shutdown":
		p.handleShutdown()
		return okEnvelope(map[string]interface{}{})
	case "usage.handle":
		return p.handleUsage(payload)
	case "management.register":
		return p.handleManagementRegister()
	case "management.handle":
		return p.handleManagementHandle(payload)
	default:
		return errorEnvelope("unknown_method", "unknown method: "+method), nil
	}
}

type registerRequest struct {
	ConfigYAML string `json:"config_yaml"`
}

type registerResponse struct {
	SchemaVersion uint32            `json:"schema_version"`
	Metadata      metadataResponse  `json:"metadata"`
	Capabilities  map[string]bool   `json:"capabilities"`
}

type metadataResponse struct {
	Name             string            `json:"Name"`
	Version          string            `json:"Version"`
	Author           string            `json:"Author"`
	GitHubRepository string            `json:"GitHubRepository"`
	Logo             string            `json:"Logo"`
	ConfigFields     []configFieldInfo `json:"ConfigFields"`
}

type configFieldInfo struct {
	Name        string   `json:"Name"`
	Type        string   `json:"Type"`
	EnumValues  []string `json:"EnumValues,omitempty"`
	Description string   `json:"Description"`
}

func (p *Instance) handleRegister(payload []byte) ([]byte, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	var req registerRequest
	if len(payload) > 0 {
		_ = json.Unmarshal(payload, &req)
	}

	cfg, err := config.Parse(req.ConfigYAML)
	if err != nil {
		log.Printf("[cpa-usage-stats] parse config warning: %v, using defaults", err)
	}
	p.cfg = cfg

	// Safe non-blocking storage initialization (never fail plugin registration)
	p.ensureStorageLocked()

	// Return standard metadata and capabilities compatible with all CLIProxyAPI versions (schema_version 1)
	resp := registerResponse{
		SchemaVersion: 1,
		Metadata: metadataResponse{
			Name:             "cpa-usage-stats",
			Version:          "1.0.0",
			Author:           "tom2almighty",
			GitHubRepository: "https://github.com/tom2almighty/cpa-usage-stats",
			Logo:             "https://raw.githubusercontent.com/tom2almighty/cpa-usage-stats/main/assets/logo.svg",
			ConfigFields: []configFieldInfo{
				{
					Name:        "db_path",
					Type:        "string",
					Description: "SQLite 数据库存储路径 (默认 data/usage.db)",
				},
				{
					Name:        "batch_size",
					Type:        "integer",
					Description: "批量插入条数阈值 (默认 100)",
				},
				{
					Name:        "flush_interval_ms",
					Type:        "integer",
					Description: "批量刷盘间隔毫秒数 (默认 1000)",
				},
				{
					Name:        "channel_size",
					Type:        "integer",
					Description: "内存异步缓冲队列容量 (默认 10000)",
				},
				{
					Name:        "retention_days",
					Type:        "integer",
					Description: "数据保留天数，超期自动清理，0 为永久保存 (默认 90)",
				},
				{
					Name:        "dashboard_path",
					Type:        "string",
					Description: "Web 看板资源路径 (默认 /dashboard)",
				},
				{
					Name:        "dashboard_title",
					Type:        "string",
					Description: "管理中心插件菜单中显示的名称 (默认 用量统计看板)",
				},
			},
		},
		Capabilities: map[string]bool{
			"usage_plugin":   true,
			"management_api": true,
		},
	}

	return okEnvelope(resp)
}

func (p *Instance) ensureStorageLocked() {
	if p.store != nil && p.currentDBPath == p.cfg.DBPath {
		return
	}
	if p.worker != nil {
		p.worker.Stop()
		p.worker = nil
	}
	if p.store != nil {
		_ = p.store.Close()
		p.store = nil
	}

	// 1. Try configured DBPath
	_ = p.cfg.EnsureDir()
	store, err := storage.New(p.cfg.DBPath)
	if err == nil {
		p.store = store
		p.worker = worker.New(p.cfg, store)
		p.handler = handler.New(store, p.htmlContent)
		p.currentDBPath = p.cfg.DBPath
		log.Printf("[cpa-usage-stats] initialized storage at %s", p.cfg.DBPath)
		return
	}

	log.Printf("[cpa-usage-stats] warning: failed to open storage at %s: %v, attempting fallback...", p.cfg.DBPath, err)

	// 2. Fallback to temporary directory
	fallbackPath := filepath.Join(os.TempDir(), "cpa-usage-stats.db")
	fallbackStore, fbErr := storage.New(fallbackPath)
	if fbErr == nil {
		p.store = fallbackStore
		p.worker = worker.New(p.cfg, fallbackStore)
		p.handler = handler.New(fallbackStore, p.htmlContent)
		p.currentDBPath = fallbackPath
		log.Printf("[cpa-usage-stats] initialized fallback storage at %s", fallbackPath)
		return
	}

	log.Printf("[cpa-usage-stats] error: fallback storage at %s also failed: %v", fallbackPath, fbErr)
}

func (p *Instance) handleReconfigure(payload []byte) ([]byte, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	var req registerRequest
	if len(payload) > 0 {
		_ = json.Unmarshal(payload, &req)
	}

	cfg, err := config.Parse(req.ConfigYAML)
	if err == nil {
		p.cfg = cfg
	}

	p.ensureStorageLocked()
	return okEnvelope(map[string]interface{}{})
}

func (p *Instance) handleUsage(payload []byte) ([]byte, error) {
	if len(payload) == 0 {
		return okEnvelope(map[string]interface{}{})
	}

	var record model.UsageRecord
	if err := json.Unmarshal(payload, &record); err != nil {
		return errorEnvelope("invalid_usage_record", err.Error()), nil
	}

	p.mu.Lock()
	p.ensureStorageLocked()
	w := p.worker
	p.mu.Unlock()

	if w != nil {
		w.Enqueue(record)
	}

	return okEnvelope(map[string]interface{}{})
}

func (p *Instance) handleManagementRegister() ([]byte, error) {
	p.mu.RLock()
	cfg := p.cfg
	p.mu.RUnlock()

	dashboardPath := cfg.DashboardPath
	if dashboardPath == "" {
		dashboardPath = "/dashboard"
	}
	dashboardTitle := cfg.DashboardTitle
	if dashboardTitle == "" {
		dashboardTitle = "用量统计看板"
	}

	resp := model.ManagementRegistrationResponse{
		Resources: []model.ResourceRoute{
			{
				Path:        dashboardPath,
				Menu:        dashboardTitle,
				Description: "在管理面板中打开用量统计监控看板",
			},
		},
		Routes: []model.ManagementRoute{
			{
				Method:      http.MethodGet,
				Path:        "/plugins/cpa-usage-stats/summary",
				Description: "获取用量统计聚合数据",
			},
			{
				Method:      http.MethodGet,
				Path:        "/plugins/cpa-usage-stats/records",
				Description: "分页获取用量调用明细记录",
			},
		},
	}

	return okEnvelope(resp)
}

func (p *Instance) handleManagementHandle(payload []byte) ([]byte, error) {
	p.mu.Lock()
	p.ensureStorageLocked()
	h := p.handler
	p.mu.Unlock()

	if h == nil {
		return errorEnvelope("not_initialized", "handler not initialized"), nil
	}

	var req model.ManagementRequest
	if err := json.Unmarshal(payload, &req); err != nil {
		return errorEnvelope("invalid_management_request", err.Error()), nil
	}

	resp, err := h.Handle(req)
	if err != nil {
		return errorEnvelope("handler_error", err.Error()), nil
	}

	return okEnvelope(resp)
}

func (p *Instance) handleShutdown() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.worker != nil {
		p.worker.Stop()
		p.worker = nil
	}
	if p.store != nil {
		_ = p.store.Close()
		p.store = nil
	}
	p.currentDBPath = ""
	log.Printf("[cpa-usage-stats] shutdown completed")
}

func okEnvelope(result interface{}) ([]byte, error) {
	resBytes, err := json.Marshal(result)
	if err != nil {
		return errorEnvelope("marshal_error", err.Error()), nil
	}
	env := model.Envelope{
		OK:     true,
		Result: json.RawMessage(resBytes),
	}
	return json.Marshal(env)
}

func errorEnvelope(code, message string) []byte {
	env := model.Envelope{
		OK: false,
		Error: &model.EnvelopeError{
			Code:    code,
			Message: message,
		},
	}
	raw, _ := json.Marshal(env)
	return raw
}

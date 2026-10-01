package plugin

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"cpa-usage-stats/internal/config"
	"cpa-usage-stats/internal/handler"
	"cpa-usage-stats/internal/model"
	"cpa-usage-stats/internal/storage"
	"cpa-usage-stats/internal/worker"
)

// Version is injected at build time: -ldflags "-X cpa-usage-stats/internal/plugin.Version=1.2.3".
var Version = "dev"

// rpcSchema is the RPC schema this plugin speaks. It is always claimed so the
// plugin requires a host from the v8 era; schema 6 also stops the host from
// HTML-escaping strings in management JSON responses.
const rpcSchema = 6

// Instance is the singleton plugin instance.
type Instance struct {
	mu          sync.RWMutex
	cfg         config.Config
	store       *storage.Storage
	worker      *worker.Worker
	htmlContent []byte
}

var (
	pluginInstance *Instance
	once           sync.Once
)

// GetInstance returns the singleton plugin instance.
func GetInstance() *Instance {
	once.Do(func() {
		pluginInstance = &Instance{}
		// The handler cannot import the worker package (it would cycle through
		// storage), so the counter source is injected here.
		handler.SetStatsProvider(func() model.RuntimeStats {
			p := pluginInstance
			if p == nil {
				return model.RuntimeStats{}
			}
			p.mu.RLock()
			defer p.mu.RUnlock()
			if p.worker == nil {
				return model.RuntimeStats{}
			}
			return p.worker.Stats()
		})
	})
	return pluginInstance
}

// SetEmbeddedHTML sets the dashboard HTML for the plugin.
func (p *Instance) SetEmbeddedHTML(html []byte) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.htmlContent = html
}

// HandleCall routes incoming C ABI method calls.
func (p *Instance) HandleCall(method string, payload []byte) ([]byte, error) {
	switch method {
	case "plugin.register", "plugin.reconfigure":
		// The host validates both replies identically: a reconfigure reply
		// without metadata/capabilities drops the plugin from the runtime.
		return p.handleRegister(payload)
	case "plugin.quiesce":
		p.handleQuiesce()
		return okEnvelope(struct{}{})
	case "plugin.shutdown":
		p.handleShutdown()
		return okEnvelope(struct{}{})
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
	ConfigYAML    []byte `json:"config_yaml"`
	SchemaVersion uint32 `json:"schema_version"`
}

type registerResponse struct {
	SchemaVersion uint32           `json:"schema_version"`
	Metadata      metadataResponse `json:"metadata"`
	Capabilities  map[string]bool  `json:"capabilities"`
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
	Name        string `json:"Name"`
	Type        string `json:"Type"`
	Description string `json:"Description"`
}

var configFields = []configFieldInfo{
	{Name: "db_path", Type: "string", Description: "SQLite 数据库路径，相对 CLIProxyAPI 工作目录 (默认 plugins/cpa-usage-stats/usage.db)"},
	{Name: "batch_size", Type: "integer", Description: "批量写入条数阈值 (默认 100)"},
	{Name: "flush_interval_ms", Type: "integer", Description: "批量写入最长间隔毫秒数 (默认 1000)"},
	{Name: "channel_size", Type: "integer", Description: "内存缓冲队列容量，满了会丢弃新记录 (默认 10000)"},
	{Name: "retention_days", Type: "integer", Description: "数据保留天数，0 为永久保存 (默认 90)"},
	{Name: "exclude_models", Type: "array", Description: "不记录的模型或别名列表"},
	{Name: "dashboard_path", Type: "string", Description: "看板资源路径 (默认 /dashboard)"},
	{Name: "dashboard_title", Type: "string", Description: "管理中心菜单名称 (默认 用量统计看板)"},
}

func (p *Instance) handleRegister(payload []byte) ([]byte, error) {
	var req registerRequest
	if len(payload) > 0 {
		if err := json.Unmarshal(payload, &req); err != nil {
			return errorEnvelope("invalid_request", err.Error()), nil
		}
	}
	cfg, err := config.Parse(req.ConfigYAML)
	if err != nil {
		return errorEnvelope("invalid_config", err.Error()), nil
	}
	if err := p.apply(cfg); err != nil {
		log.Printf("[cpa-usage-stats] open storage %s failed: %v", cfg.DBPath, err)
		return errorEnvelope("storage_unavailable", err.Error()), nil
	}

	return okEnvelope(registerResponse{
		SchemaVersion: rpcSchema,
		Metadata: metadataResponse{
			Name:             "cpa-usage-stats",
			Version:          Version,
			Author:           "tom2almighty",
			GitHubRepository: "https://github.com/tom2almighty/cpa-usage-stats",
			Logo:             "https://raw.githubusercontent.com/tom2almighty/cpa-usage-stats/main/assets/logo.svg",
			ConfigFields:     configFields,
		},
		Capabilities: map[string]bool{
			"usage_plugin":   true,
			"management_api": true,
		},
	})
}

// apply swaps in cfg. Storage is reopened only when db_path changes; the
// worker is always restarted so batch/retention/exclude settings take effect.
func (p *Instance) apply(cfg config.Config) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.worker != nil {
		p.worker.Stop()
		p.worker = nil
	}
	if p.store == nil || cfg.DBPath != p.cfg.DBPath {
		if p.store != nil {
			_ = p.store.Close()
			p.store = nil
		}
		if err := cfg.EnsureDir(); err != nil {
			return err
		}
		store, err := storage.New(cfg.DBPath)
		if err != nil {
			return err
		}
		p.store = store
		log.Printf("[cpa-usage-stats] storage opened at %s", cfg.DBPath)
	}
	p.cfg = cfg
	p.worker = worker.New(cfg, p.store)
	return nil
}

func (p *Instance) handleUsage(payload []byte) ([]byte, error) {
	var record model.UsageRecord
	if err := json.Unmarshal(payload, &record); err != nil {
		return errorEnvelope("invalid_usage_record", err.Error()), nil
	}

	// Enqueue never blocks, so holding the read lock keeps records from
	// landing in a worker that apply is stopping.
	p.mu.RLock()
	if p.worker != nil {
		p.worker.Enqueue(record)
	}
	p.mu.RUnlock()

	return okEnvelope(struct{}{})
}

func (p *Instance) handleManagementRegister() ([]byte, error) {
	p.mu.RLock()
	cfg := p.cfg
	p.mu.RUnlock()

	return okEnvelope(model.ManagementRegistrationResponse{
		Resources: []model.ResourceRoute{{
			Path:        cfg.DashboardPath,
			Menu:        cfg.DashboardTitle,
			Description: "请求量、Token 用量与调用明细",
		}},
		Routes: []model.ManagementRoute{
			{Method: http.MethodGet, Path: handler.APIBasePath + "/summary", Description: "用量聚合统计"},
			{Method: http.MethodGet, Path: handler.APIBasePath + "/records", Description: "调用明细分页"},
			{Method: http.MethodGet, Path: handler.APIBasePath + "/options", Description: "筛选下拉选项"},
			{Method: http.MethodGet, Path: handler.APIBasePath + "/stats", Description: "运行时计数（丢弃记录、队列压力）"},
		},
	})
}

// handleQuiesce drains buffered records into storage before a hot reload
// replaces this plugin instance. Storage stays open for the host's shutdown.
func (p *Instance) handleQuiesce() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.worker != nil {
		p.worker.Stop()
		p.worker = nil
	}
	log.Printf("[cpa-usage-stats] quiesced: buffered usage records flushed")
}

func (p *Instance) handleManagementHandle(payload []byte) ([]byte, error) {
	var req model.ManagementRequest
	if err := json.Unmarshal(payload, &req); err != nil {
		return errorEnvelope("invalid_management_request", err.Error()), nil
	}

	p.mu.RLock()
	defer p.mu.RUnlock()
	return okEnvelope(handler.Handle(p.store, p.htmlContent, req))
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
	log.Printf("[cpa-usage-stats] shutdown completed")
}

func okEnvelope(result any) ([]byte, error) {
	resBytes, err := json.Marshal(result)
	if err != nil {
		return errorEnvelope("marshal_error", err.Error()), nil
	}
	return json.Marshal(model.Envelope{OK: true, Result: resBytes})
}

func errorEnvelope(code, message string) []byte {
	raw, _ := json.Marshal(model.Envelope{
		OK:    false,
		Error: &model.EnvelopeError{Code: code, Message: message},
	})
	return raw
}

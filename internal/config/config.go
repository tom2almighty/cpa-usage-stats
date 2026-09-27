package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config represents plugin configuration options.
type Config struct {
	DBPath          string   `yaml:"db_path"`
	BatchSize       int      `yaml:"batch_size"`
	FlushIntervalMs int      `yaml:"flush_interval_ms"`
	ChannelSize     int      `yaml:"channel_size"`
	RetentionDays   int      `yaml:"retention_days"`
	DashboardPath   string   `yaml:"dashboard_path"`
	DashboardTitle  string   `yaml:"dashboard_title"`
	ExcludeModels   []string `yaml:"exclude_models"`
}

// DefaultConfig returns default plugin configuration.
// DBPath lives under the host's default plugins dir so Docker users who mount
// plugins/ keep their stats across container recreation.
func DefaultConfig() Config {
	return Config{
		DBPath:          "plugins/cpa-usage-stats/usage.db",
		BatchSize:       100,
		FlushIntervalMs: 1000,
		ChannelSize:     10000,
		RetentionDays:   90,
		DashboardPath:   "/dashboard",
		DashboardTitle:  "用量统计看板",
	}
}

// Parse parses the host-provided plugins.configs.<id> YAML onto DefaultConfig.
// Empty or non-positive values fall back to defaults because management UIs
// may persist blank fields.
func Parse(raw []byte) (Config, error) {
	cfg := DefaultConfig()
	if err := yaml.Unmarshal(raw, &cfg); err != nil {
		return Config{}, fmt.Errorf("parse plugin config: %w", err)
	}

	def := DefaultConfig()
	cfg.DBPath = strings.TrimSpace(cfg.DBPath)
	if cfg.DBPath == "" {
		cfg.DBPath = def.DBPath
	}
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = def.BatchSize
	}
	if cfg.FlushIntervalMs <= 0 {
		cfg.FlushIntervalMs = def.FlushIntervalMs
	}
	if cfg.ChannelSize <= 0 {
		cfg.ChannelSize = def.ChannelSize
	}
	if cfg.RetentionDays < 0 {
		cfg.RetentionDays = 0
	}
	if strings.TrimSpace(cfg.DashboardPath) == "" {
		cfg.DashboardPath = def.DashboardPath
	}
	if strings.TrimSpace(cfg.DashboardTitle) == "" {
		cfg.DashboardTitle = def.DashboardTitle
	}
	return cfg, nil
}

// EnsureDir ensures the directory for DBPath exists.
func (c *Config) EnsureDir() error {
	dir := filepath.Dir(c.DBPath)
	if dir != "" && dir != "." {
		return os.MkdirAll(dir, 0755)
	}
	return nil
}

package config

import (
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// Config represents plugin configuration options.
type Config struct {
	Enabled         bool     `yaml:"enabled"`
	Priority        int      `yaml:"priority"`
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
func DefaultConfig() Config {
	return Config{
		Enabled:         true,
		Priority:        10,
		DBPath:          "data/usage.db",
		BatchSize:       100,
		FlushIntervalMs: 1000,
		ChannelSize:     10000,
		RetentionDays:   90,
		DashboardPath:   "/dashboard",
		DashboardTitle:  "用量统计看板",
		ExcludeModels:   nil,
	}
}

// Parse parses YAML configuration data onto DefaultConfig.
func Parse(rawYAML string) (Config, error) {
	cfg := DefaultConfig()
	if rawYAML == "" {
		return cfg, nil
	}

	if err := yaml.Unmarshal([]byte(rawYAML), &cfg); err != nil {
		return cfg, err
	}

	if cfg.DBPath == "" {
		cfg.DBPath = "data/usage.db"
	}
	if cfg.BatchSize <= 0 {
		cfg.BatchSize = 100
	}
	if cfg.FlushIntervalMs <= 0 {
		cfg.FlushIntervalMs = 1000
	}
	if cfg.ChannelSize <= 0 {
		cfg.ChannelSize = 10000
	}
	if cfg.DashboardPath == "" {
		cfg.DashboardPath = "/dashboard"
	}
	if cfg.DashboardTitle == "" {
		cfg.DashboardTitle = "用量统计看板"
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

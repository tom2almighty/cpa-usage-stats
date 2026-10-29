# cpa-usage-stats

[中文](README.md)

CLIProxyAPI (CPA 8.0+) usage statistics plugin: collects request and token usage through the usage plugin API, persists it asynchronously to SQLite, and ships an embedded dashboard.

## Overview

- Collects requests, tokens, latency and failures, then writes them to SQLite in asynchronous batches.
- Embedded dashboard with usage trends, breakdowns, token composition, an activity heatmap, request details and storage usage.
- Configurable retention, excluded models and batch-write parameters.

## Development

Requirements:

- Go 1.25+ with CGO (GCC or Clang)
- Node.js 24+ / pnpm 12+

```bash
./build.sh                              # build frontend and shared library
go test ./...                           # backend tests
cd web && pnpm install && pnpm run dev  # frontend only
```

For frontend development, open `http://localhost:5173/?api_base=http://127.0.0.1:8317` and point it at a running CPA instance.

Frontend stack: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn, Recharts, i18next.

## Build and deployment

### Install from the plugin store

Once listed in the official plugin store, search for `CPA Usage Stats` in the Management Center. Alternatively, add this repository's store source to CPA:

```yaml
plugins:
  enabled: true
  dir: "plugins"
  store-sources:
    - "https://raw.githubusercontent.com/tom2almighty/cpa-usage-stats/main/plugin-store/registry.json"
```

### Manual install

Download the archive for your platform from [Releases](https://github.com/tom2almighty/cpa-usage-stats/releases) and place `cpa-usage-stats.so` (Linux), `.dylib` (macOS) or `.dll` (Windows) into CPA's `plugins` directory. For Docker, place the shared library in the mounted plugin directory.

```bash
mkdir -p /path/to/cliproxyapi/plugins
cp cpa-usage-stats.so /path/to/cliproxyapi/plugins/
```

### Configuration

```yaml
plugins:
  enabled: true
  dir: "plugins"
  configs:
    cpa-usage-stats:
      enabled: true
      priority: 10
      db_path: "plugins/cpa-usage-stats/usage.db" # SQLite path, relative to the CPA working directory
      batch_size: 100                             # batch write threshold
      flush_interval_ms: 1000                     # maximum buffering time in milliseconds
      channel_size: 10000                         # in-memory queue capacity; new records are dropped when full
      retention_days: 90                          # retention in days; 0 keeps data forever
      exclude_models: []                          # models or aliases that should not be recorded
      dashboard_path: "/dashboard"                # dashboard resource path
      dashboard_title: "Usage Stats"              # Management Center menu label
```

### Local packaging

```bash
./scripts/package-release.sh 0.8.0
```

Artifacts are written to `release-dist/` with platform archives and `checksums.txt`.

### Usage

Open `Usage Stats` from the Management Center plugin list, or visit:

```text
http://127.0.0.1:8317/v0/resource/plugins/cpa-usage-stats/dashboard
```

- The dashboard reads data through the plugin management API (`/v0/management/plugins/cpa-usage-stats/*`, management key required).
- The management key is resolved in this order: saved by this plugin (`localStorage`) → saved by cpa-dashboard → saved by the official Management Center.
- Without a key the dashboard still renders but sends no requests; use the "Management key" action in the top-right corner.
- CPA temporarily bans an IP for about 30 minutes after five consecutive authentication failures, so the dashboard never sends requests without a key.

### Docker

```yaml
services:
  cli-proxy-api:
    image: ghcr.io/router-for-me/cliproxyapi:latest
    volumes:
      - ./plugins:/app/plugins
      - ./config.yaml:/app/config.yaml
    ports:
      - "8317:8317"
```

Place the shared library in `./plugins` and restart the container.

## License

[AGPL-3.0](LICENSE)

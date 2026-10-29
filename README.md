# cpa-usage-stats

[English](README.en.md)

CLIProxyAPI（CPA 8.0+）用量统计插件：通过 usage 插件接口采集请求与 Token 用量，异步写入 SQLite，并提供内嵌看板。

## 项目简介

- 采集请求、Token、延迟、失败等用量数据，按批异步写入 SQLite。
- 内置看板：用量总览（走势、维度分布、Token 构成、活动热力图）、调用明细和空间占用。
- 支持数据保留天数、模型排除、批量写入参数等配置。

## 开发环境配置

前置要求：

- Go 1.25+（需 CGO，装有 GCC 或 Clang）
- Node.js 24+ / pnpm 12+

```bash
./build.sh                              # 打包前端并编译动态库
go test ./...                           # 后端测试
cd web && pnpm install && pnpm run dev  # 单独调试前端
```

前端开发时资源页默认同源调用插件接口，用 `?api_base=http://127.0.0.1:8317` 指定正在运行的 CPA 地址。

前端技术栈：React 19、TypeScript、Vite、Tailwind CSS v4、shadcn、Recharts、i18next。

## 构建与部署

### 插件商店安装

插件收录到官方插件商店后，在管理中心搜索 `CPA Usage Stats` 安装。也可以在 CPA 中添加本仓库的商店源：

```yaml
plugins:
  enabled: true
  dir: "plugins"
  store-sources:
    - "https://raw.githubusercontent.com/tom2almighty/cpa-usage-stats/main/plugin-store/registry.json"
```

### 手动安装

从 [Releases](https://github.com/tom2almighty/cpa-usage-stats/releases) 下载对应平台的压缩包，解压得到 `cpa-usage-stats.so`（Linux）/ `.dylib`（macOS）/ `.dll`（Windows），放入 CPA 的 `plugins` 目录。Docker 部署时，把动态库放进映射的插件目录。

```bash
mkdir -p /path/to/cliproxyapi/plugins
cp cpa-usage-stats.so /path/to/cliproxyapi/plugins/
```

### 配置

```yaml
plugins:
  enabled: true
  dir: "plugins"
  configs:
    cpa-usage-stats:
      enabled: true
      priority: 10
      db_path: "plugins/cpa-usage-stats/usage.db" # SQLite 数据库路径，相对 CPA 工作目录
      batch_size: 100                             # 批量写入条数阈值
      flush_interval_ms: 1000                     # 批量写入最长缓冲时间（毫秒）
      channel_size: 10000                         # 内存队列容量，写满会丢弃新记录
      retention_days: 90                          # 历史保留天数，0 为永久
      exclude_models: []                          # 不记录的模型或别名
      dashboard_path: "/dashboard"                # 看板资源路径
      dashboard_title: "用量统计"                  # 管理中心菜单名称
```

### 本地打包

```bash
./scripts/package-release.sh 0.8.0
```

产物写入 `release-dist/`，包含平台压缩包与 `checksums.txt`。

### 使用

在管理中心插件列表点击「用量统计」，或直接访问：

```text
http://127.0.0.1:8317/v0/resource/plugins/cpa-usage-stats/dashboard
```

- 看板通过插件管理接口（`/v0/management/plugins/cpa-usage-stats/*`，需管理密钥）读取数据。
- 管理密钥按以下顺序解析：本插件保存的（`localStorage`）→ cpa-dashboard 面板保存的 → 官方管理中心保存的。
- 都读不到时看板照常渲染但不发请求，点击右上角「管理密钥」输入即可。
- CPA 对同一 IP 连续 5 次认证失败会临时封禁约 30 分钟，因此缺少密钥时看板不会尝试请求。

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

把动态库放到 `./plugins` 后重启容器即可。

## 开源许可证

[AGPL-3.0](LICENSE)

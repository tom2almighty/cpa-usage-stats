# cpa-usage-stats

CLIProxyAPI（CPA）用量持久化与统计看板插件（v8 版）。

## 简介

本插件作为 CLIProxyAPI 的原生动态库插件运行，通过 v8 用量观察能力（`usage_plugin`）接收上游模型请求的完整用量记录并持久化到 SQLite，同时内嵌 Web 统计看板，直接集成到 CLIProxyAPI 自带的管理中心（Management 面板）的插件菜单中，开箱即用，无需额外独立部署 Web 页面或前端服务。

**v8 版本要求**：本插件固定声明 RPC schema 6，要求 v8 时代的 CLIProxyAPI 宿主，不向后兼容旧版宿主（旧宿主会拒绝加载本插件）。

## 记录的数据字段

在 v8 `UsageRecord` 全量字段中持久化：

- 标识：`RequestID`、`TraceID`、`SessionID`、`ParentSessionID`
- 路由：`Provider`、`BaseURL`、`ExecutorType`、`Model`、`ResponseModel`（上游实际返回的模型）、`Alias`
- 客户端：`APIKey`、`AuthID`、`AuthIndex`、`AuthType`、`Source`
- 请求特征：`ReasoningEffort`、`ServiceTier`、`ResponseServiceTier`、`Stream`、`Generate`
- 性能：`Latency`、`TTFT`、失败状态码与响应体
- Token：输入 / 输出 / 思考 / 缓存总量 / **缓存读 / 缓存写** / 总计

失败请求额外落库从响应体解析出的**错误类型**（兼容 `error.type`、`error.code`、`type`、`code` 四种上游写法），用于失败归组。

> 表结构以 `PRAGMA user_version` 版本号控制，当前为 4。版本不匹配时表会被直接重建——统计属于派生数据，插件不提供跨版本数据迁移，升级后历史统计会清空。

## 构建方式

### 前置要求

- Go 1.25+（需启用 CGO，系统装有 GCC 或 Clang）
- Bun 1.4+（前端用 Tailwind CSS v4 + shadcn CLI，需要较新的 Bun）

### 本地编译

```bash
# 执行构建脚本（自动完成 Bun 打包前端并编译 CGO 动态库）
./build.sh
```

编译产物为 `cpa-usage-stats.so`（Linux）或 `cpa-usage-stats.dylib`（macOS）。

只调前端时可单独起 Vite 开发服务器（`cd web && bun run dev`）。资源页默认同源调用插件接口，本地开发时用 `?api_base=http://127.0.0.1:8317` 指定正在运行的 CLIProxyAPI 地址即可。

### 打包发布资产

```bash
# 生成符合官方插件商店规范的跨平台发布压缩包与 checksums.txt
./scripts/package-release.sh 1.0.0
```

---

## 部署与配置

### 1. 放置插件

将编译好的动态库放入 CLIProxyAPI 程序的 `plugins` 目录中：

```bash
mkdir -p /path/to/cliproxyapi/plugins
cp cpa-usage-stats.so /path/to/cliproxyapi/plugins/
```

### 2. 启用配置

在 CLIProxyAPI 的 `config.yaml` 中配置启用该插件：

```yaml
plugins:
  enabled: true
  dir: "plugins"
  configs:
    cpa-usage-stats:
      enabled: true
      priority: 10
      db_path: "data/usage.db"          # SQLite 数据库文件保存路径
      batch_size: 100                   # 批量写入阈值 (条数)
      flush_interval_ms: 1000           # 批量写入最长缓冲时间 (毫秒)
      channel_size: 10000               # 内存入队缓冲队列大小
      retention_days: 90                # 历史数据保留天数 (0 为永久保存)
      exclude_models: []                # 不记录的模型或别名列表
      dashboard_path: "/dashboard"      # 看板访问资源路径
      dashboard_title: "用量统计看板"    # 管理面板菜单中显示的名称
```

### 3. 在 WebUI 插件页面直接点击打开

启动 CLIProxyAPI 后：

1. 访问 CLIProxyAPI 自带的管理中心（Management WebUI）。
2. 打开「插件列表」页面，在 `cpa-usage-stats` 插件卡片上即可看到「**用量统计看板**」按钮或链接。
3. 点击即可在管理中心内直接打开看板，查看实时请求量、Token 分布、模型调用排行及调用明细日志。

亦可直接在浏览器中访问资源地址：

```text
http://127.0.0.1:8317/v0/resource/plugins/cpa-usage-stats/dashboard
```

### 4. 看板鉴权说明

看板页面通过插件自己的管理接口（需要管理密钥）读取统计数据。密钥按以下顺序解析，命中即用：

1. 看板自己保存的密钥：在「管理密钥」弹窗中填写后写入 `localStorage`（键名 `cpa-usage-stats.management-key`）；
2. cpa-dashboard 面板保存的密钥：`sessionStorage` / `localStorage` 的 `cpa-dashboard.management-key`（面板与资源页同源时可直接复用）；
3. 官方管理中心保存的密钥：`localStorage` 的 `cli-proxy-auth`（需在管理中心勾选「记住密码」）。

解析不到密钥时看板仍会渲染界面，但**不会发送任何请求**，只提示需要密钥；点击右上角「管理密钥」可随时输入或覆盖密钥，弹窗内也可清除本地保存的密钥。密钥无效时页面顶部提示重新输入，输入后才会再次请求。

> 注意：CLIProxyAPI 对同一客户端 IP 连续 5 次认证失败会临时封禁约 30 分钟。看板因此不在缺少密钥时发请求，也请在确认密钥无误后再点击「连接」。

### 5. 看板功能

- **用量总览**：请求量 / 成功率、Token 总量（含输入 / 输出 / 思考）、**缓存命中率**、平均延迟与 **P50 / P95 / P99 分位**、**平均输出吞吐（t/s）与流式占比**、预估成本六组指标卡；按小时（今日 / 昨天）或按天（7 天 / 30 天 / 全部）的双轴趋势图（成功 / 失败请求堆叠柱 + 输入 / 输出 Tokens 堆叠面积，tooltip 带平均与 P95 延迟）；Provider 分布环形图；模型用量排行（含失败数、Token 占比、**单价与预估成本**、可点击设置自定义价格）；**上游凭据用量**（按 auth 维度看各账号的请求、失败、Token、缓存与延迟）；**失败诊断**（按状态码 + 错误类型归组，附响应样本）；**会话用量**（按 session 聚合请求数、Token、平均 Token/请求）；客户端 Key 用量表。
- **调用明细**：关键词（Key / 模型 / Request / Trace / Session / 错误信息）与模型、Provider、Key、凭据、会话 ID、状态多维筛选，分页浏览；展开单条记录查看 Request ID、Trace ID、会话 / 父会话 ID、认证信息、上游 Base URL、执行器类型、推理力度、Service Tier（请求 → 响应）、流式 / 生成标记、**错误类型**、完整 Token 分解、**匹配到的模型价格与单条预估成本**、失败响应详情。
- **数据可信度**：内存队列写满导致记录被丢弃时，总览页顶部会明确告警（含丢弃条数），避免把残缺数据当成全量。
- 时间范围切换、自动刷新（10s / 30s / 60s）、中英双语、深浅主题（含跟随系统）。

看板前端与 cpa-dashboard 面板保持同一套技术选型与设计体系：React 19 + TypeScript + Vite + Tailwind CSS v4，组件由 shadcn CLI（`base-nova` 风格，Base UI 底层）生成，图表用 shadcn chart（Recharts）配合 `--chart-*` 主题变量，主题 Token 与面板完全一致，因此嵌入管理中心时配色与面板协调。文案走 i18next（默认中文，可切英文），语言选择存 `localStorage` 的 `cpa-usage-stats.language`。

### 6. 模型价格与成本估算

成本数据来自 [models.dev](https://github.com/anomalyco/models.dev)（USD / 每 100 万 tokens）：

- 看板首次打开时拉取一次 `https://models.dev/api.json`（约 5 MB），只保留「模型 id → 渠道 → 价格」的索引（约 0.5 MB）存入浏览器 `localStorage`，**24 小时内复用缓存**；网络失败时继续用过期缓存兜底，也可点「刷新价格」手动更新。
- 模型匹配顺序：`response_model` → `model` → `alias`，先精确匹配，再去掉渠道前缀、日期后缀（如 `-20250929`）、`-latest` / `-preview` 等后缀回退匹配；同一模型在多个渠道有价格时，优先取与记录 provider 对应的渠道（`claude`→`anthropic`、`codex`→`openai`、`gemini`/`vertex`→`google` 等）。
- 计费口径按 CPA 的 token 语义折算：缓存读 / 写按缓存价（缺失时按输入价），OpenAI 系（缓存计入输入）先从输入里扣除缓存 token，Claude 系（缓存独立计数）直接相加，Gemini 系（思考独立于输出）思考按输出价计费。
- 展示的是**标准价估算**：不含上下文阶梯价、批量折扣、渠道加价与免费额度；未匹配到价格的模型显示「未匹配」，不计入成本。

### 7. 管理 API

插件在 `/v0/management/plugins/cpa-usage-stats` 下注册四个只读接口（宿主管理密钥鉴权）：

| 接口 | 说明 |
| --- | --- |
| `GET /summary` | 聚合统计（支持 `range`、`model`、`provider`、`api_key`、`auth_id`、`session_id`、`failed`、`keyword`） |
| `GET /records` | 调用明细分页（同上筛选 + `page`、`page_size`） |
| `GET /options` | 筛选下拉选项（去重后的模型 / Provider / Key / 凭据） |
| `GET /stats` | 运行时计数：`dropped_records`、`queue_depth`、`queue_capacity` |

`/summary` 除总量与趋势外，还返回 `model_stats`、`provider_stats`、`api_key_stats`、`auth_stats`、`session_stats`、`failure_stats` 六个聚合维度，以及 `cache_hit_rate`、`p50/p95/p99_latency_ms`、`avg_output_tps`、`stream_requests` 等派生指标。

> 说明：按宿主设计，插件自定义管理路由统一挂载在 `/v0/management` 前缀下（v8 宿主不将 `/v8/management` 转发给插件），这与 v8 管理API的插件扩展规范一致。`/v0/management` 与 `/v8/management` 共用同一套管理密钥鉴权与失败计数（连续 5 次失败封禁 IP 约 30 分钟），所以插件既不需要、也无法改用 `/v8` 前缀。

---

## 插件商店集成

本插件严格对齐官方 `CLIProxyAPI-Plugins-Store` 插件商店规范。

### 1. 发布到 GitHub Release

当你在 GitHub 仓库打上 `v1.0.0` 标签并推送时，仓库自带的 GitHub Actions 工作流（`.github/workflows/release.yml`）会自动编译跨平台动态库并创建 Release 资产：

- `cpa-usage-stats_1.0.0_linux_amd64.zip`（内含 `cpa-usage-stats.so`）
- `cpa-usage-stats_1.0.0_linux_arm64.zip`（内含 `cpa-usage-stats.so`）
- `cpa-usage-stats_1.0.0_darwin_arm64.zip`（内含 `cpa-usage-stats.dylib`）
- `cpa-usage-stats_1.0.0_darwin_amd64.zip`（内含 `cpa-usage-stats.dylib`）
- `cpa-usage-stats_1.0.0_windows_amd64.zip`（内含 `cpa-usage-stats.dll`）
- `checksums.txt`（包含各 zip 文件的 SHA256 校验和）

### 2. 上架到官方插件商店

向官方插件仓库 [CLIProxyAPI-Plugins-Store](https://github.com/router-for-me/CLIProxyAPI-Plugins-Store) 提交 Pull Request，在 `registry.json` 的 `plugins` 数组中追加本插件元数据：

```json
{
  "id": "cpa-usage-stats",
  "name": "CPA Usage Stats",
  "description": "CLIProxyAPI v8 用量统计与可视化看板插件，支持 SQLite 异步持久化与内嵌 Web 监控面板。",
  "author": "tom2almighty",
  "repository": "https://github.com/tom2almighty/cpa-usage-stats",
  "logo": "https://raw.githubusercontent.com/tom2almighty/cpa-usage-stats/main/assets/logo.svg",
  "homepage": "https://github.com/tom2almighty/cpa-usage-stats",
  "license": "MIT",
  "tags": ["usage", "statistics", "dashboard", "sqlite"]
}
```

审核合并后，所有 CLIProxyAPI 用户的管理后台插件商店即可直接搜索、一键安装与更新本插件。

### 3. 自建私有插件商店

如果你不想提交到官方商店，也可以自建插件仓库：

1. 创建你自己的 GitHub 仓库（例如 `my-plugins-store`），并在根目录下放置 `registry.json`（参考本项目中的 `plugin-store/registry.json`）。
2. 在 CLIProxyAPI 的 `config.yaml` 中配置 `store-sources`：

```yaml
plugins:
  enabled: true
  dir: "plugins"
  store-sources:
    - "https://raw.githubusercontent.com/你的用户名/my-plugins-store/main/registry.json"
```

重启或热重载 CLIProxyAPI 后，管理后台插件商店会自动加载你的私有仓库，即可在界面中一键安装本插件。

---

## 测试

```bash
go test -v ./...
```

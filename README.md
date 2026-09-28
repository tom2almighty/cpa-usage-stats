# cpa-usage-stats

CLIProxyAPI（CPA）用量持久化与统计看板插件（v8 版）。

## 简介

本插件作为 CLIProxyAPI 的原生动态库插件运行，通过 v8 用量观察能力（`usage_plugin`）接收上游模型请求的完整用量记录并持久化到 SQLite，同时内嵌 Web 统计看板，直接集成到 CLIProxyAPI 自带的管理中心（Management 面板）的插件菜单中，开箱即用，无需额外独立部署 Web 页面或前端服务。

**v8 版本要求**：本插件固定声明 RPC schema 6，要求 v8 时代的 CLIProxyAPI 宿主，不向后兼容旧版宿主（旧宿主会拒绝加载本插件）。首次打开数据库时会自动重建表结构，**旧版本插件积累的统计数据会被丢弃**。

## 记录的数据字段

在 v8 `UsageRecord` 全量字段中持久化：

- 标识：`RequestID`、`TraceID`、`SessionID`
- 路由：`Provider`、`BaseURL`、`Model`、`ResponseModel`（上游实际返回的模型）、`Alias`
- 客户端：`APIKey`、`AuthID`、`AuthIndex`、`AuthType`、`Source`
- 请求特征：`ReasoningEffort`、`ServiceTier`、`ResponseServiceTier`、`Stream`、`Generate`
- 性能：`Latency`、`TTFT`、失败状态码与响应体
- Token：输入 / 输出 / 思考 / 缓存总量 / **缓存读 / 缓存写** / 总计

## 构建方式

### 前置要求

- Go 1.25+（需启用 CGO，系统装有 GCC 或 Clang）
- Bun 1.2+

### 本地编译

```bash
# 执行构建脚本（自动完成 Bun 打包前端并编译 CGO 动态库）
./build.sh
```

编译产物为 `cpa-usage-stats.so`（Linux）或 `cpa-usage-stats.dylib`（macOS）。

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

看板页面通过插件自己的管理接口（需要管理密钥）读取统计数据：

- 同源部署（管理中心与 CLIProxyAPI 同一 origin，含管理中心 iframe 内嵌场景）下，页面会自动复用管理中心保存在 `localStorage` 中的管理密钥（需在管理中心勾选「记住密码」）。
- 读取不到密钥时（未记住密码或跨源部署），页面会弹出输入框，手动输入管理密钥后即可使用；密钥仅保存在浏览器本地。

### 5. 看板功能

- **用量总览**：请求量 / 成功率、Token 总量、输入输出与缓存读写分列、平均延迟 / TTFT 四组指标卡；按小时（今日 / 昨天）或按天（7 天 / 30 天 / 全部）的双轴趋势图（请求数 + Tokens）；Provider 分布环形图；模型用量排行（含失败数与 Token 占比）；客户端 Key 用量表。
- **调用明细**：关键词（Key / 模型 / Request / Trace / Session / 错误信息）与模型、Provider、Key、状态多维筛选，分页浏览；展开单条记录查看 Request ID、Trace ID、Session ID、认证信息、上游 Base URL、推理力度、Service Tier（请求 → 响应）、流式 / 生成标记、完整 Token 分解与失败响应详情。
- 时间范围切换、自动刷新（10s / 30s / 60s）、深浅主题。

### 6. 管理 API

插件在 `/v0/management/plugins/cpa-usage-stats` 下注册三个只读接口（宿主管理密钥鉴权）：

| 接口 | 说明 |
| --- | --- |
| `GET /summary` | 聚合统计（支持 `range`、`model`、`provider`、`api_key`、`failed`、`keyword`） |
| `GET /records` | 调用明细分页（同上筛选 + `page`、`page_size`） |
| `GET /options` | 筛选下拉选项（去重后的模型 / Provider / Key） |

> 说明：按宿主设计，插件自定义管理路由统一挂载在 `/v0/management` 前缀下（v8 宿主不将 `/v8/management` 转发给插件），这与 v8 管理API的插件扩展规范一致。

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

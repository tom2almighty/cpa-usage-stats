# cpa-usage-stats

CLIProxyAPI（CPA）用量持久化与统计看板插件。

## 简介

本插件作为 CLIProxyAPI 的原生动态库插件运行，负责接收并持久化上游模型请求用量数据到 SQLite。同时内嵌 Web 统计看板，直接集成到 CLIProxyAPI 自带的管理后台（Management 面板）的插件菜单中，开箱即用，无需额外独立部署 Web 页面或前端服务。

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
  "description": "CLIProxyAPI 用量统计与可视化看板插件，支持 SQLite 异步持久化与内嵌 Web 监控面板。",
  "author": "你的用户名",
  "repository": "https://github.com/你的用户名/cpa-usage-stats",
  "logo": "https://raw.githubusercontent.com/你的用户名/cpa-usage-stats/main/assets/logo.svg",
  "homepage": "https://github.com/你的用户名/cpa-usage-stats",
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

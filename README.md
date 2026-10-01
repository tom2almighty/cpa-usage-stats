# cpa-usage-stats

CLIProxyAPI（CPA 8.0+）用量统计插件：通过 v8 管理 API（`usage_plugin`）接收请求用量并持久化到 SQLite，内置 Web 看板。

## 安装

### 方式一：从插件商店安装

在 CPA 的 `config.yaml` 中添加本插件仓库作为商店源：

```yaml
plugins:
  enabled: true
  dir: "plugins"
  store-sources:
    - "https://raw.githubusercontent.com/tom2almighty/cpa-usage-stats/main/plugin-store/registry.json"
```

重启或热重载 CPA 后，在管理中心的插件商店搜索 `CPA Usage Stats` 一键安装即可。

### 方式二：手动放置

从 [Releases](https://github.com/tom2almighty/cpa-usage-stats/releases) 下载对应平台的压缩包，解压得到 `cpa-usage-stats.so`（Linux）/ `.dylib`（macOS）/ `.dll`（Windows），放入 CPA 的 `plugins` 目录，Docker 部署时，把动态库放进映射的插件目录。

```bash
mkdir -p /path/to/cliproxyapi/plugins
cp cpa-usage-stats.so /path/to/cliproxyapi/plugins/
```

## 配置

在 CPA 的 `config.yaml` 中启用并调整参数：

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
      dashboard_path: "/dashboard" # 看板资源路径
      dashboard_title: "用量统计看板" # 管理中心菜单名称
```

打开看板：在管理中心插件列表点击「用量统计看板」，或直接访问：

```text
http://127.0.0.1:8317/v0/resource/plugins/cpa-usage-stats/dashboard
```

- 看板通过插件管理接口（`/v0/management/plugins/cpa-usage-stats/*`，需管理密钥）读取数据。
- 密钥按以下顺序解析：本插件保存的（`localStorage`）→ cpa-dashboard 面板保存的 → 官方管理中心保存的。
- 都读不到时看板照常渲染但**不发任何请求**，点击右上角「管理密钥」输入即可。

> CPA 对同一 IP 连续 5 次认证失败会临时封禁约 30 分钟，因此缺少密钥时看板不会尝试请求。

## 开发

- 前端开发时资源页默认同源调用插件接口，用 `?api_base=http://127.0.0.1:8317` 指定正在运行的 CPA 地址。
- 推送 `vx.y.z` 标签触发 GitHub Actions 构建跨平台产物。
- 本地可用 `./scripts/package-release.sh 1.0.0` 生成发布包。

**前置要求**

- Go 1.25+（需 CGO，装有 GCC 或 Clang）
- Bun 1.4+

```bash
./build.sh          # 打包前端并编译 CGO 动态库
go test ./...       # 后端测试
cd web && bun run dev    # 单独调试前端
```

**前端技术栈**

- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- shadcn
- Recharts
- i18next

## 说明

- 需要 CLIProxyAPI v8 管理 API（固定声明 RPC schema 6），不兼容旧版本。
- 成本数据来自 [models.dev](https://github.com/anomalyco/models.dev) 列表价估算，仅供参考。价格始终按「美元 / 100 万词元」存储。
- 右上角「显示设置」可切换大数字的缩写单位（跟随语言 / 英文 K/M）与展示币种（USD / CNY）。选 CNY 需要自行填写汇率，看板不会联网获取；该设置只影响展示，不改动任何已记录的数据。

## LICENSE

[AGPL-3.0](LICENSE)

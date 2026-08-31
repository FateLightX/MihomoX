# 参考源同步与审计

MihomoX 不直接合并参考仓库，也不把参考源码复制进本仓库。每次更新先对独立、干净
的 Git 克隆执行快进同步，再按提交范围审计，最后记录“需要移植”或“无需移植”。

## 权威源与本地参考仓库

官方 Mihomo/Zashboard 是配置、API 和面板资产的直接权威源；Nikki 是功能参考仓库：

| 参考源 | 本地目录 | 定位 | 当前审计版本 |
| --- | --- | --- | --- |
| [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo) | 按需使用系统临时目录 | 配置、API、内核资产权威源 | Alpha `68ec4fae652318bb1474bdfca3918191b167806d` |
| [Zephyruso/zashboard](https://github.com/Zephyruso/zashboard) | 不保留克隆 | 面板资产权威源 | `v3.24.0` |
| [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) | `../OpenWrt-nikki` | 主要功能基础 | `3799926` |

## 同步流程

同步前必须确认参考仓库工作区干净：

```sh
git -C ../OpenWrt-nikki status --short --branch
git -C ../OpenWrt-nikki fetch --prune origin
git -C ../OpenWrt-nikki merge --ff-only origin/main
```

同步后检查 `旧版本..新版本` 的提交、文件和实际行为。只有符合
[移植边界](../PORTING.md#2-参考来源) 的变化才进入 MihomoX；禁止整目录覆盖。

## 2026-09-01：Mihomo Alpha 全字段核对

- 官方 `Alpha` 最新提交为 `68ec4fae652318bb1474bdfca3918191b167806d`（2026-08-31）。
  `65287f0e..68ec4fae` 只有 `68ec4fae fix: ipv6 url parse in xhttp (#3160)`，仅改
  `adapter/outbound/vless.go`，不涉及配置字段和 API。
- 核对方法：上游对未知键静默忽略（实测塞入 `bogus-key-xyz`、拼错的 `dns.fake-ip-rang`
  和残留的 `mihomox-rules` 后 `mihomo -t` 仍然通过），因此 `-t` 通过不足以证明键名正确。
  改为解析上游 Go struct 的 `yaml:` tag 并递归展开 `RawConfig`，逐条比对
  `ucode/mixin.uc` 与 `mihomox.init` 写入/读取的 93 个配置路径：全部命中，0 缺失。
- 实测：用真实订阅节点生成“出厂默认值”和“全字段”两份配置，`mihomo -t`（alpha-68ec4fa）
  均通过，无 deprecation 警告。
- 枚举核对：`fake-ip-filter-mode` 的 `rule` 对应 `constant/dns.go` 的 `FilterRule`；
  sniffer 协议集合等于 `constant/sniffer/sniffer.go:26` 的 `List`（`TLS/HTTP/QUIC`，比较前
  `ToUpper`）；`Mijia Cloud` 通过 `trie.ValidAndSplitDomain`（`2f7eae5a` 只收紧首尾空白、
  尾点、空 label 和错位通配符）；rule-provider 的 `size-limit`/`interval` 以字符串传出无碍，
  上游 decoder 开启 `WeaklyTypedInput`；GeoData 文件名与 `constant/path.go:18-20,136-144` 一致。
- 适配 1：`mihomox.init` 的 TUN 预检 yq 表达式括号不平衡（9 开 10 闭），yq 报
  `bad expression, got close brackets without matching opening bracket` 并退出非零，
  使该检查从未生效。已补外层括号，并在 `tests/test_backend_regressions.sh` 增加对全部 yq
  表达式的括号平衡断言。
- 适配 2：`QUIC_GO_DISABLE_ECN` 单靠 procd 环境变量无效——`hub/executor/executor.go:218`
  会按 `config/config.go:573` 的内置默认 `true` 重新 `os.Setenv`，而 quic-go 在建连时才
  `strconv.ParseBool`（`sys_conn_oob.go:62`）。改为由 mixin 输出
  `experimental.quic-go-disable-gso` 和 `experimental.quic-go-disable-ecn`，出厂默认与上游
  对齐（ECN 关闭），迁移脚本把既有安装的存量值对齐到实际运行行为。`QUIC_GO_DISABLE_GSO`
  原本就有效（上游默认 `false`，核心不覆盖），保留环境变量以覆盖 `core_only` 模式。
- `/proxies`（`85c1798f`，2026-07-02）不再合并 proxy-provider 节点。MihomoX 前端只调
  `POST /upgrade/ui`，其余走通用 passthrough，不受影响；面板侧由 Zashboard 负责，latest
  已在该提交之后。
- Zashboard latest 仍为 `v3.24.0`，与上一轮记录一致，无需变更。
- keep-alive 三项不设值时，上游落到 `component/keepalive/tcp_keepalive.go` 的 `0/0/false`，
  go1.23+ 路径下等价于 `net.KeepAliveConfig{Enable:true, Idle:0, Interval:0}`，Go 文档零值为
  15s/15s/9，抗 NAT 老化有利，本轮不改。
- 断流实测（本机 alpha-68ec4fa，仅回环端口，不启用 tun/tproxy/redir）：持续下载
  290 MB/300 s，每秒采样无 ≥3 s 停顿窗口；定频探测 33/33、DNS over UDP 110/110 成功；
  内核日志 0 条 warn/error。空闲复用 A/B 中经代理（60 s、95 s 正常，125 s 收到 FIN）比直连
  （60 s 即被关）撑得更久，属源站 keep-alive 策略，不是断流。
- 未暴露但可考虑的上游能力：`external-controller-cors`、`ntp`、`etag-support`、`global-ua`、
  `sub-rules`、`external-doh-server`、rule-provider 的 `header`/`path-in-bundle`/`inline`，
  以及规则类型中缺少的 16 种。`dns.listen-routing-mark` 与
  `external-controller-routing-mark` 继续按上一轮决策不暴露。
- 未验证：nftables 重载对已建立连接的影响、tproxy/conntrack UDP 老化、TUN 栈真机行为，
  以及修复后 TUN 预检的真机拦截效果。
- 本轮对应包版本统一更新为 `2026.9.1`，两个包的 release 保持 1。

## 2026-08-17：Nikki

- 上游：`nikkinikki-org/OpenWrt-nikki`
- 旧参考：`388f34e`
- 已审计至：`3799926`
- 范围：`388f34e..3799926`（5 个提交）

审计结果：

- `3799926 fix: redundant cron task in edge cases`
  - 仅在文件中发现旧任务时清除 `#mihomox` Cron，并确保删除任务后重启 Cron；停止时
    没有 MihomoX 任务则不做无意义重启。
  - 决策：按 MihomoX 的定时重启、日志清理和 China IP 更新范围移植，并补静态回归测试。
- `2221830 fix: allow read/write to the target of log file symbolic link`
  - OpenWrt 的 `/var/log` 最终指向 `/tmp/log`，LuCI 文件读取会校验解析后的目标路径。
  - 决策：为 `/tmp/log/mihomox/*.log` 增加读写 ACL，保留原 `/var/log` 路径，并补 ACL 测试。
- `8aaa68c`、`6beb04c` 更新 Alpha 内核至 `3cac869`、`ac017cd`。
  - MihomoX 通过官方 Release 资产独立解析最新 Alpha；当前设备和构建链已使用 `ac017cd`。
  - 决策：无需移植独立 `mihomo-alpha` 包版本。
- `c7cee04` 更新稳定内核至 `v1.19.30`。
  - MihomoX 不交付独立 `mihomo-meta` 包。
  - 决策：无需移植。

本轮只移植 Cron 生命周期和日志真实路径 ACL，不合并 Nikki 提交或目录。

## 2026-08-30：Mihomo Alpha 与 Zashboard

- Mihomo：官方 `Alpha` 最新提交为 `65287f0e0f3f8e5aaa1e95ded15a80235ecb8c04`（2026-08-29），稳定版为 `v1.19.30`（2026-08-16）。核心下载脚本已能动态解析并校验最新 Alpha 资产。
- API：REST/WS 端点、Bearer 认证、`/storage`、`/rules/disable`、`/configs` 和 `/upgrade/ui` 与 MihomoX/Zashboard 调用保持兼容。
- 适配：补充 TLS 证书对校验、Fake-IP Rule 模式、DNS policy 依赖、UI 路径/名称和域名通配符校验；启动时提示已移除的旧字段。
- Zashboard：默认改为 `releases/latest/download/dist.zip`，构建时解析发布位置并动态获取 SHA256；不再固定旧版本标签。
- 实测 latest 为 `v3.24.0`，`dist.zip` SHA256 为 `5ba15d3388adf0483929970663053871c530312224dd6d13bdf396a7f517697b`；该值仅记录审计证据，不写回默认 Makefile，避免固定版本。
- 默认 GeoData loader 调整为 `memconservative`，与当前核心默认值一致。
- `external-controller-routing-mark` 和 `dns.listen-routing-mark` 属于可选能力，本轮未暴露到 UCI/LuCI；不影响现有面板和配置兼容。
- 本轮对应包版本统一更新为 `2026.8.30`，两个包的 release 重置为 1。

本轮未发现需要移植的 Mihomo API 破坏性变更。

## 2026-08-24：Clashoo（最终审计与移植）

- 上游：`kenzok8/openwrt-clashoo`
- 已审计至：`a93f16f`
- 范围：`53f0766..a93f16f`（17 个提交）

审计结果：

- `062cbf7 fix acl catch-all ordering and log date offset`
  - LAN ACL catch-all 规则排到设备规则之后；日志日期字段偏移修正。
  - 决策：移植 catch-all 排序到 `hijack.ut`。MihomoX 无对应 log_format.awk。
- `1126a25 Skip local domains in injected sniffer`
  - Sniffer skip-domain 加 `+.lan`/`+.local`，防止嗅探覆盖局域网域名真实 IP。
  - 决策：修改默认值并补迁移脚本，为已有安装自动追加。
- `ef9b20f Fix local fake-IP filtering`
  - fake-ip-filter 从 `*.lan` 改为 `+.lan`/`+.local` 并加迁移。
  - MihomoX 默认值已是 `+.lan`/`+.local`。
  - 决策：无需移植。
- `ce1cb5b Guarantee China direct rule and skip needless firewall reload (#41)`
  - 内容比较跳过防火墙重载、锁恢复已在 MihomoX 实现。
  - 决策：无需移植。
- 其余内核 bump ×8、规则数据刷新 ×1、Feed 同步修复、opkg 兼容修复、China bypass
  回归修复不在移植边界或已有独立实现。

本轮从 Clashoo 移植两项行为后移除该参考源。

> **注意**：Clashoo 参考源已于 2026-08-24 移除，以下为历史审计记录。

## 2026-08-12：Clashoo

- 上游：`kenzok8/openwrt-clashoo`
- 旧参考：`95de5e2`
- 已审计至：`53f0766`
- 范围：`95de5e2..53f0766`（40 个提交）

审计结果：

- `b2d5fb2 Make IPv6 usable in fake-ip mode`
  - 确认 Fake-IP 开启 IPv6 时需要显式 IPv6 地址池及对应防火墙处理。
  - 决策：只移植 MihomoX 相关的 IPv6 Fake-IP 默认值与回归测试，不复制 Clashoo 的
    sing-box 归一化、页面或整套防火墙实现。
- `ce1cb5b Guarantee China direct rule and skip needless firewall reload (#41)`
  - 内容未变化时跳过 nft set 刷新适用于 MihomoX 的 China IP 更新脚本。
  - 决策：只移植内容比较和失效锁恢复，不移植 Clashoo 的诊断工具及 China bypass 架构。
- 其余内核版本、规则数据刷新、面板、APK 组件更新、访问探测和 LuCI 变化不在当前
  Clashoo 参考边界，或 MihomoX 已有独立实现；无需移植。

本轮仅按上述两个提交移植相关行为，不合并参考仓库提交或目录。

## 2026-08-05：Nikki

- 上游：`nikkinikki-org/OpenWrt-nikki`
- 旧参考：`34a0367`
- 已审计至：`388f34e`
- 范围：`34a0367..388f34e`

审计结果：

- `388f34e fix(rpcd): use TLS listen address for API requests when configured (#884)`
  - Nikki 修正了启用 TLS API 监听时仍使用普通监听地址的问题。
  - MihomoX 的 `core_api_request()` 已优先选择 `external-controller-tls`，并根据所选
    地址构造控制器 URL，现补充回归测试固定该行为。
  - 决策：等价行为已存在，移植测试与审计记录。

## 2026-07-29：Nikki

- 上游：`nikkinikki-org/OpenWrt-nikki`
- 版本描述：`v1.26.1-9-g34a0367`
- 旧参考：`cce63f8`
- 已审计至：`34a0367`
- 范围：`cce63f8..34a0367`

审计结果：

- `f06b6b4 fix: mojibake when saving a large file`
  - Nikki 对分块写入启用流式 `TextDecoder`。
  - MihomoX 已在 `tools/mihomox.js` 使用等价的 `stream: !finalChunk`，并在
    `tests/test_luci_writefile.js` 覆盖多字节字符跨块场景。
  - 决策：无需移植。
- `34a0367 docs: Update README`
  - Nikki 删除中英文 README 中的服务推荐内容。
  - MihomoX 从未包含该内容。
  - 决策：无需移植。

## 2026-07-29：Clashoo

- 上游：`kenzok8/openwrt-clashoo`
- 版本：`v2026.07.28` / `95de5e2`
- 旧参考：`8040bce`
- 已审计至：`95de5e2`
- 范围：`8040bce..95de5e2`

该范围共 9 个提交：5 次 Alpha 内核版本更新、1 次规则数据刷新，以及分组 LAN
访问控制、订阅更新加固和访问控制布局修复。

审计结果：

- 内核版本更新：Clashoo 固定源码版本，MihomoX 解析 Release 资产并独立校验；无需移植。
- 规则数据刷新：两项目的数据格式和交付链不同；无需移植。
- LAN 访问控制和页面布局：不属于 Clashoo 的内核更新参考范围，MihomoX 继续沿用
  Nikki 架构；无需移植。
- 订阅更新加固：MihomoX 已支持每个订阅独立 `user_agent`；Clashoo 更细的 curl
  错误分类尚未移植，但不属于当前 Clashoo 参考边界。

本轮结论：无需移植源码。

> **注意**：Momo 参考源已于 2026-08-24 移除，以下为历史审计记录。

## 2026-07-29：Momo

- 上游：`nikkinikki-org/OpenWrt-momo`
- 已审计至：`6fb94df`
- 定位：基于 sing-box 的同组织兄弟项目，不是 MihomoX 直接上游。

可按需对照 UCI/procd、firewall4、策略路由、DNS 劫持、访问控制和通用 LuCI/RPC
模式。sing-box JSON、inbound、命令行、mixin 和 API 字段不得直接移植。

本轮只建立参考基线，没有需要移植的变更。

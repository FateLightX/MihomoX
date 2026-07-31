# MihomoX 移植与架构边界

本文只记录长期有效的架构、兼容和验收边界。开发操作看 `AGENTS.md`，参考仓库的版本
和逐次结论看 `docs/upstream.md`。

## 1. 项目边界

MihomoX 是单 Mihomo 内核的 OpenWrt 透明代理服务：

- 主包：`mihomox`
- LuCI 包：`luci-app-mihomox`
- 内核：`/etc/mihomox/bin/mihomo`
- 支持 OpenWrt 23.05、24.10、25.12 和 SNAPSHOT
- 支持 Redirect、TPROXY、TUN 及 IPv4/IPv6
- 编译期打包内核、GeoData 和 Zashboard
- 运行时只替换自带内核，不调用 `opkg` 或 `apk` 更新内核

明确不做：

- 生成独立 `mihomo-meta`、`mihomo-alpha`、Mihomo 或 sing-box 核心包
- 多内核并存、Smart、自动定时更新或在线历史版本选择
- 回退到 `/usr/bin/mihomo`
- 从参考仓库批量复制或整目录覆盖

## 2. 参考来源

### Nikki

主要功能基础，包括 UCI、procd、firewall4、策略路由、DNS 劫持、访问控制、配置混入、
订阅及 LuCI/RPC 结构。MihomoX 不移植 Nikki 的独立核心软件包。

### Clashoo

只参考内核架构识别、Release 资产下载、SHA256、原子替换、回滚和按运行状态重启。
其多内核、规则数据、DNS、ACL 和页面布局不属于参考范围。

### Momo

只对照通用 OpenWrt、firewall4、策略路由和 LuCI/RPC 模式。sing-box JSON、inbound、
命令行和配置字段不得直接移植。

## 3. 配置和运行链

```text
/etc/config/mihomox
  -> /etc/init.d/mihomox
  -> /etc/mihomox/ucode/mixin.uc
  -> /etc/mihomox/run/config.yaml
  -> /etc/mihomox/bin/mihomo
```

防火墙配置由 `hijack.ut` 生成并引用随包安装的 nftables 数据。LuCI 通过
`luci.mihomox` RPC 读取状态、更新订阅、编辑允许路径内的文件和执行网络检测。

默认值以 `mihomox/files/mihomox.conf` 为准。LuCI 默认显示、UCI 默认值和生成后的
Mihomo YAML 必须保持一致；修改字段时应沿完整链路验证。

## 4. 编译期交付

`mihomox/Makefile` 的准备阶段依次执行：

1. 下载固定 SHA256 的 Mihomo 源码并应用 `mihomox/patches/`。
2. `fetch_geodata.sh`：准备 GeoSite、Country.mmdb、GeoIP.dat 和 ASN.mmdb。
3. `fetch_zashboard.sh`：准备离线面板。

源码和资源缓存在 OpenWrt `DL_DIR`。内核由 OpenWrt Go 工具链按目标架构构建，
源码版本、归档 SHA256 和补丁必须固定；未知架构由 `GO_ARCH_DEPENDS` 拒绝。

## 5. 运行时内核更新

LuCI 和 `/etc/init.d/mihomox update_core` 最终都调用
`/etc/mihomox/scripts/update_core.sh`：

1. 建立带 PID 的互斥锁并清理失效锁。
2. 解析通道、架构、镜像或自定义 URL。
3. 下载并校验 SHA256、压缩格式、架构、可执行版本和 `provider-discard` 能力。
4. 在同一文件系统备份并原子替换内核和元数据。
5. 新内核验证失败时回滚。
6. 仅当服务更新前正在运行时重启。
7. 写入状态并清理临时文件和锁。

自定义 URL 必须是 HTTP(S)，且必须同时提供 64 位 SHA256。

## 6. Provider 丢弃模式

Provider 策略保存在 `/etc/mihomox/provider-discard.json`，不写入用户 YAML 或 UCI，
避免触发服务 reload。页面只管理当前配置已经加载的 HTTP/File Proxy Provider，不创建
第二个订阅，也不修改 Provider 的 URL、类型或 `interval`。

内核保持两份逻辑视图：

- 完整候选列表：保存本次 Provider 全量更新解析出的所有节点，供后续重新检测。
- 已发布列表：通过 `baseProvider.setProxies()` 提供给引用该 Provider 的策略组。

更新顺序固定为：

1. Provider 按原 `interval` 或手动请求获取并解析完整候选列表。
2. 已发布的上一版列表继续承载流量。
3. 按全局单 Provider、Provider 内有限并发检测完整候选列表。
4. 至少一个候选通过时，原子发布本轮有效列表。
5. 全部失败且已有上一版时保留上一版；首次加载无上一版时发布完整候选列表，避免空组。

内容未变化的订阅也必须重新检测，使上个周期丢弃的节点可以恢复。关闭丢弃模式时立即
发布当前完整候选列表。更新和发布过程禁止发送 HUP、重载完整配置、重启核心或调用连接
关闭 API；已有连接保持原出站链，新连接使用新发布列表。

内核能力通过 `/version` 的 `features` 数组声明，当前接口为：

```text
GET   /providers/proxies/{name}/discard-status
PATCH /providers/proxies/{name}/discard-policy
POST  /providers/proxies/{name}/discard-update
```

策略接口同步应用运行时设置；更新接口返回 `202` 后异步执行。状态至少区分 `testing`、
`active`、`retained`、`fallback` 和 `disabled`，并报告总数、已检测、已发布/保留数和本轮
丢弃数。LuCI RPC 对 JSON 请求必须显式发送 `Content-Type: application/json`。

## 7. 持久化和迁移

首次安装可复制 Nikki 的 UCI、profiles、subscriptions 和 mixin，但不得修改或启用
Nikki，并保持 MihomoX 默认禁用，避免服务冲突。

需要跨 sysupgrade 保留：

```text
/etc/config/mihomox
/etc/mihomox/profiles/
/etc/mihomox/subscriptions/
/etc/mihomox/mixin.yaml
/etc/mihomox/provider-discard.json
/etc/mihomox/bin/
/etc/mihomox/run/providers/rule/
/etc/mihomox/run/providers/proxy/
```

二进制 conffile 在 `opkg` 和 `apk` 下的升级行为必须分别真机验证。

## 8. 兼容与安全约束

- OpenWrt 23.05 是 API 和依赖兼容下限。
- rpcd ucode 外部命令参数必须引用；兼容字符串形式的布尔值和数字。
- RPC 文件写入只允许明确路径，禁止目录穿越，单文件上限 16 MiB。
- 长任务必须有限时、错误状态和 UI 恢复路径，不能无限占用 ubus。
- 网络测试只能访问代码内固定目标，不接受用户传入 URL、命令或 STUN 地址。
- 分块文本使用流式 `TextDecoder`，避免 UTF-8 跨块损坏。
- ACL 只开放页面实际需要的方法和文件范围。

## 9. 验收

基础检查：

```sh
git diff --check
./tests/run.sh
```

发布前还需验证：

- OpenWrt SDK 能交叉编译 `mihomox` 和 `luci-app-mihomox`。
- 首次启动、Redirect/TPROXY/TUN、IPv4/IPv6 和防火墙规则正常。
- LuCI 菜单、RPC、编辑器、日志和网络测试在真机工作。
- 网络失败或 RPC 缺失时页面会超时恢复，不永久显示加载状态。
- Provider 首次全失败不会发布空组，已有版本后全失败会保留上一版。
- Provider 更新过程中长连接 ID 保持不变，传输内容完整且不调用完整配置 reload。
- 内核更新失败会回滚，停止状态更新后仍保持停止。
- 包升级和 sysupgrade 后配置、订阅、规则及用户内核按预期保留。
- Nikki 与 MihomoX 同时安装时不会默认同时启用。

本地测试通过不等于真机、浏览器、网络条件或所有架构已经验证。

# MihomoX 移植与架构边界

本文只记录长期有效的架构、兼容和验收边界。开发操作看 `AGENTS.md` 和
`docs/ai-development.md`，参考仓库的版本和逐次结论看 `docs/upstream.md`。

## 1. 项目边界

MihomoX 是单 Mihomo 内核的 OpenWrt 透明代理服务：

- 主包：`mihomox`
- LuCI 包：`luci-app-mihomox`
- 内核：`/etc/mihomox/bin/mihomo`
- 源码/API 兼容 OpenWrt 23.05、24.10、25.12 和 SNAPSHOT
- 公开安装脚本和 Feed 只支持 OpenWrt 25.12 x86_64；其他目标需自行构建验证
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

新安装默认启用透明代理，TCP 和 UDP 均使用 TPROXY，TUN 默认关闭；路由器自身与 LAN
设备代理默认启用。该文件只定义新安装默认值，升级不得覆盖已有 UCI 选择。

### 网络诊断链

LuCI `network.js` 按行调用 `luci.mihomox.network_test`，rpcd 实现在
`root/usr/share/rpcd/ucode/luci.mihomox`。请求必须逐项执行并绕过 RPC 批处理，设备端和
浏览器端都必须有超时。

- 国内站点检测不显式指定代理；国际站点检测显式使用 Mihomo 本地 Mixed/HTTP 代理。
- IPv4 国内通过绕过 cgroup 直连 `https://v4.ipgg.cn`。
- IPv6 国内通过绕过 cgroup 和固定 DoH 直连 `https://v6.ipgg.cn`。
- IPv4 国外经 Mihomo 本地代理访问 `https://ifconfig.co` 和
  `https://ifconfig.co/country`，分别返回出口 IPv4 和国家。
- 不提供“IPv6 国外”检测；它只能反映代理节点访问 IPv6-only 目标的能力，不能代表
  路由器或 LAN 的原生 IPv6 状态。
- NAT 检测使用独立辅助程序、固定 STUN 目标和 `network_test_fw_mark`，不得落入透明代理。

`curl -4/-6` 在显式 HTTP 代理场景主要约束客户端到本地代理的连接族，不能单独证明
代理节点到目标使用相同地址族。网络检测的 UI 名称和文档不得扩大其语义。

## 4. 编译期交付

GitHub Actions 使用 `x86_64-openwrt-25.12` SDK，`mihomox/Makefile` 的准备阶段依次执行：

1. `fetch_mihomo.sh`：解析并下载官方最新 Alpha 二进制，验证发布资产 SHA256、gzip
   格式和 ELF 架构。
2. `fetch_geodata.sh`：从带提交版本的 URL 准备 GeoSite、Country.mmdb、GeoIP.dat 和
   ASN.mmdb，并强制校验 Makefile 中的 SHA256。
3. `fetch_zashboard.sh`：从固定发布标签准备离线面板，并强制校验 SHA256。

内核和资源缓存在 OpenWrt `DL_DIR`。Mihomo 使用官方预编译二进制，不经过 OpenWrt Go
工具链；工具链只编译 MihomoX 的 STUN C 辅助程序。解析、下载或校验失败必须终止构建，
未知架构由 `fetch_mihomo.sh` 拒绝。

设备运行时依赖使用 `EXTRA_DEPENDS` / `LUCI_EXTRA_DEPENDS` 写入包元数据，不作为当前
Feed 的源码构建依赖；安装阶段仍由目标 OpenWrt 软件源解析这些依赖。

## 5. 运行时内核更新

LuCI 和 `/etc/init.d/mihomox update_core` 最终都调用
`/etc/mihomox/scripts/update_core.sh`：

1. 建立带 PID 的互斥锁并清理失效锁。
2. 解析通道、架构、镜像或自定义 URL。
3. 下载并校验 SHA256、压缩格式、架构和可执行版本。
4. 在同一文件系统备份并原子替换内核和元数据。
5. 新内核验证失败时回滚。
6. 仅当服务更新前正在运行时重启。
7. 写入状态并清理临时文件和锁。

自定义 URL 必须是 HTTP(S)，且必须同时提供 64 位 SHA256。

## 6. 持久化和迁移

首次安装可复制 Nikki 的 UCI、profiles、subscriptions 和 mixin，但不得修改或启用
Nikki，并保持 MihomoX 默认禁用，避免服务冲突。

需要跨 sysupgrade 保留：

```text
/etc/config/mihomox
/etc/mihomox/profiles/
/etc/mihomox/subscriptions/
/etc/mihomox/mixin.yaml
/etc/mihomox/bin/
/etc/mihomox/run/providers/rule/
/etc/mihomox/run/providers/proxy/
```

二进制 conffile 在 `opkg` 和 `apk` 下的升级行为必须分别真机验证。

## 7. 兼容与安全约束

- OpenWrt 23.05 是源码/API 兼容下限。
- 公开产物只覆盖 OpenWrt 25.12 x86_64；扩展发布范围前需补对应 SDK 构建与验证。
- rpcd ucode 外部命令参数必须引用；兼容字符串形式的布尔值和数字。
- RPC 文件写入只允许明确路径，禁止目录穿越，单文件上限 16 MiB。
- 长任务必须有限时、错误状态和 UI 恢复路径，不能无限占用 ubus。
- reload/stop 只删除 MihomoX 实际安装的路由规则和路由，不 flush 可能共享的路由表。
- HTTPS Core API 默认校验证书；仅在最终配置明确提供本地证书和私钥时兼容自签证书。
- 订阅文件和对应 UCI 元数据必须在完整校验成功后一起切换，失败时保留上一份有效状态。
- 网络测试只能访问代码内固定目标，不接受用户传入 URL、命令或 STUN 地址。
- 分块文本使用流式 `TextDecoder`，避免 UTF-8 跨块损坏。
- ACL 只开放页面实际需要的方法和文件范围。

## 8. 验收

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
- 内核更新失败会回滚，停止状态更新后仍保持停止。
- 包升级和 sysupgrade 后配置、订阅、规则及用户内核按预期保留。
- Nikki 与 MihomoX 同时安装时不会默认同时启用。

本地测试通过不等于真机、浏览器、网络条件或所有架构已经验证。

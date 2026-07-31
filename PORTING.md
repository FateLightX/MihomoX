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

`mihomox/Makefile` 的准备阶段依次运行：

1. `fetch_mihomo.sh`：选择目标架构并下载内核。
2. `fetch_geodata.sh`：准备 GeoSite、Country.mmdb、GeoIP.dat 和 ASN.mmdb。
3. `fetch_zashboard.sh`：准备离线面板。

资源缓存在 OpenWrt `DL_DIR`。内核必须通过 SHA256、gzip/ELF、版本和目标架构校验；
未知架构必须让构建失败，不能默认使用 amd64。

| OpenWrt 架构 | Mihomo 资产 |
| --- | --- |
| `x86_64` | `linux-amd64-v1/v2/v3` |
| `i386_*` | `linux-386` |
| `aarch64_*` | `linux-arm64` |
| ARMv5/v6/v7 | 对应 `linux-armv*` |
| `mips*` / `mipsel*` | 对应 softfloat 资产 |
| `mips64*` / `mips64el*` | `linux-mips64*` |
| `riscv64_*` | `linux-riscv64` |
| `loongarch64_*` | `linux-loong64-abi2` |

关键构建参数：`MIHOMO_CHANNEL`、`MIHOMO_VERSION`、`MIHOMO_SHA256`、
`MIHOMO_AMD64_LEVEL`、`MIHOMO_MIRROR_PREFIX`。

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

- OpenWrt 23.05 是 API 和依赖兼容下限。
- rpcd ucode 外部命令参数必须引用；兼容字符串形式的布尔值和数字。
- RPC 文件写入只允许明确路径，禁止目录穿越，单文件上限 16 MiB。
- 长任务必须有限时、错误状态和 UI 恢复路径，不能无限占用 ubus。
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

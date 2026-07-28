# MihomoX 移植与架构设计

## 1. 当前状态

截至 2026-07-29，MihomoX 已完成：

- 项目、软件包、服务、UCI、RPC、LuCI 和运行目录改名
- 编译时下载并打包目标架构的 Mihomo 内核
- 编译时打包 GeoSite、GeoIP、ASN 数据和 Zashboard
- Release、`Prerelease-Alpha` 两个内核通道
- 运行时手动更新、SHA256 校验、原子替换和失败回滚
- Nikki 配置的一次性导入
- 配置文件、订阅、规则文件、日志和内核更新的 LuCI 管理
- 面向下载、架构、更新流程、LuCI 和 RPC/ACL 的本地自动测试

仍需按目标环境持续验证：OpenWrt SDK 实包编译、ImageBuilder 固件、不同架构实体
设备、`opkg`/`apk` 包升级以及 sysupgrade 后的二进制 conffile 行为。

## 2. 项目边界

MihomoX 是单 Mihomo 内核的 OpenWrt 透明代理服务：

- 项目名称：`MihomoX`
- OpenWrt 包名：`mihomox`
- LuCI 包名：`luci-app-mihomox`
- 内核路径：`/etc/mihomox/bin/mihomo`
- 不生成 `mihomo-meta`、`mihomo-alpha` 软件包
- 不依赖或提供独立的 `mihomo` 软件包
- 不通过 `opkg` 或 `apk` 更新运行时内核
- 不回退到 `/usr/bin/mihomo`

软件包携带自己的内核种子；设备上的手动更新仍替换同一路径下的文件。

## 3. 参考来源与继承范围

### 3.1 Nikki：主要功能基础

MihomoX 从 Nikki 保留并改名移植：

- UCI 配置和迁移结构
- procd 服务、计划重启和日志管理
- Redirect、TPROXY、TUN 及 IPv4/IPv6 路由
- nftables、firewall4、DNS 劫持和访问控制
- 配置混入、订阅、配置编辑和规则提供者管理
- LuCI 页面、RPC 和 ACL 的总体结构

不移植 Nikki 的 `mihomo-meta/`、`mihomo-alpha/` 源码编译包。MihomoX 在上述基础
上增加独立内核交付、离线资源、规则文件管理和兼容性/安全加固。

### 3.2 Clashoo：内核更新次级参考

仅参考以下设计思路：

- 设备架构识别
- GitHub Release 与资产匹配
- 镜像和自定义下载地址
- 下载、校验、备份、原子替换和失败回滚
- 仅在服务原本运行时重启

不自动同步 Clashoo 的源码编译与版本 bump、多内核、Smart、sing-box、ACL、DNS、
防火墙、订阅、LuCI 布局和规则数据。

### 3.3 Momo：同组织辅助参考

Momo 是基于 sing-box 的兄弟项目，不是 MihomoX 上游。仅在逐文件审计后参考通用的
OpenWrt 服务、firewall4、策略路由、DNS 劫持、访问控制及 LuCI/RPC 模式；不移植
sing-box JSON、inbound、命令行、mixin 或 API 字段。

具体参考版本和每轮迁移结论记录在 [参考源审计](docs/upstream.md)。

## 4. 目录和设备路径

源码主要目录：

```text
MihomoX/
├── mihomox/
│   ├── Makefile
│   ├── files/
│   │   ├── mihomox.conf
│   │   ├── mihomox.init
│   │   ├── mihomox.upgrade
│   │   ├── scripts/
│   │   ├── ucode/
│   │   └── nftables/
│   └── scripts/
│       ├── fetch_mihomo.sh
│       ├── fetch_geodata.sh
│       └── fetch_zashboard.sh
├── luci-app-mihomox/
├── tests/
└── docs/
```

设备路径：

```text
/etc/config/mihomox
/etc/init.d/mihomox
/etc/mihomox/bin/mihomo
/etc/mihomox/bin/mihomo.version
/etc/mihomox/profiles/
/etc/mihomox/subscriptions/
/etc/mihomox/run/
/var/log/mihomox/
/var/run/mihomox/
```

## 5. 编译时资源交付

`mihomox/Makefile` 的准备阶段依次执行：

1. `fetch_mihomo.sh`：解析通道和目标架构，下载并校验内核。
2. `fetch_geodata.sh`：准备 GeoSite、Country.mmdb、GeoIP.dat 和 ASN.mmdb。
3. `fetch_zashboard.sh`：准备离线管理面板。

资源缓存在 OpenWrt `DL_DIR`。内核下载必须通过可信 SHA256；未显式提供
`MIHOMO_SHA256` 时，从上游 checksum 或 Release 资产信息解析。gzip、ELF 和目标
架构校验失败会终止构建。

支持的主要构建参数：

| 参数 | 默认值 | 作用 |
| --- | --- | --- |
| `MIHOMO_CHANNEL` | `Prerelease-Alpha` | `release` 或 `Prerelease-Alpha` |
| `MIHOMO_VERSION` | 空 | 固定正式版 tag，例如 `v1.19.0` |
| `MIHOMO_SHA256` | 空 | 固定内核归档 SHA256 |
| `MIHOMO_AMD64_LEVEL` | `v1` | amd64 的 v1/v2/v3 级别 |
| `MIHOMO_MIRROR_PREFIX` | 空 | GitHub 下载镜像前缀 |

未知架构必须失败，不允许默认下载 amd64。

| OpenWrt/设备架构 | Mihomo Release 资产 |
| --- | --- |
| `x86_64` | `linux-amd64-v1/v2/v3` |
| `i386_*` | `linux-386` |
| `aarch64_*` | `linux-arm64` |
| ARMv7 / ARMv6 / ARMv5 | `linux-armv7/armv6/armv5` |
| `mipsel_*` / `mips_*` | `linux-mipsle-softfloat` / `linux-mips-softfloat` |
| `mips64el_*` / `mips64_*` | `linux-mips64le` / `linux-mips64` |
| `riscv64_*` | `linux-riscv64` |
| `loongarch64_*` | `linux-loong64-abi2` |

版本元数据写入 `/etc/mihomox/bin/mihomo.version`，包括版本、通道、Release、架构、
资产名、下载源和 SHA256。

## 6. 运行时内核更新

入口和调用链：

```text
LuCI 更新内核按钮
  -> luci.mihomox.update_core
  -> /etc/mihomox/scripts/update_core.sh

/etc/init.d/mihomox update_core
  -> /etc/mihomox/scripts/update_core.sh
```

更新流程：

1. 在 `/var/run/mihomox/core-update.lock` 建立带 PID 的互斥锁，并清理失效锁。
2. 读取通道、架构、镜像、自定义 URL 和自定义 SHA256。
3. 自动识别设备架构；amd64 同时检测 v1/v2/v3 能力。
4. 解析 Release 或 `Prerelease-Alpha` 资产。
5. 下载到临时目录并校验可信 SHA256、gzip 和可执行版本。
6. 若版本与架构均未变化则直接结束。
7. 在同目录准备新内核和元数据，并备份现有文件。
8. 原子替换后再次执行版本检查，失败则恢复备份。
9. 写入 `/var/run/mihomox/core-update.status` 和更新日志。
10. 仅当服务更新前处于运行状态时执行重启。
11. 清理临时文件、pending 标记和锁。

自定义内核 URL 必须同时提供 64 位 SHA256。运行进度和错误状态不写入 UCI；LuCI
只在用户发起更新后的当前页面会话中显示按钮旁状态。

## 7. UCI、LuCI 与 RPC

核心配置：

```uci
config core 'core'
	option channel 'Prerelease-Alpha'
	option architecture 'auto'
	option mirror_prefix ''
	option download_url ''
	option download_sha256 ''
	option redirect_listener_name 'redir-in'
	option tproxy_listener_name 'tproxy-in'
	option tun_listener_name 'tun-in'
```

LuCI 位于 `服务 → MihomoX`，包含插件配置、配置文件、混入配置、代理配置、编辑器
和日志六个页面。核心更新区域支持：

- Release / `Prerelease-Alpha` 通道
- 已安装和检测到的架构
- 自动或手动架构选择
- GitHub 镜像前缀
- 自定义内核 URL 与 SHA256
- 异步更新按钮、更新时间和当前会话状态

主要 RPC 包括 `version`、`profile`、`update_subscription`、`core_status`、`update_core`、
`log`、`write_file`、`api`、`get_identifiers` 和 `debug`。下载由后台更新脚本执行，
避免长时间占用 ubus 请求。

## 8. 迁移和持久化

首次安装且 `/etc/config/nikki` 存在时：

1. 复制 Nikki 的配置、profiles、subscriptions 和 mixin。
2. 把服务名、路由 cgroup、dummy 设备和 TUN 设备改为 MihomoX 命名。
3. 初始化 MihomoX 独有的内核更新字段。
4. 删除首次初始化标记，并强制保持 MihomoX 禁用。
5. 不复制 Nikki 的运行目录和日志，不修改或停用 Nikki。

sysupgrade 保留范围：

```text
/etc/mihomox/profiles/
/etc/mihomox/subscriptions/
/etc/mihomox/mixin.yaml
/etc/mihomox/bin/
/etc/mihomox/run/providers/rule/
/etc/mihomox/run/providers/proxy/
```

`/etc/config/mihomox`、mixin、内核及内核版本文件同时属于软件包 conffile。需要在
目标 OpenWrt 上分别确认 `opkg` 与 `apk` 对二进制 conffile 的升级行为。

## 9. 安全与兼容性约束

- 自定义核心地址必须使用 HTTP(S) 且必须提供 SHA256。
- RPC 文件写入限制在明确的配置、规则和日志路径，单文件上限 16 MiB。
- 分块写入使用流式 `TextDecoder`，避免多字节字符跨块时产生乱码。
- API 请求限制方法、路径和字段长度，并对传入 shell 的参数逐项引用。
- 兼容旧版 rpcd/ucode 对 `popen()` 参数、布尔值和数字参数的限制。
- 日志读取使用文件 API，避免 rpcd 沙箱无法执行外部命令导致空白日志。

## 10. 测试与验收

本地入口：

```sh
./tests/run.sh
```

测试范围包括 Shell 语法、架构映射、内核/规则数据/面板下载、内核更新与回滚、
LuCI 内核更新、编辑器、上传、UTF-8 分块写入以及 RPC/ACL 安全检查。

目标环境验收至少包括：

- 编译产物不存在 `mihomo-meta` 或 `mihomo-alpha` 包。
- `mihomox` 不依赖独立 Mihomo 包，且首次启动内核可执行。
- 运行时更新不改变已安装软件包集合。
- 更新失败时旧内核仍可启动；停止状态更新后仍保持停止。
- Nikki 与 MihomoX 同时安装时不会被默认同时启用。
- 包升级和 sysupgrade 后，配置、订阅、规则及用户更新的内核符合保留预期。

## 11. 明确不做

- 编译 Mihomo 源码或生成独立核心软件包
- Smart、sing-box、多内核并存和切换
- 自动定时更新内核
- 通过 `opkg` 或 `apk` 管理运行时内核
- 在线选择历史版本或自动降级
- 从参考仓库批量覆盖代码

参考仓库只用于逐提交、逐文件审计；任何迁移都必须符合本项目边界并记录决策。

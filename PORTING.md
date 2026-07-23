# MihomoX 移植设计

## 实现状态

截至 2026-07-24，项目改名、编译期二进制下载、运行时手动更新、UCI、RPC、LuCI 和本地自动测试已经完成。OpenWrt SDK 实包编译、ImageBuilder 固件和实体设备测试仍需在对应 Linux 构建环境执行。

## 1. 项目定位

MihomoX 基于 Nikki 二次开发，保留 Nikki 的 UCI、透明代理、配置混入、订阅和 LuCI 设计，重做 Mihomo 内核的交付与更新方式。

核心原则：

- 项目名称：`MihomoX`
- OpenWrt 包名：`mihomox`
- LuCI 包名：`luci-app-mihomox`
- 不编译 Mihomo 源码
- 不生成 `mihomo-meta`、`mihomo-alpha` 软件包
- `mihomox` 不依赖 OpenWrt 的 `mihomo` 包
- 编译 `mihomox` 时下载目标架构的最新 Mihomo Stable 二进制，并作为资源装入包内
- 设备运行时可手动更新同一个二进制文件
- 内核下载和替换不调用 `opkg` 或 `apk`

## 2. 来源与范围

### Nikki 保留部分

- UCI 配置结构
- procd 服务管理
- 配置文件混入
- 订阅管理
- Redirect、TPROXY、TUN
- nftables、防火墙和路由逻辑
- LuCI 页面布局与 RPC 结构

### Clashoo 参考部分

只移植内核更新机制：

- 设备架构识别
- GitHub Release 查询
- Release 资产匹配
- 镜像地址和自定义地址
- 临时下载、校验、备份、原子替换和失败回滚
- 仅在当前服务运行时重启

不移植 Clashoo 的多内核 `dcore`、Smart、sing-box 和内核切换设计。

## 3. 目标目录

```text
MihomoX/
├── mihomox/
│   ├── Makefile
│   ├── files/
│   │   ├── mihomox.conf
│   │   ├── mihomox.init
│   │   ├── mihomox.upgrade
│   │   ├── scripts/
│   │   │   ├── include.sh
│   │   │   └── update_core.sh
│   │   └── ...
│   └── scripts/
│       └── fetch_mihomo.sh
├── luci-app-mihomox/
├── README.md
└── README.zh.md
```

设备文件路径：

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

服务只调用：

```sh
PROG="/etc/mihomox/bin/mihomo"
```

不得回退到 `/usr/bin/mihomo`，避免与其他插件或软件包产生所有权冲突。

## 4. 软件包调整

删除：

```text
mihomo-meta/
mihomo-alpha/
```

从 `mihomox/Makefile` 的 `DEPENDS` 中删除：

```text
+mihomo
```

保留 Mihomo 运行依赖：

```text
ca-bundle
curl
coreutils-nohup
yq
firewall4
ip-full
kmod-inet-diag
kmod-nft-socket
kmod-nft-tproxy
kmod-tun
kmod-dummy
```

`mihomox` 包负责安装自身携带的 Mihomo 二进制：

```make
define Package/mihomox/install
	$(INSTALL_DIR) $(1)/etc/mihomox/bin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/mihomo $(1)/etc/mihomox/bin/mihomo
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/mihomo.version \
		$(1)/etc/mihomox/bin/mihomo.version
endef
```

`luci-app-mihomox` 只依赖 `+mihomox`。

## 5. 编译期内核下载

### 5.1 定义

“最新”在第一阶段固定表示 MetaCubeX/mihomo 的最新 Stable Release，不包含 Prerelease Alpha。

编译流程：

```text
编译 mihomox
  -> 读取 OpenWrt 目标架构
  -> 查询 MetaCubeX/mihomo latest release
  -> 匹配目标架构的 .gz 资产
  -> 下载到 OpenWrt DL_DIR 缓存
  -> 解压到 PKG_BUILD_DIR/mihomo
  -> 校验归档、ELF 架构和文件大小
  -> 写入 mihomo.version
  -> 作为 mihomox 包资源安装
```

`fetch_mihomo.sh` 接收以下参数：

```text
OpenWrt 目标架构
OpenWrt target/subtarget 或 ARCH_PACKAGES
DL_DIR
PKG_BUILD_DIR
可选 GitHub 镜像前缀
```

输出：

```text
$(PKG_BUILD_DIR)/mihomo
$(PKG_BUILD_DIR)/mihomo.version
```

版本文件至少记录：

```text
version=vX.Y.Z
asset=mihomo-linux-arm64-vX.Y.Z.gz
source=https://github.com/MetaCubeX/mihomo/...
sha256=<实际下载文件哈希>
```

### 5.2 架构映射

| OpenWrt 架构 | Mihomo Release 架构 |
| --- | --- |
| `x86_64` | `linux-amd64-v1` |
| `i386_*` | `linux-386` |
| `aarch64_*` | `linux-arm64` |
| `arm_cortex-a5*`、`arm_cortex-a7*`、`arm_cortex-a8*`、`arm_cortex-a9*` | `linux-armv7` |
| ARMv6 target | `linux-armv6` |
| ARMv5 target | `linux-armv5` |
| `mipsel_*` | `linux-mipsle-softfloat` |
| `mips_*` | `linux-mips-softfloat` |
| `mips64el_*` | `linux-mips64le` |
| `mips64_*` | `linux-mips64` |
| `riscv64_*` | `linux-riscv64` |
| `loongarch64_*` | `linux-loong64-abi2` |

未知架构必须终止编译，不允许默认下载 amd64。

### 5.3 编译约束

- 下载失败、资产不匹配或解压失败时，`mihomox` 编译必须失败。
- 交叉编译主机不能直接执行目标架构的 `mihomo -v`。
- 编译期使用 `gzip -t`、SHA256、`readelf` 或目标工具链校验 ELF。
- 设备首次启动时再执行 `mihomo -v` 做最终运行校验。
- 下载文件放入 `DL_DIR`，避免同一版本重复下载。
- 每次查询 `latest` 会降低构建可复现性，这是 MihomoX 的明确设计选择。
- 构建日志必须输出最终解析到的 tag、资产名和 SHA256。

## 6. 运行时内核更新

入口：

```sh
/etc/init.d/mihomox update_core
```

调用链：

```text
LuCI 更新按钮
  -> luci.mihomox RPC
  -> /etc/init.d/mihomox update_core
  -> /etc/mihomox/scripts/update_core.sh
```

更新流程：

1. 创建 `/var/run/mihomox/core_update.lock`，拒绝并发更新。
2. 读取 UCI 内核通道、架构、镜像和自定义 URL。
3. 查询最新 Stable Release，并选择对应架构资产。
4. 下载到 `/tmp/mihomox-core-*.gz`。
5. 校验 gzip、文件大小并解压。
6. 对临时二进制执行 `mihomo -v`。
7. 比较新旧版本，相同则结束。
8. 备份当前内核为临时回滚文件。
9. 使用同目录 `mv` 原子替换 `/etc/mihomox/bin/mihomo`。
10. 再次执行版本检查；失败则恢复旧内核。
11. 更新 `mihomo.version`。
12. MihomoX 原本处于运行状态时重启服务，否则保持停止。
13. 清理临时文件和锁。

运行时更新不得执行：

```text
opkg install/upgrade/remove
apk add/upgrade/del
```

因此它不会创建独立的 `mihomo` 包记录，也不会改变 `opkg`/`apk` 中的软件包版本。二进制仍属于 `mihomox` 包的文件范围，重新安装或升级 `mihomox` 时可能被包内版本覆盖。

## 7. UCI 设计

保留 MihomoX 原有 `core` section，在其上增加内核下载配置：

```uci
config core 'core'
	option channel 'stable'
	option architecture 'auto'
	option mirror_prefix ''
	option download_url ''
	option redirect_listener_name 'redir-in'
	option tproxy_listener_name 'tproxy-in'
	option tun_listener_name 'tun-in'
```

字段含义：

| 字段 | 含义 |
| --- | --- |
| `channel` | 第一阶段只支持 `stable` |
| `architecture` | 默认 `auto`，允许手动覆盖 |
| `mirror_prefix` | GitHub 下载镜像前缀 |
| `download_url` | 自定义 `.gz` 下载地址，设置后优先使用 |

版本、下载进度和错误不写入 UCI，分别从版本文件、锁文件和更新日志读取，避免频繁提交 flash。

## 8. LuCI 与 RPC

新增 RPC：

```text
core_status
update_core
```

`core_status` 返回：

```json
{
  "installed": "vX.Y.Z",
  "latest": "vX.Y.Z",
  "architecture": "arm64",
  "updating": false,
  "error": ""
}
```

LuCI 应提供：

- 当前版本
- 最新版本
- 架构自动识别及手动覆盖
- GitHub 镜像前缀
- 自定义下载 URL
- “更新内核”按钮
- 更新日志

RPC 必须异步启动下载，避免 ubus 请求因下载超时而断开。

## 9. 配置和数据迁移

首次安装 MihomoX 时，如果 Nikki 配置存在且 MihomoX 仍是首次初始化状态：

1. 复制 `/etc/config/nikki` 为 `/etc/config/mihomox`。
2. 复制 profiles、subscriptions 和 mixin 文件。
3. 不复制 Nikki 的运行目录和日志。
4. 不删除、停用或修改 Nikki。
5. MihomoX 默认保持禁用，避免防火墙、端口和 TUN 设备冲突。

名称映射：

| Nikki | MihomoX |
| --- | --- |
| `nikki` | `mihomox` |
| `luci-app-nikki` | `luci-app-mihomox` |
| `/etc/config/nikki` | `/etc/config/mihomox` |
| `/etc/nikki` | `/etc/mihomox` |
| `/var/log/nikki` | `/var/log/mihomox` |
| `/var/run/nikki` | `/var/run/mihomox` |
| `luci.nikki` | `luci.mihomox` |
| firewall、nftables、cgroup、TUN 名称中的 `nikki` | `mihomox` |

## 10. 升级与包管理边界

`/lib/upgrade/keep.d/mihomox` 至少保留：

```text
/etc/mihomox/bin/
/etc/mihomox/profiles/
/etc/mihomox/subscriptions/
/etc/mihomox/mixin.yaml
```

同时把 `/etc/mihomox/bin/mihomo` 和版本文件列入 `Package/mihomox/conffiles`，目标是：

- sysupgrade 后保留手动更新的内核
- 普通包升级尽量保留用户更新的内核
- 全新固件仍自带编译时下载的最新内核

需要分别验证 OpenWrt 24.10 的 `opkg` 和新版本 OpenWrt 的 `apk` 对二进制 conffile 的处理行为。若两者行为不一致，后续改为“包内种子内核 + 首次启动复制”的方案。

## 11. 实施顺序

### 阶段一：项目改名

- 重命名软件包、服务、UCI、RPC 和目录
- 全量检查不属于迁移兼容逻辑的 `nikki` 标识
- 保持现有功能可运行

### 阶段二：编译期资源内核

- 删除 `mihomo-meta`、`mihomo-alpha`
- 删除 `+mihomo` 依赖
- 实现 `fetch_mihomo.sh`
- 将内核安装到 `/etc/mihomox/bin/mihomo`
- 修改 procd 启动路径和版本查询路径

### 阶段三：运行时手动更新

- 实现 `update_core.sh`
- 增加 init extra command
- 增加 RPC、ACL、LuCI 控件和日志
- 完成校验、原子替换、重启和回滚

### 阶段四：迁移和兼容测试

- Nikki 配置和数据迁移
- `opkg`、`apk` 包升级测试
- sysupgrade 保留测试
- 全架构资产匹配测试

## 12. 验收标准

- 编译日志中没有 Go 编译 Mihomo 的步骤。
- 编译产物中不存在 `mihomo-meta` 或 `mihomo-alpha` 包。
- `mihomox` 包不依赖或提供 `mihomo` 虚拟包。
- 固件首次启动时 `/etc/mihomox/bin/mihomo` 可执行。
- `mihomo -v` 显示编译时解析到的最新 Stable 版本。
- 运行时更新不改变 `opkg list-installed` 或 `apk list -I` 的包集合。
- 更新失败时旧内核仍可启动。
- 非运行状态更新后服务保持停止。
- sysupgrade 后配置、订阅、配置文件和手动更新的内核仍存在。
- Nikki 与 MihomoX 同时安装时默认不会同时启用。

## 13. 第一阶段不做

- Mihomo Alpha 通道
- 自动定时更新内核
- 多内核并存和切换
- sing-box、Smart 内核
- 通过 `opkg` 或 `apk` 单独管理 Mihomo
- 在线降级和历史版本选择

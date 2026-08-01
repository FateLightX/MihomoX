# MihomoX

MihomoX 是运行在 OpenWrt 上的 Mihomo 透明代理 LuCI 服务。项目以 Nikki 的
UCI、procd、防火墙、路由、配置混入和 LuCI 为功能基础，同时独立交付和更新
Mihomo 内核。

## 主要功能

- 支持 IPv4、IPv6 的 Redirect、TPROXY 和 TUN 透明代理
- 通过 LuCI 管理配置文件、订阅、混入配置、访问控制、规则、编辑器、面板和日志
- 编译时打包目标架构的 Mihomo 内核，不依赖独立的 `mihomo-meta` 或
  `mihomo-alpha` 软件包
- 基于固定 Mihomo Alpha 源码构建官方兼容内核
- 运行时内核更新包含可信 SHA256、原子替换及失败回滚
- 编译时打包 GeoSite、GeoIP、ASN 数据和 Zashboard
- 节点管理可在 Provider 全量更新后丢弃失效节点，不关闭已有连接
- 首次安装时可导入现有 Nikki 配置，但不会修改或启用 Nikki

## 系统要求

- OpenWrt 23.05、24.10、25.12 或 SNAPSHOT
- `firewall4`
- OpenWrt Go 工具链支持的目标架构

OpenWrt 23.05 软件源使用该系列最后一个正式版 SDK 23.05.5 构建。

## 安装

```sh
wget -qO- https://raw.githubusercontent.com/FateLightX/MihomoX/main/install.sh | sh
```

安装脚本同时支持使用 `opkg` 和 `apk` 的 OpenWrt。

## 编译

使用与目标固件匹配的 OpenWrt SDK：

```sh
make defconfig
make package/mihomox/compile V=s
make package/luci-app-mihomox/compile V=s
```

构建使用 `mihomox/Makefile` 固定的 Mihomo 源码版本。源码、规则数据和面板资源会缓存
在 OpenWrt `DL_DIR`，源码或资源校验不通过时构建直接失败。

## 使用

LuCI 页面位于 `服务 → MihomoX`：

- `插件配置`：服务、管理面板和内核更新
- `配置文件`：本地配置文件和订阅
- `节点管理`：配置文件内 Proxy Provider 的失效节点丢弃策略和运行状态
- `混入配置`：Mihomo 混入及 DNS 设置
- `代理配置`：透明代理和访问控制
- `网络测试`：核心、DNS、国内/国际连接、IPv4、IPv6 和 NAT 类型检测
- `编辑器`：配置文件、混入文件和规则提供者文件
- `日志`：插件、内核和调试日志

### Provider 失效节点丢弃

`服务 → MihomoX → 节点管理` 会读取当前配置中的 HTTP Proxy Provider。用户原 YAML
保持不变；MihomoX 在生成的运行配置中将其转换为同名本地 File Provider，并按原
`interval` 接管一次上游下载、检测和发布。

每个 Provider 可设置：

- 启用或关闭丢弃模式
- 测试地址
- 单节点超时（500–30000 ms）
- 失败重试（0–5 次）

页面还可设置统一延迟（默认开启）、最大延迟（默认 400 ms，0 表示不限制）和全局节点检测
并发（1–20），并提供“保存”“更新并检测”和“全部更新”。超过最大延迟的节点会按失败
重试设置再次检测，所有尝试都超过阈值后才会丢弃。
顶部“启用自动过滤”总开关控制定时检测及自动队列；关闭时仍可使用“更新并检测”或
“全部更新”手动执行一次。手动检测也不受单个 Provider 丢弃开关限制，当前发布版本和
已有连接不受影响。
设置直接保存到 `/etc/mihomox/provider-discard.json`，不会写 UCI、重载完整配置或重启
MihomoX。检测使用临时官方 Mihomo 核心和独立路由标记，绕过当前系统代理、Redirect、
TPROXY 与 TUN；临时核心使用独立的 IP DoH 解析订阅域名，完成后自动退出。
使用 `proxy: DIRECT` 的 Provider 可直接检测；依赖其他代理组下载或使用 `override` 的
Provider 保持原模式。

检测期间继续使用上一版节点。检测完成后，`url-test`、`fallback` 和 `load-balance`
等引用该 Provider 的策略组只看到本轮发布的有效节点；被丢弃节点仍保留在完整候选列表
中，后续定时更新会再次检测，因此恢复后可以重新加入。过滤文件通过原子替换触发原生
File Provider 局部更新；已有连接不会被关闭，新连接使用新发布的节点列表。

当本轮所有候选节点均失败时：已有可用版本继续保留上一版；首次启动尚无上一版时保留
完整候选列表，避免发布空 Provider。关闭丢弃模式会立即恢复当前完整候选列表。

在 `插件配置 → 内核更新` 中更新内核，或执行：

```sh
/etc/init.d/mihomox update_core
```

自定义内核地址必须同时填写 64 位 SHA256。运行时更新不会通过 `opkg` 或 `apk` 安装、
删除或升级软件包。

## 迁移与保留

首次安装时，MihomoX 可复制现有 Nikki 的配置、配置文件、订阅和混入文件。
导入过程不会修改 Nikki，并会保持 MihomoX 为禁用状态，避免服务和防火墙冲突。

配置文件、订阅、混入文件、规则提供者、内核和内核元数据均已列入 sysupgrade
保留范围。二进制 conffile 在不同 OpenWrt 版本上的包管理行为仍需按目标系统验证。

## 测试

```sh
./tests/run.sh
```

测试覆盖 Shell 语法、架构映射、资源下载、内核更新、Provider 过滤管理器与页面、LuCI
请求流程、文件编辑、上传、网络检测/STUN 以及 RPC/ACL 安全检查。

## 设计与上游审计

- [移植与架构设计](PORTING.md)
- [AI/开发者操作约定](AGENTS.md)
- [参考源审计](docs/upstream.md)

Nikki 是主要功能基础；Clashoo 仅作为内核交付和更新设计的次级参考；Momo 只用于
对照通用 OpenWrt/LuCI 实现，其 sing-box 专用逻辑不属于 MihomoX。

## 致谢

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki)
- [openwrt-clashoo](https://github.com/kenzok8/openwrt-clashoo)
- [OpenWrt-momo](https://github.com/nikkinikki-org/OpenWrt-momo)
- [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo)

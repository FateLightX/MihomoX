# MihomoX

MihomoX 是运行在 OpenWrt 上的 Mihomo 透明代理 LuCI 服务。项目以 Nikki 的
UCI、procd、防火墙、路由、配置混入和 LuCI 为功能基础，同时独立交付和更新
Mihomo 内核。

## 主要功能

- 支持 IPv4、IPv6 的 Redirect、TPROXY 和 TUN 透明代理
- 通过 LuCI 管理配置文件、订阅、混入配置、访问控制、规则、编辑器、面板和日志
- 编译时打包目标架构的 Mihomo 内核，不依赖独立的 `mihomo-meta` 或
  `mihomo-alpha` 软件包
- 编译时下载官方最新 Mihomo Alpha 二进制，验证 SHA256 和 ELF 架构后直接打包
- 运行时内核更新包含可信 SHA256、原子替换及失败回滚
- 编译时打包 GeoSite、GeoIP、ASN 数据和 Zashboard
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

GitHub Actions 只构建 `x86_64-openwrt-25.12`。构建前会执行
`mihomox/scripts/fetch_mihomo.sh`，解析并下载官方最新 Alpha 二进制，验证发布资产 SHA256、
gzip 格式和 ELF 架构后直接打包；不会重新编译 Mihomo Go 源码。OpenWrt 工具链只编译
MihomoX 自带的轻量 STUN 辅助程序。内核、规则数据和面板资源会缓存在 OpenWrt
`DL_DIR`，解析、下载或校验失败时构建直接停止。

设备运行时依赖通过 `EXTRA_DEPENDS` / `LUCI_EXTRA_DEPENDS` 写入 APK 元数据，不加入
Action 的源码构建依赖图。安装时仍由 `apk` 或 `opkg` 从对应 OpenWrt 软件源解析依赖。

手动运行 `release-packages` 时不需要填写版本号。工作流先执行 `tests/run.sh`，然后从
`mihomox/Makefile` 和 `luci-app-mihomox/Makefile` 读取 `PKG_VERSION`、`PKG_RELEASE`，
在两个包的 `PKG_VERSION` 一致时生成 `v<version>-<mihomox-release>-<luci-release>`
作为 GitHub Release 的标签和标题，并上传 `mihomox_x86_64-openwrt-25.12.tar.gz`。
Cloudflare 凭据未配置时仅跳过 Feed 部署，不影响 GitHub Release 成功。

## 使用

LuCI 页面位于 `服务 → MihomoX`：

- `插件配置`：服务、管理面板和内核更新
- `配置文件`：本地配置文件和订阅
- `混入配置`：Mihomo 混入及 DNS 设置
- `代理配置`：透明代理和访问控制
- `网络测试`：核心、DNS、国内/国际站点、IPv4、IPv6 和 NAT 类型检测；IPv4 国内与
  IPv6 国内检查路由器直连公网地址，IPv4 国外通过 Mihomo 本地代理显示出口 IP 和国家
- `编辑器`：配置文件、混入文件和规则提供者文件
- `日志`：插件、内核和调试日志

在 `插件配置 → 内核更新` 中更新内核，或执行：

```sh
/etc/init.d/mihomox update_core
```

自定义内核地址必须同时填写 64 位 SHA256。运行时更新不会通过 `opkg` 或 `apk` 安装、
删除或升级软件包。

### 中国大陆 IP 绕过列表更新

启用 `代理配置 → 绕过 → 自动更新中国大陆 IP` 后，MihomoX 会分别更新 IPv4 和 IPv6
列表：

- IPv4：[`china.txt`](https://raw.githubusercontent.com/gaoyifan/china-operator-ip/refs/heads/ip-lists/china.txt)
- IPv6：[`china6.txt`](https://raw.githubusercontent.com/gaoyifan/china-operator-ip/refs/heads/ip-lists/china6.txt)

下载失败或内容校验失败时，按以下顺序回退：

1. GitHub Raw
2. `v4.gh-proxy.org`
3. `fastly.jsdelivr.net`

默认每周一 `04:00` 更新。可在同一页面的 `China IP Update Cron` 中填写五段式
cron 表达式自定义时间，也可以手动执行：

```sh
/etc/init.d/mihomox update_china_ip
```

更新只替换运行中的 nftables `china_ip` / `china_ip6` 集合，不重载完整 Mihomo 配置，
不会触发订阅更新或节点测速。单个地址列表更新失败时保留对应的旧列表。

## 迁移与保留

首次安装时，MihomoX 可复制现有 Nikki 的配置、配置文件、订阅和混入文件。
导入过程不会修改 Nikki，并会保持 MihomoX 为禁用状态，避免服务和防火墙冲突。

配置文件、订阅、混入文件、规则提供者、内核和内核元数据均已列入 sysupgrade
保留范围。二进制 conffile 在不同 OpenWrt 版本上的包管理行为仍需按目标系统验证。

## 测试

```sh
./tests/run.sh
```

测试覆盖 Shell 语法、架构映射、资源下载、内核更新、LuCI 请求流程、文件编辑、上传、
网络检测/STUN 以及 RPC/ACL 安全检查。

## 设计与上游审计

- [移植与架构设计](PORTING.md)
- [AI/开发者操作约定](AGENTS.md)
- [AI 开发手册](docs/ai-development.md)
- [参考源审计](docs/upstream.md)

Nikki 是主要功能基础；Clashoo 仅作为内核交付和更新设计的次级参考；Momo 只用于
对照通用 OpenWrt/LuCI 实现，其 sing-box 专用逻辑不属于 MihomoX。

## 致谢

- [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki)
- [openwrt-clashoo](https://github.com/kenzok8/openwrt-clashoo)
- [OpenWrt-momo](https://github.com/nikkinikki-org/OpenWrt-momo)
- [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo)

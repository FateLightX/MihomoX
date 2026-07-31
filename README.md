# MihomoX

MihomoX 是运行在 OpenWrt 上的 Mihomo 透明代理 LuCI 服务。项目以 Nikki 的
UCI、procd、防火墙、路由、配置混入和 LuCI 为功能基础，同时独立交付和更新
Mihomo 内核。

## 主要功能

- 支持 IPv4、IPv6 的 Redirect、TPROXY 和 TUN 透明代理
- 通过 LuCI 管理配置文件、订阅、混入配置、访问控制、规则、编辑器、面板和日志
- 编译时打包目标架构的 Mihomo 内核，不依赖独立的 `mihomo-meta` 或
  `mihomo-alpha` 软件包
- 支持 `Prerelease-Alpha` 和 Release 通道、自动架构检测及 amd64 v1/v2/v3
  手动选择
- 运行时内核更新包含可信 SHA256 校验、原子替换、失败回滚及按运行状态重启
- 编译时打包 GeoSite、GeoIP、ASN 数据和 Zashboard
- 首次安装时可导入现有 Nikki 配置，但不会修改或启用 Nikki

## 系统要求

- OpenWrt 23.05、24.10、25.12 或 SNAPSHOT
- `firewall4`
- MetaCubeX/mihomo Release 支持的目标架构

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

默认下载最新 `Prerelease-Alpha` 内核。需要固定正式版时：

```sh
MIHOMO_CHANNEL=release MIHOMO_VERSION=v1.19.0 MIHOMO_SHA256=<sha256> \
  make package/mihomox/compile V=s
```

内核、规则数据和面板下载会缓存在 OpenWrt `DL_DIR`。架构无法识别或校验不通过时，
编译会直接失败。

## 使用

LuCI 页面位于 `服务 → MihomoX`：

- `插件配置`：服务、管理面板和内核更新
- `配置文件`：本地配置文件和订阅
- `混入配置`：Mihomo 混入及 DNS 设置
- `代理配置`：透明代理和访问控制
- `网络测试`：核心、DNS、国内/国际连接、IPv4、IPv6 和 NAT 类型检测
- `编辑器`：配置文件、混入文件和规则提供者文件
- `日志`：插件、内核和调试日志

在 `插件配置 → 内核更新` 中更新内核，或执行：

```sh
/etc/init.d/mihomox update_core
```

自定义内核地址必须同时填写 64 位 SHA256。运行时更新不会通过 `opkg` 或 `apk`
安装、删除或升级任何软件包。

## 迁移与保留

首次安装时，MihomoX 可复制现有 Nikki 的配置、配置文件、订阅和混入文件。
导入过程不会修改 Nikki，并会保持 MihomoX 为禁用状态，避免服务和防火墙冲突。

配置文件、订阅、混入文件、规则提供者、内核和内核元数据均已列入 sysupgrade
保留范围。二进制 conffile 在不同 OpenWrt 版本上的包管理行为仍需按目标系统验证。

## 测试

```sh
./tests/run.sh
```

测试覆盖 Shell 语法、架构映射、资源下载、内核更新、LuCI 请求流程、文件编辑、
上传、网络检测/STUN 以及 RPC/ACL 安全检查。

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

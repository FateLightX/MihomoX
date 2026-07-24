# MihomoX

[English](README.md)

MihomoX 是运行在 OpenWrt 上的 Mihomo 透明代理 LuCI 服务。其 UCI、procd、
LuCI 和配置混入结构基于 Nikki。

## 主要功能

- 通过 LuCI 管理配置文件、规则、日志和 Mihomo 内核
- 编译时下载目标架构内核、GeoSite/GeoIP 数据和 Zashboard
- 默认使用 `Prerelease-Alpha`，支持正式版和架构选择
- 内核更新支持 SHA256 校验、原子替换和失败回滚
- 规则文件上传、下载和删除

## 安装

适用于启用 `firewall4` 的 OpenWrt 24.10、25.12 和 SNAPSHOT：

```sh
wget -qO- https://raw.githubusercontent.com/FateLightX/MihomoX/main/install.sh | sh
```

## 编译

使用与目标固件匹配的 OpenWrt SDK：

```sh
make defconfig
make package/mihomox/compile V=s
make package/luci-app-mihomox/compile V=s
```

默认下载最新 `Prerelease-Alpha` 内核。需要可复现的正式版构建时，固定版本和
SHA256：

```sh
MIHOMO_CHANNEL=release MIHOMO_VERSION=v1.19.0 MIHOMO_SHA256=<sha256> \
  make package/mihomox/compile V=s
```

自定义内核或 Zashboard 地址必须同时提供 SHA256。

## 更新内核

LuCI：`服务 → MihomoX → App Config → Core Update`

命令行：

```sh
/etc/init.d/mihomox update_core
```

## 测试

```sh
./tests/run.sh
```

## 致谢

MihomoX 的 UCI、procd、LuCI 及配置混入设计参考并移植自
[OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki)。

感谢 Nikki 项目及其贡献者。

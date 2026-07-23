# MihomoX

MihomoX 是基于 Nikki 设计的 OpenWrt Mihomo 透明代理服务。

## 特点

- 保留 UCI、procd、LuCI 和配置混入设计
- 不编译 Mihomo 源码
- 编译 `mihomox` 时下载目标架构的 Mihomo Stable 二进制
- 运行时通过 LuCI 或命令行手动更新内核
- 支持 x86_64 `amd64-v1`、`amd64-v2`、`amd64-v3` 自动识别和手动选择
- 更新过程包含下载校验、原子替换和失败回滚

## 运行路径

```text
/etc/config/mihomox
/etc/init.d/mihomox
/etc/mihomox/bin/mihomo
/etc/mihomox/scripts/update_core.sh
```

## 编译

使用与目标固件版本、target、subtarget 对应的 OpenWrt SDK：

```sh
make defconfig
make package/mihomox/compile V=s
make package/luci-app-mihomox/compile V=s
```

编译阶段需要联网访问 Mihomo Release。默认下载最新 Stable 版本；可通过 `MIHOMO_VERSION` 指定版本进行可复现测试：

```sh
MIHOMO_VERSION=v1.19.0 make package/mihomox/compile V=s
```

完整固件可以再使用 OpenWrt ImageBuilder 安装已编译的 `mihomox` 和 `luci-app-mihomox` 包。

## 手动更新内核

LuCI：`服务 -> MihomoX -> App Config -> Core Update`

命令行：

```sh
/etc/init.d/mihomox update_core
```

更新设置保存在 `mihomox.core`：

```uci
option channel 'stable'
option architecture 'auto'
option mirror_prefix ''
option download_url ''
```

手动更新不会安装或升级 OpenWrt 的 Mihomo 软件包。

## 依赖

- ca-bundle
- curl
- jsonfilter
- ucode
- coreutils-nohup
- yq
- firewall4
- ip-full
- kmod-inet-diag
- kmod-nft-socket
- kmod-nft-tproxy
- kmod-tun
- kmod-dummy

## 测试

建议先用 SDK 编译包，再用 ImageBuilder 生成测试固件，最后在 QEMU 或实体设备上验证：

```sh
./tests/run.sh
```

```sh
/etc/mihomox/bin/mihomo -v
/etc/init.d/mihomox update_core
cat /etc/mihomox/bin/mihomo.version
```

## 上游

核心透明代理和 LuCI 结构移植自 [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki)。

# MihomoX

MihomoX is an OpenWrt transparent proxy service based on Nikki's UCI, procd, LuCI, and profile mixin design.

## Features

- No Mihomo source compilation
- Downloads a target-architecture Mihomo Stable binary while building `mihomox`
- Manual core updates from LuCI or the command line
- Automatic and manual x86_64 `amd64-v1`, `amd64-v2`, and `amd64-v3` selection
- Download verification, atomic replacement, and rollback
- No OpenWrt Mihomo package dependency

## Runtime paths

```text
/etc/config/mihomox
/etc/init.d/mihomox
/etc/mihomox/bin/mihomo
/etc/mihomox/scripts/update_core.sh
```

## Build

Use an OpenWrt SDK matching the firmware release, target, and subtarget:

```sh
make defconfig
make package/mihomox/compile V=s
make package/luci-app-mihomox/compile V=s
```

The package build needs network access to the Mihomo release. It resolves the latest Stable release by default. Pin a version for reproducible tests:

```sh
MIHOMO_VERSION=v1.19.0 make package/mihomox/compile V=s
```

Use an OpenWrt ImageBuilder afterward to assemble a test image with the built packages.

## Manual core update

LuCI: `Services -> MihomoX -> App Config -> Core Update`

Command line:

```sh
/etc/init.d/mihomox update_core
```

Settings are stored in `mihomox.core`:

```uci
option channel 'stable'
option architecture 'auto'
option mirror_prefix ''
option download_url ''
```

Manual updates replace the binary directly and do not install or upgrade an OpenWrt Mihomo package.

## Dependencies

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

## Tests

```sh
./tests/run.sh
```

## Upstream

The proxy and LuCI structure is ported from [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki).

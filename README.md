# MihomoX

[中文说明](README.zh.md)

MihomoX is an OpenWrt LuCI service for Mihomo transparent proxying. Its UCI,
procd, LuCI, and profile-mixin structure is based on Nikki.

## Highlights

- LuCI management for profiles, rules, logs, and Mihomo core updates
- Build-time download of the target-architecture core, GeoSite/GeoIP data, and Zashboard
- `Prerelease-Alpha` by default, with Release and architecture selection
- SHA256 verification, atomic replacement, and rollback for core updates
- Rule file upload, download, and deletion

## Install

For OpenWrt 24.10, 25.12, or SNAPSHOT with `firewall4`:

```sh
wget -qO- https://raw.githubusercontent.com/FateLightX/MihomoX/main/install.sh | sh
```

## Build

Use an OpenWrt SDK matching the target firmware:

```sh
make defconfig
make package/mihomox/compile V=s
make package/luci-app-mihomox/compile V=s
```

The build downloads the latest `Prerelease-Alpha` core by default. For a
reproducible Release build, pin the version and SHA256:

```sh
MIHOMO_CHANNEL=release MIHOMO_VERSION=v1.19.0 MIHOMO_SHA256=<sha256> \
  make package/mihomox/compile V=s
```

## Core update

LuCI: `Services → MihomoX → App Config → Core Update`

Command line:

```sh
/etc/init.d/mihomox update_core
```

Custom core or Zashboard URLs must include an explicit SHA256.

## Test

```sh
./tests/run.sh
```

## Acknowledgments

MihomoX is based on the UCI, procd, LuCI, and profile-mixin design of
[OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki).

Thanks to the Nikki project and its contributors.

# 参考源同步与审计

MihomoX 不直接合并参考仓库，也不把参考源码复制进本仓库。每次更新先对独立、干净
的 Git 克隆执行快进同步，再按提交范围审计，最后记录“需要移植”或“无需移植”。

## 本地参考仓库

这些目录与 MihomoX 仓库并列：

| 参考源 | 本地目录 | 定位 | 当前审计版本 |
| --- | --- | --- | --- |
| [OpenWrt-nikki](https://github.com/nikkinikki-org/OpenWrt-nikki) | `../OpenWrt-nikki` | 主要功能基础 | `388f34e` |
| [OpenWrt-momo](https://github.com/nikkinikki-org/OpenWrt-momo) | `../OpenWrt-momo` | 同组织辅助参考 | `6fb94df` |
| [openwrt-clashoo](https://github.com/kenzok8/openwrt-clashoo) | `../openwrt-clashoo` | 内核更新次级参考 | `95de5e2` |

## 同步流程

同步前必须确认参考仓库工作区干净：

```sh
git -C ../OpenWrt-nikki status --short --branch
git -C ../OpenWrt-nikki fetch --prune origin
git -C ../OpenWrt-nikki merge --ff-only origin/main

git -C ../OpenWrt-momo status --short --branch
git -C ../OpenWrt-momo fetch --prune origin
git -C ../OpenWrt-momo merge --ff-only origin/main

git -C ../openwrt-clashoo status --short --branch
git -C ../openwrt-clashoo fetch --prune origin
git -C ../openwrt-clashoo merge --ff-only origin/main
```

同步后检查 `旧版本..新版本` 的提交、文件和实际行为。只有符合
[移植边界](../PORTING.md#2-参考来源) 的变化才进入 MihomoX；禁止整目录覆盖。

## 2026-08-05：Nikki

- 上游：`nikkinikki-org/OpenWrt-nikki`
- 旧参考：`34a0367`
- 已审计至：`388f34e`
- 范围：`34a0367..388f34e`

审计结果：

- `388f34e fix(rpcd): use TLS listen address for API requests when configured (#884)`
  - Nikki 修正了启用 TLS API 监听时仍使用普通监听地址的问题。
  - MihomoX 的 `core_api_request()` 已优先选择 `external-controller-tls`，并根据所选
    地址构造控制器 URL，现补充回归测试固定该行为。
  - 决策：等价行为已存在，移植测试与审计记录。

## 2026-07-29：Nikki

- 上游：`nikkinikki-org/OpenWrt-nikki`
- 版本描述：`v1.26.1-9-g34a0367`
- 旧参考：`cce63f8`
- 已审计至：`34a0367`
- 范围：`cce63f8..34a0367`

审计结果：

- `f06b6b4 fix: mojibake when saving a large file`
  - Nikki 对分块写入启用流式 `TextDecoder`。
  - MihomoX 已在 `tools/mihomox.js` 使用等价的 `stream: !finalChunk`，并在
    `tests/test_luci_writefile.js` 覆盖多字节字符跨块场景。
  - 决策：无需移植。
- `34a0367 docs: Update README`
  - Nikki 删除中英文 README 中的服务推荐内容。
  - MihomoX 从未包含该内容。
  - 决策：无需移植。

## 2026-07-29：Clashoo

- 上游：`kenzok8/openwrt-clashoo`
- 版本：`v2026.07.28` / `95de5e2`
- 旧参考：`8040bce`
- 已审计至：`95de5e2`
- 范围：`8040bce..95de5e2`

该范围共 9 个提交：5 次 Alpha 内核版本更新、1 次规则数据刷新，以及分组 LAN
访问控制、订阅更新加固和访问控制布局修复。

审计结果：

- 内核版本更新：Clashoo 固定源码版本，MihomoX 解析 Release 资产并独立校验；无需移植。
- 规则数据刷新：两项目的数据格式和交付链不同；无需移植。
- LAN 访问控制和页面布局：不属于 Clashoo 的内核更新参考范围，MihomoX 继续沿用
  Nikki 架构；无需移植。
- 订阅更新加固：MihomoX 已支持每个订阅独立 `user_agent`；Clashoo 更细的 curl
  错误分类尚未移植，但不属于当前 Clashoo 参考边界。

本轮结论：无需移植源码。

## 2026-07-29：Momo

- 上游：`nikkinikki-org/OpenWrt-momo`
- 已审计至：`6fb94df`
- 定位：基于 sing-box 的同组织兄弟项目，不是 MihomoX 直接上游。

可按需对照 UCI/procd、firewall4、策略路由、DNS 劫持、访问控制和通用 LuCI/RPC
模式。sing-box JSON、inbound、命令行、mixin 和 API 字段不得直接移植。

本轮只建立参考基线，没有需要移植的变更。

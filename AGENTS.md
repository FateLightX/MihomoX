# MihomoX 开发约定

本文件是后续 AI/开发者进入仓库后的最短操作说明。完整 AI 开发手册看
`docs/ai-development.md`，用户文档看 `README.md`，架构边界看 `PORTING.md`，参考源
审计记录看 `docs/upstream.md`。

## 1. 修改前

```sh
git status --short
git branch --show-current
git rev-list --left-right --count HEAD...@{upstream}
```

- Git 根目录是本目录，不是上一级 `App/MihomoX`。
- 保留已有未提交修改；不执行破坏性的 `reset`、`checkout` 或 `clean`。
- 未经用户明确要求，不提交、不推送、不改版本标签。
- 不在日志、测试输出、提交信息或回复中暴露密码、Token 和订阅内容。

## 2. 目录职责

| 路径 | 职责 |
| --- | --- |
| `mihomox/Makefile` | OpenWrt 主包、依赖、构建和安装 |
| `mihomox/files/mihomox.conf` | 新安装的 UCI 默认配置 |
| `mihomox/files/mihomox.init` | procd 服务入口和启动前配置处理 |
| `mihomox/files/ucode/` | Mihomo 配置生成和 nftables 模板 |
| `mihomox/files/scripts/` | 设备端脚本 |
| `mihomox/scripts/` | 编译期资源下载脚本 |
| `mihomox/src/` | 随主包交叉编译的小型本地辅助程序 |
| `luci-app-mihomox/htdocs/` | LuCI 页面和前端工具 |
| `luci-app-mihomox/root/` | 菜单、ACL 和 rpcd ucode 后端 |
| `luci-app-mihomox/po/` | 翻译模板和语言文件 |
| `tests/` | 本地静态、回归和安全测试 |

## 3. 修改规则

- 默认值同时检查 UCI、LuCI 和测试：`mihomox.conf`、对应页面的 `o.default`、
  `tests/test_default_settings.sh`。
- 新增 LuCI RPC 时同时更新前端声明、rpcd 方法和 ACL，并补测试。
- 长耗时 RPC 禁止批处理，必须有设备端超时和浏览器端超时；页面不能永久停留在加载状态。
- OpenWrt 23.05 是兼容下限。不要使用该版本没有的软件包或 ucode API。
- rpcd ucode 兼容旧实现：外部命令参数逐项引用；布尔值和数字可能以字符串传入。
- C 辅助程序必须用 `$(TARGET_CC)` 构建，不引入设备端编译器或解释器依赖。
- 用户可见字符串使用 `_()`，并同步 POT、简体中文、繁体中文和俄语 PO。
- UCI 字段、Mihomo YAML 字段和 UI 名称不要凭语义猜测；先查生成链和上游格式。

### 默认透明代理

新安装默认值位于 `mihomox/files/mihomox.conf`：

```text
proxy.enabled=1
proxy.tcp_mode=tproxy
proxy.udp_mode=tproxy
proxy.router_proxy=1
proxy.lan_proxy=1
mixin.tun_enabled=0
```

这是包源码默认值，不是运行中路由器的最终状态。修改默认值只影响新安装；迁移脚本不得
覆盖已有用户选择。TPROXY 的 mark、rule preference 和 route table 同时检查
`mihomox.conf`、`mihomox.init` 与 `ucode/hijack.ut`。

### 网络测试契约

涉及文件：

- UI 与测试顺序：`luci-app-mihomox/htdocs/luci-static/resources/view/mihomox/network.js`
- RPC 与探测实现：`luci-app-mihomox/root/usr/share/rpcd/ucode/luci.mihomox`
- 前端 RPC 声明：`luci-app-mihomox/htdocs/luci-static/resources/tools/mihomox.js`
- 回归测试：`tests/test_luci_network.js`

当前固定语义：

| 项目 | 访问路径 | 目标/结果 |
| --- | --- | --- |
| 国内连接、百度、网易云 | 不显式指定代理 | 固定站点 HTTP(S) 可达性和延迟 |
| 国际代理、Google、YouTube | Mihomo 本地 Mixed/HTTP 代理 | 固定站点可达性和延迟 |
| IPv4 国内 | 绕过 cgroup 直连 | `v4.ipgg.cn` 返回路由器公网 IPv4 |
| IPv6 国内 | 绕过 cgroup 直连并使用固定 DoH | `v6.ipgg.cn` 返回路由器公网 IPv6 |
| IPv4 国外 | Mihomo 本地代理 | `ifconfig.co` 返回出口 IPv4，`ifconfig.co/country` 返回国家 |
| NAT | 绕过透明代理的 STUN 辅助程序 | NAT 类型 |

没有“IPv6 国外”项目。不要仅靠 `curl -6` 加回：经过 HTTP 代理时，它不能证明代理
节点到目标使用 IPv6。新增或替换目标必须是代码内固定 URL，不接受 RPC 调用者输入。
IPv4 国外的 IP 或国家任一请求失败时，整项失败，避免展示不完整结果。

## 4. 验证

最小检查：

```sh
git diff --check
./tests/run.sh
```

按改动补充：

```sh
node --check path/to/file.js
msgfmt --check -o /dev/null luci-app-mihomox/po/zh_Hans/mihomox.po
make package/mihomox/compile V=s
make package/luci-app-mihomox/compile V=s
```

本地测试不能替代 OpenWrt SDK 交叉编译、真机 rpcd/LuCI、网络条件和浏览器缓存验证。
网络测试页改动至少检查：正常返回、DNS/HTTP/STUN 超时、RPC 不存在及按钮恢复。
测试行增删还必须同步 RPC `case`、UI 顺序、四份 PO/POT、模拟结果数量与调用顺序断言。

## 5. 提交 GitHub

只有用户明确要求时执行：

1. 查看状态、远端、分支和分歧。
2. 运行 `git diff --check` 和相关测试。
3. 只暂存本次相关文件，使用简洁英文提交信息。
4. 推送当前分支。
5. 验证工作区干净且 `HEAD...origin/main` 为 `0 0`。

## 6. 当前边界

- 只交付 Mihomo，不生成独立 `mihomo-meta`、`mihomo-alpha` 或 sing-box 包。
- 内核、GeoData 和 Zashboard 在编译期打包；运行时内核更新不经过包管理器。
- Nikki 是主要功能基础；Clashoo 和 Momo 只能在 `PORTING.md` 定义的范围内逐项参考。
- 参考仓库不得整目录覆盖，审计结果记录到 `docs/upstream.md`。

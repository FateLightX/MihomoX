# MihomoX AI 开发入口

本文件是后续 AI 或开发者继续开发 MihomoX 时的主操作手册。第一次进入仓库，按下面的顺序读取：

1. `AGENTS.md`：最短操作约定和提交边界。
2. 本文件：代码结构、开发循环、发布流程和验证命令。
3. `PORTING.md`：长期架构边界和参考来源。
4. `docs/upstream.md`：参考仓库同步与逐次审计记录。
5. `README.md`：用户视角的功能和安装说明。

## 1. 开始前必须确认

仓库根目录不是上一层 `App/MihomoX`，而是 Git 根目录：

```sh
cd "$(git rev-parse --show-toplevel)"
```

开始改动前执行：

```sh
git status --short
git branch --show-current
git rev-list --left-right --count HEAD...@{upstream}
```

规则：

- 保留已有未提交修改，不执行破坏性的 `reset`、`checkout` 或 `clean`。
- 不提交、不推送、不改版本标签，除非用户明确要求。
- 不输出密码、Token、私钥或订阅内容。
- 涉及 LuCI 页面或 RPC 时，先读现有实现和测试，不凭字段名猜测。

## 2. 项目形态

MihomoX 是运行在 OpenWrt 上的 Mihomo 透明代理 LuCI 服务：

- 主包：`mihomox`
- LuCI 包：`luci-app-mihomox`
- 支持 OpenWrt 23.05、24.10、25.12 和 SNAPSHOT
- 支持 Redirect、TPROXY、TUN，以及 IPv4/IPv6
- 编译期下载官方 Mihomo Alpha 二进制，验证 SHA256、gzip 和 ELF 架构后打包
- 编译期同时准备 GeoSite、GeoIP、ASN 数据和 Zashboard
- 运行时内核更新只替换 `/etc/mihomox/bin/mihomo`，不经过 `opkg`/`apk`
- LuCI 通过 `luci.mihomox` rpcd 方法读写配置、更新订阅、编辑文件、执行网络测试

配置和运行链：

```text
/etc/config/mihomox
  -> /etc/init.d/mihomox
  -> /etc/mihomox/ucode/mixin.uc
  -> /etc/mihomox/run/config.yaml
  -> /etc/mihomox/bin/mihomo
```

防火墙规则由 `mihomox/files/ucode/hijack.ut` 生成。默认值以
`mihomox/files/mihomox.conf` 为准，不得只改 LuCI 页面默认值。

## 3. 目录职责

| 路径 | 职责 |
| --- | --- |
| `mihomox/Makefile` | 主包版本、依赖、编译期资源和安装 |
| `mihomox/files/mihomox.conf` | 新安装的 UCI 默认配置 |
| `mihomox/files/mihomox.init` | procd 服务入口、凭据初始化、防火墙和订阅 |
| `mihomox/files/ucode/` | Mihomo 配置生成和 nftables 模板 |
| `mihomox/files/scripts/` | 设备端更新、调试、防火墙脚本 |
| `mihomox/scripts/` | 编译期下载脚本 |
| `mihomox/src/` | 随主包交叉编译的 STUN C 辅助程序 |
| `luci-app-mihomox/htdocs/` | LuCI 页面和前端工具 |
| `luci-app-mihomox/root/` | 菜单、ACL 和 rpcd ucode 后端 |
| `luci-app-mihomox/po/` | POT、简中、繁中、俄语翻译 |
| `tests/` | Shell、Node、LuCI、安全和发布回归测试 |

## 4. 开发循环

```text
读实现和测试
  -> 按现有模式改代码
  -> 更新对应测试和文档
  -> 本地验证
  -> 按用户要求提交/推送
```

每次修改至少检查：

```sh
git diff --check
./tests/run.sh
```

改动范围对应的额外检查：

```sh
# LuCI JS
node --check path/to/file.js

# 翻译
msgfmt --check -o /dev/null luci-app-mihomox/po/zh_Hans/mihomox.po

# OpenWrt 包编译（需要 SDK）
make package/mihomox/compile V=s
make package/luci-app-mihomox/compile V=s
```

## 5. 常见修改类型

### 修改默认配置

同时检查并更新：

- `mihomox/files/mihomox.conf`
- LuCI 页面对应的 `o.default`
- `tests/test_default_settings.sh`
- 如涉及迁移，检查 `mihomox/files/uci-defaults/migrate.sh`

升级不得覆盖已有 UCI 选择；迁移脚本只补齐缺失字段。

### 新增或修改 LuCI RPC

同步更新：

- 前端 RPC 声明：`luci-app-mihomox/htdocs/luci-static/resources/tools/mihomox.js`
- rpcd 后端：`luci-app-mihomox/root/usr/share/rpcd/ucode/luci.mihomox`
- ACL：`luci-app-mihomox/root/usr/share/rpcd/acl.d/luci-app-mihomox.json`
- 回归测试：`tests/test_luci_*.js`
- 用户可见字符串和翻译

安全约束：

- 外部命令参数必须用 `shell_quote()`。
- 布尔值和数字可能以字符串传入，兼容处理。
- 长任务必须有设备端和浏览器端超时，页面不能永久加载。
- 文件写入只允许明确路径，禁止 `..`，单文件上限 16 MiB。
- ACL 只开放页面实际需要的方法和文件范围。

### 修改网络测试

涉及文件：

- `luci-app-mihomox/htdocs/luci-static/resources/view/mihomox/network.js`
- `luci-app-mihomox/root/usr/share/rpcd/ucode/luci.mihomox`
- `luci-app-mihomox/htdocs/luci-static/resources/tools/mihomox.js`
- `tests/test_luci_network.js`

规则：

- 目标必须固定写死在代码中，不接受 RPC 调用者传入 URL、命令或 STUN 地址。
- 国内站点不显式指定代理；国际站点显式使用 Mihomo 本地 Mixed/HTTP 代理。
- IPv4 国内通过绕过 cgroup 直连 `https://v4.ipgg.cn`。
- IPv6 国内通过绕过 cgroup 和固定 DoH 直连 `https://v6.ipgg.cn`。
- IPv4 国外经 Mihomo 本地代理访问 `ifconfig.co` 和 `ifconfig.co/country`。
- 不增加“IPv6 国外”项目，除非能证明代理节点到目标使用 IPv6。
- NAT 检测使用 STUN 辅助程序和固定目标，不得落入透明代理。

### 修改编译期资源

`mihomox/Makefile` 的 `Build/Prepare` 依次执行：

1. `fetch_mihomo.sh`
2. `fetch_geodata.sh`
3. `fetch_zashboard.sh`

修改资源下载、校验或缓存逻辑时，必须同步：

- `mihomox/Makefile`
- 对应 `mihomox/scripts/fetch_*.sh`
- `tests/test_fetch_*.sh`

内核必须做 SHA256、gzip 和 ELF 架构校验。规则数据建议提供固定 SHA256；不得把“无校验下载”作为默认发布状态。

### 修改版本和发布

版本规则：

- `mihomox/Makefile` 和 `luci-app-mihomox/Makefile` 的 `PKG_VERSION` 必须一致。
- 每次发布对应包内容变化时，把对应包的 `PKG_RELEASE` 加一。
- `release-packages` 不需要手动填版本。
- Release tag 由工作流生成：`v<PKG_VERSION>-<mihomox PKG_RELEASE>-<luci-app-mihomox PKG_RELEASE>`。

发布前必须运行 `./tests/run.sh`。`release-packages` 的 `validate` job 已内置测试；不要绕过。

### 修改安装或 Feed 脚本

`install.sh`、`feed.sh` 使用 `set -eu`，包管理器、下载或解析失败必须退出，不能继续打印 `success`。可选查询（如不存在某种语言包）必须显式容错。

## 6. GitHub Actions

### `build-packages`

- 手动触发。
- `check` 运行 `./tests/run.sh`。
- `build` 构建 `x86_64-openwrt-25.12` 并上传产物。
- 不生成 Release，不部署 Feed。

### `release-packages`

- 手动触发。
- `validate` 运行测试并校验两个包版本。
- `release` 构建、签名索引、压缩、上传 GitHub Release 和 artifact。
- `feed` 在配置 Cloudflare 凭据时部署 Pages；未配置时跳过，不影响 Release。

### 其他工作流

- `stale-issues.yml`：自动标记和关闭无活动 issue。
- `delete-workflow-runs.yml`：手动清理旧的 workflow run。

MihomoX 的 Actions 引用已固定到 commit SHA；新增引用也应固定版本并加注释。

## 7. 运行时内核更新

入口：

- LuCI：`luci.mihomox.update_core`
- 命令行：`/etc/init.d/mihomox update_core`

统一执行 `/etc/mihomox/scripts/update_core.sh`：

1. 建立带 PID 的互斥锁并清理失效锁。
2. 解析通道、架构、镜像或自定义 URL。
3. 下载并校验 SHA256、压缩格式、ELF 架构和可执行版本。
4. 原子替换内核和元数据，先备份。
5. 新内核失败时回滚。
6. 只在更新前运行时重启。
7. 写状态文件并清理临时文件和锁。

自定义 URL 必须为 HTTP(S)，且必须提供 64 位 SHA256。

## 8. 安全与兼容约束

- OpenWrt 23.05 是兼容下限。
- rpcd ucode 外部命令参数逐项引用。
- RPC 文件写入只允许明确路径，禁止目录穿越，单文件上限 16 MiB。
- 分块文本必须使用流式 `TextDecoder`，避免 UTF-8 跨块损坏。
- 调试输出必须脱敏：secret、password、token、订阅 URL、代理服务器等。
- 不暴露用户凭据、订阅内容或 Actions secret。
- Nikki、Momo、Clashoo 只能按 `PORTING.md` 的边界参考，不得整目录覆盖。

## 9. 已知边界和后续优化

当前未处理、但后续 AI 应优先阅读或评估的问题：

- GeoData 的四个 SHA256 默认为空，构建不会强制校验；建议补固定哈希或 fail closed。
- `core_api_request()` 对 HTTP/HTTPS 都传 `--insecure`；如支持 TLS 控制器，应改成按配置信任 CA。
- `stale-issues.yml` 使用 3 天 stale、1 天关闭，策略偏激进；如 issue 量不需要快速清空，建议放宽。

## 10. 提交和推送

只有用户明确要求时执行：

```sh
git status --short
git branch --show-current
git rev-list --left-right --count HEAD...@{upstream}
git diff --check
./tests/run.sh

git add <本次相关文件>
git commit -m "docs: add AI development guide"
git push origin main
```

推送后确认：

```sh
git status --short
git rev-list --left-right --count HEAD...@{upstream}
```

预期是工作区干净，`HEAD...@{upstream}` 为 `0 0`。

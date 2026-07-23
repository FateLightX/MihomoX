#!/bin/sh

CORE_DIR="${MIHOMOX_CORE_DIR:-/etc/mihomox/bin}"
CORE_PATH="$CORE_DIR/mihomo"
VERSION_FILE="$CORE_DIR/mihomo.version"
RUN_DIR="${MIHOMOX_RUN_DIR:-/var/run/mihomox}"
LOG_DIR="${MIHOMOX_LOG_DIR:-/var/log/mihomox}"
LOG_FILE="$LOG_DIR/core-update.log"
STATUS_FILE="$RUN_DIR/core-update.status"
LOCK_DIR="$RUN_DIR/core-update.lock"
PENDING_FILE="$RUN_DIR/core-update.pending"
STARTED_FLAG="${MIHOMOX_STARTED_FLAG:-$RUN_DIR/started.flag}"
INIT_SCRIPT="${MIHOMOX_INIT_SCRIPT:-/etc/init.d/mihomox}"
LATEST_URL="${MIHOMO_LATEST_URL:-https://github.com/MetaCubeX/mihomo/releases/latest}"
API_URL="${MIHOMO_API_URL:-https://api.github.com/repos/MetaCubeX/mihomo/releases/latest}"
DOWNLOAD_BASE="${MIHOMO_DOWNLOAD_BASE:-https://github.com/MetaCubeX/mihomo/releases/download}"
TMP_DIR=""
LOCK_HELD=0
LATEST_VERSION=""
SELECTED_ARCH=""

mkdir -p "$CORE_DIR" "$RUN_DIR" "$LOG_DIR"

log_line() {
	echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
}

sanitize_status() {
	printf '%s' "$1" | tr '\n=' '  '
}

write_status() {
	state="$1"
	message=$(sanitize_status "$2")
	version=$(sanitize_status "${3:-$LATEST_VERSION}")
	architecture=$(sanitize_status "${4:-$SELECTED_ARCH}")
	status_tmp="$STATUS_FILE.$$"
	{
		echo "state=$state"
		echo "message=$message"
		echo "version=$version"
		echo "architecture=$architecture"
		echo "updated_at=$(date '+%Y-%m-%d %H:%M:%S')"
	} > "$status_tmp"
	mv -f "$status_tmp" "$STATUS_FILE"
}

fail() {
	log_line "失败：$*"
	write_status "failed" "$*"
	exit 1
}

cleanup() {
	rm -f "$PENDING_FILE"
	[ -n "$TMP_DIR" ] && rm -rf "$TMP_DIR"
	[ "$LOCK_HELD" -eq 1 ] && rm -rf "$LOCK_DIR"
}

trap cleanup EXIT
trap 'exit 1' HUP INT TERM

has_cpu_flag() {
	case " $CPU_FLAGS " in
		*" $1 "*) return 0 ;;
		*) return 1 ;;
	esac
}

has_all_cpu_flags() {
	for flag in "$@"; do
		has_cpu_flag "$flag" || return 1
	done
	return 0
}

detect_amd64_level() {
	CPU_FLAGS="${MIHOMOX_CPU_FLAGS:-$(sed -n 's/^[[:space:]]*flags[[:space:]]*:[[:space:]]*//p' /proc/cpuinfo 2>/dev/null | head -n 1)}"
	if has_all_cpu_flags lahf_lm cx16 popcnt ssse3 sse4_1 sse4_2 avx avx2 bmi1 bmi2 fma movbe xsave && \
		(has_cpu_flag pni || has_cpu_flag sse3) && (has_cpu_flag abm || has_cpu_flag lzcnt); then
		echo "amd64-v3"
	elif has_all_cpu_flags lahf_lm cx16 popcnt ssse3 sse4_1 sse4_2 && \
		(has_cpu_flag pni || has_cpu_flag sse3); then
		echo "amd64-v2"
	else
		echo "amd64-v1"
	fi
}

detect_system_arch() {
	raw="${MIHOMOX_SYSTEM_ARCH:-}"
	if [ -z "$raw" ] && command -v opkg >/dev/null 2>&1; then
		raw=$(opkg print-architecture 2>/dev/null | awk '$1 == "arch" && $2 != "all" && $2 != "noarch" { value=$2 } END { print value }')
	fi
	if [ -z "$raw" ] && [ -r /etc/openwrt_release ]; then
		raw=$(sed -n "s/^DISTRIB_ARCH=['\"]\([^'\"]*\)['\"]$/\1/p" /etc/openwrt_release | head -n 1)
	fi
	if [ -z "$raw" ] && command -v apk >/dev/null 2>&1; then
		raw=$(apk --print-arch 2>/dev/null)
	fi
	[ -n "$raw" ] || raw=$(uname -m 2>/dev/null)

	case "$raw" in
		x86_64|amd64) detect_amd64_level ;;
		i386*|i486*|i586*|i686*) echo "386" ;;
		aarch64*|arm64) echo "arm64" ;;
		arm_cortex-a5*|arm_cortex-a7*|arm_cortex-a8*|arm_cortex-a9*|arm_cortex-a1[0-9]*|armv7*) echo "armv7" ;;
		arm_arm1176*|armv6*) echo "armv6" ;;
		arm_arm926*|armv5*) echo "armv5" ;;
		mips64el*) echo "mips64le" ;;
		mips64*) echo "mips64" ;;
		mipsel*) echo "mipsle" ;;
		mips*) echo "mips" ;;
		riscv64*) echo "riscv64" ;;
		loongarch64*|loong64*) echo "loong64" ;;
		*) return 1 ;;
	esac
}

normalize_arch() {
	case "$1" in
		auto|'') detect_system_arch ;;
		amd64-compatible|amd64|x86_64) echo "amd64-v1" ;;
		amd64-v1|amd64-v2|amd64-v3|386|arm64|armv7|armv6|armv5|mips|mipsle|mips64|mips64le|riscv64|loong64) echo "$1" ;;
		*) return 1 ;;
	esac
}

map_release_arch() {
	case "$1" in
		amd64-v1) echo "linux-amd64-v1" ;;
		amd64-v2) echo "linux-amd64-v2" ;;
		amd64-v3) echo "linux-amd64-v3" ;;
		386) echo "linux-386" ;;
		arm64) echo "linux-arm64" ;;
		armv7) echo "linux-armv7" ;;
		armv6) echo "linux-armv6" ;;
		armv5) echo "linux-armv5" ;;
		mips) echo "linux-mips-softfloat" ;;
		mipsle) echo "linux-mipsle-softfloat" ;;
		mips64) echo "linux-mips64" ;;
		mips64le) echo "linux-mips64le" ;;
		riscv64) echo "linux-riscv64" ;;
		loong64) echo "linux-loong64-abi2" ;;
		*) return 1 ;;
	esac
}

apply_mirror() {
	url="$1"
	if [ -n "$MIRROR_PREFIX" ]; then
		printf '%s/%s\n' "${MIRROR_PREFIX%/}" "$url"
	else
		printf '%s\n' "$url"
	fi
}

curl_effective_url() {
	curl -fsSL --retry 1 --connect-timeout 15 --max-time 60 \
		-A "MihomoX/OpenWrt" -o /dev/null -w '%{url_effective}' "$1"
}

extract_tag_from_url() {
	url=${1%%\?*}
	url=${url%/}
	tag=${url##*/}
	case "$tag" in
		v[0-9]*) echo "$tag" ;;
		*) return 1 ;;
	esac
}

resolve_latest_version() {
	for latest in "$(apply_mirror "$LATEST_URL")" "$LATEST_URL"; do
		final=$(curl_effective_url "$latest" 2>/dev/null) || continue
		tag=$(extract_tag_from_url "$final" 2>/dev/null) || continue
		echo "$tag"
		return 0
	done

	api_json="$TMP_DIR/release.json"
	for api in "$(apply_mirror "$API_URL")" "$API_URL"; do
		curl -fsSL --retry 1 --connect-timeout 15 --max-time 60 \
			-A "MihomoX/OpenWrt" -o "$api_json" "$api" 2>/dev/null || continue
		tag=$(jsonfilter -q -i "$api_json" -e "@['tag_name']" 2>/dev/null)
		case "$tag" in
			v[0-9]*) echo "$tag"; return 0 ;;
		esac
	done
	return 1
}

download_url() {
	url="$1"
	out="$2"
	for candidate in "$(apply_mirror "$url")" "$url"; do
		rm -f "$out"
		curl -fsSL --retry 2 --connect-timeout 15 --max-time 600 \
			-A "MihomoX/OpenWrt" -o "$out" "$candidate" && {
				DOWNLOADED_URL="$candidate"
				return 0
			}
	done
	return 1
}

sha256_file() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" 2>/dev/null | awk '{print $1}'
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$1" 2>/dev/null | awk '{print $1}'
	else
		return 1
	fi
}

binary_version() {
	"$1" -v 2>/dev/null | awk '{ for (i=1; i<=NF; i++) if ($i ~ /^v[0-9]+([.][0-9]+)+/) { gsub(/[^v0-9.].*$/, "", $i); print $i; exit } }'
}

verify_binary() {
	[ -x "$1" ] || return 1
	version=$(binary_version "$1")
	[ -n "$version" ]
}

metadata_value() {
	key="$1"
	file="$2"
	[ -r "$file" ] || return 1
	sed -n "s/^${key}=//p" "$file" | head -n 1
}

if [ "${1:-}" = "--detect-arch" ]; then
	detect_system_arch || exit 1
	exit 0
fi

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
	lock_pid=$(cat "$LOCK_DIR/pid" 2>/dev/null)
	if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
		log_line "已有内核更新任务运行中"
		exit 2
	fi
	rm -rf "$LOCK_DIR"
	mkdir "$LOCK_DIR" || fail "无法创建更新锁"
fi
LOCK_HELD=1
echo $$ > "$LOCK_DIR/pid"
rm -f "$PENDING_FILE"

TMP_DIR=$(mktemp -d /tmp/mihomox-core.XXXXXX) || fail "无法创建临时目录"
write_status "running" "正在检查最新版本"
log_line "开始更新 Mihomo 内核"

CHANNEL="${MIHOMOX_CHANNEL:-$(uci -q get mihomox.core.channel 2>/dev/null)}"
[ -n "$CHANNEL" ] || CHANNEL="stable"
[ "$CHANNEL" = "stable" ] || fail "不支持的内核通道：$CHANNEL"

ARCH_SETTING="${MIHOMOX_ARCHITECTURE:-$(uci -q get mihomox.core.architecture 2>/dev/null)}"
[ -n "$ARCH_SETTING" ] || ARCH_SETTING="auto"
NORMALIZED_ARCH=$(normalize_arch "$ARCH_SETTING") || fail "无法识别设备架构：$ARCH_SETTING"
SELECTED_ARCH=$(map_release_arch "$NORMALIZED_ARCH") || fail "不支持的设备架构：$NORMALIZED_ARCH"
MIRROR_PREFIX="${MIHOMO_MIRROR_PREFIX:-$(uci -q get mihomox.core.mirror_prefix 2>/dev/null)}"
CUSTOM_URL="${MIHOMO_CUSTOM_URL:-$(uci -q get mihomox.core.download_url 2>/dev/null)}"

ARCHIVE="$TMP_DIR/mihomo.gz"
NEW_BIN="$TMP_DIR/mihomo"
ASSET=""
DOWNLOADED_URL=""

if [ -n "$CUSTOM_URL" ]; then
	LATEST_VERSION="custom"
	ASSET=${CUSTOM_URL##*/}
	write_status "running" "正在下载自定义内核" "$LATEST_VERSION" "$SELECTED_ARCH"
	download_url "$CUSTOM_URL" "$ARCHIVE" || fail "自定义内核下载失败"
else
	LATEST_VERSION=$(resolve_latest_version) || fail "无法获取最新稳定版版本"
	ASSET="mihomo-${SELECTED_ARCH}-${LATEST_VERSION}.gz"
	SOURCE_URL="${DOWNLOAD_BASE%/}/${LATEST_VERSION}/${ASSET}"

	installed_version=$(metadata_value version "$VERSION_FILE" 2>/dev/null)
	installed_arch=$(metadata_value architecture "$VERSION_FILE" 2>/dev/null)
	if [ "$installed_version" = "$LATEST_VERSION" ] && [ "$installed_arch" = "$SELECTED_ARCH" ] && verify_binary "$CORE_PATH"; then
		write_status "success" "当前内核已是最新版本" "$LATEST_VERSION" "$SELECTED_ARCH"
		log_line "当前内核已是最新版本：$LATEST_VERSION ($SELECTED_ARCH)"
		exit 0
	fi

	write_status "running" "正在下载 $LATEST_VERSION" "$LATEST_VERSION" "$SELECTED_ARCH"
	if ! download_url "$SOURCE_URL" "$ARCHIVE"; then
		if [ "$SELECTED_ARCH" = "linux-amd64-v1" ]; then
			ASSET="mihomo-linux-amd64-compatible-${LATEST_VERSION}.gz"
			SOURCE_URL="${DOWNLOAD_BASE%/}/${LATEST_VERSION}/${ASSET}"
			download_url "$SOURCE_URL" "$ARCHIVE" || fail "内核下载失败：$LATEST_VERSION ($SELECTED_ARCH)"
		else
			fail "内核下载失败：$LATEST_VERSION ($SELECTED_ARCH)"
		fi
	fi
fi

gzip -t "$ARCHIVE" >/dev/null 2>&1 || fail "下载文件不是有效的 gzip 归档"
gzip -cd "$ARCHIVE" > "$NEW_BIN" || fail "内核解压失败"
chmod 0755 "$NEW_BIN"
verify_binary "$NEW_BIN" || fail "新内核无法在当前设备运行"
NEW_VERSION=$(binary_version "$NEW_BIN")
[ -n "$NEW_VERSION" ] || fail "无法读取新内核版本"
[ "$LATEST_VERSION" = "custom" ] && LATEST_VERSION="$NEW_VERSION"

SHA256=$(sha256_file "$ARCHIVE")
[ -n "$SHA256" ] || fail "无法计算内核 SHA256"

was_running=0
[ -f "$STARTED_FLAG" ] && was_running=1
had_old=0
had_old_version=0
BACKUP_BIN="$CORE_DIR/.mihomo.backup.$$"
BACKUP_VERSION="$CORE_DIR/.mihomo.version.backup.$$"
CORE_TMP="$CORE_DIR/.mihomo.new.$$"
VERSION_TMP="$CORE_DIR/.mihomo.version.new.$$"

cp "$NEW_BIN" "$CORE_TMP" || fail "无法复制新内核"
chmod 0755 "$CORE_TMP"
verify_binary "$CORE_TMP" || fail "安装前内核校验失败"

if ! cat > "$VERSION_TMP" <<EOF
version=$NEW_VERSION
release=$LATEST_VERSION
architecture=$SELECTED_ARCH
asset=$ASSET
source=$DOWNLOADED_URL
sha256=$SHA256
EOF
then
	rm -f "$CORE_TMP" "$VERSION_TMP"
	fail "无法写入内核版本信息"
fi

if [ -f "$CORE_PATH" ]; then
	had_old=1
	cp -p "$CORE_PATH" "$BACKUP_BIN" || fail "无法备份当前内核"
fi
if [ -f "$VERSION_FILE" ]; then
	had_old_version=1
	cp -p "$VERSION_FILE" "$BACKUP_VERSION" || fail "无法备份当前版本信息"
fi

if ! mv -f "$CORE_TMP" "$CORE_PATH" || ! mv -f "$VERSION_TMP" "$VERSION_FILE" || ! verify_binary "$CORE_PATH"; then
	log_line "安装后校验失败，正在回滚"
	if [ "$had_old" -eq 1 ]; then
		mv -f "$BACKUP_BIN" "$CORE_PATH"
	else
		rm -f "$CORE_PATH"
	fi
	if [ "$had_old_version" -eq 1 ]; then
		mv -f "$BACKUP_VERSION" "$VERSION_FILE"
	else
		rm -f "$VERSION_FILE"
	fi
	fail "内核替换失败，已回滚"
fi

rm -f "$BACKUP_BIN" "$BACKUP_VERSION"
log_line "内核更新完成：$NEW_VERSION ($SELECTED_ARCH)"
write_status "success" "内核更新完成" "$NEW_VERSION" "$SELECTED_ARCH"

if [ "$was_running" -eq 1 ] && [ -x "$INIT_SCRIPT" ]; then
	log_line "重启 MihomoX 使新内核生效"
	"$INIT_SCRIPT" restart >/dev/null 2>&1 || log_line "MihomoX 重启失败，请手动检查服务"
fi

exit 0

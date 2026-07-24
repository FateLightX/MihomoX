#!/bin/sh

set -eu

LATEST_URL="${MIHOMO_LATEST_URL:-https://github.com/MetaCubeX/mihomo/releases/latest}"
ALPHA_ASSETS_URL="${MIHOMO_ALPHA_ASSETS_URL:-https://github.com/MetaCubeX/mihomo/releases/expanded_assets/Prerelease-Alpha}"
DOWNLOAD_BASE="${MIHOMO_DOWNLOAD_BASE:-https://github.com/MetaCubeX/mihomo/releases/download}"
OPENWRT_ARCH=""
AMD64_LEVEL="v1"
DL_DIR=""
OUTPUT=""
VERSION_FILE=""
VERSION="${MIHOMO_VERSION:-}"
CHANNEL="${MIHOMO_CHANNEL:-Prerelease-Alpha}"
MIRROR_PREFIX="${MIHOMO_MIRROR_PREFIX:-}"
MAP_ONLY=0
RESOLVE_ALPHA_ONLY=0

usage() {
	echo "usage: $0 --arch <openwrt-arch> --dl-dir <dir> --output <file> --version-file <file> [--channel release|Prerelease-Alpha] [--amd64-level v1|v2|v3]" >&2
	exit 2
}

while [ "$#" -gt 0 ]; do
	case "$1" in
		--arch) OPENWRT_ARCH="$2"; shift 2 ;;
		--amd64-level) AMD64_LEVEL="$2"; shift 2 ;;
		--dl-dir) DL_DIR="$2"; shift 2 ;;
		--output) OUTPUT="$2"; shift 2 ;;
		--version-file) VERSION_FILE="$2"; shift 2 ;;
		--version) VERSION="$2"; shift 2 ;;
		--channel) CHANNEL="$2"; shift 2 ;;
		--mirror-prefix) MIRROR_PREFIX="$2"; shift 2 ;;
		--latest-url) LATEST_URL="$2"; shift 2 ;;
		--alpha-assets-url) ALPHA_ASSETS_URL="$2"; shift 2 ;;
		--download-base) DOWNLOAD_BASE="$2"; shift 2 ;;
		--map-only) MAP_ONLY=1; shift ;;
		--resolve-alpha-only) RESOLVE_ALPHA_ONLY=1; shift ;;
		*) usage ;;
	esac
done

map_release_arch() {
	case "$1" in
		x86_64|amd64|amd64-compatible)
			case "$AMD64_LEVEL" in
				v1|v2|v3) echo "linux-amd64-$AMD64_LEVEL" ;;
				*) echo "unsupported amd64 level: $AMD64_LEVEL" >&2; return 1 ;;
			esac
			;;
		amd64-v1) echo "linux-amd64-v1" ;;
		amd64-v2) echo "linux-amd64-v2" ;;
		amd64-v3) echo "linux-amd64-v3" ;;
		i386*|i486*|i586*|i686*|386) echo "linux-386" ;;
		aarch64*|arm64) echo "linux-arm64" ;;
		arm_cortex-a5*|arm_cortex-a7*|arm_cortex-a8*|arm_cortex-a9*|arm_cortex-a1[0-9]*|armv7*) echo "linux-armv7" ;;
		arm_arm1176*|armv6*) echo "linux-armv6" ;;
		arm_arm926*|armv5*) echo "linux-armv5" ;;
		mipsel*|mipsle) echo "linux-mipsle-softfloat" ;;
		mips64el*|mips64le) echo "linux-mips64le" ;;
		mips64*) echo "linux-mips64" ;;
		mips*) echo "linux-mips-softfloat" ;;
		riscv64*) echo "linux-riscv64" ;;
		loongarch64*|loong64*) echo "linux-loong64-abi2" ;;
		*) echo "unsupported OpenWrt architecture: $1" >&2; return 1 ;;
	esac
}

sha256_file() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{print $1}'
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$1" | awk '{print $1}'
	else
		echo "sha256sum or shasum is required" >&2
		return 1
	fi
}

resolve_latest_version() {
	final_url=$(curl -fsSL --retry 2 --connect-timeout 20 --max-time 120 \
		-A "MihomoX-Build" -o /dev/null -w '%{url_effective}' "$LATEST_URL") || return 1
	final_url=${final_url%%\?*}
	final_url=${final_url%/}
	tag=${final_url##*/}
	case "$tag" in
		v[0-9]*) printf '%s\n' "$tag" ;;
		*) echo "unable to resolve latest Mihomo version from $final_url" >&2; return 1 ;;
	esac
}

resolve_alpha_asset() {
	assets_tmp="${TMPDIR:-/tmp}/mihomox-alpha-assets.$$"
	trap 'rm -f "$assets_tmp"' EXIT HUP INT TERM
	curl -fsSL --retry 2 --connect-timeout 20 --max-time 120 \
		-A "MihomoX-Build" -o "$assets_tmp" "$ALPHA_ASSETS_URL"
	asset=$(sed -n 's/.*href="\([^"]*\)".*/\1/p' "$assets_tmp" | awk -v prefix="/MetaCubeX/mihomo/releases/download/Prerelease-Alpha/mihomo-${RELEASE_ARCH}-alpha-" '
		index($0, prefix) == 1 && $0 ~ /[.]gz$/ { sub(".*/", ""); print; exit }
	')
	rm -f "$assets_tmp"
	trap - EXIT HUP INT TERM
	[ -n "$asset" ] || {
		echo "unable to resolve Prerelease-Alpha asset for $RELEASE_ARCH" >&2
		return 1
	}
	printf '%s\n' "$asset"
}

verify_elf_arch() {
	file_path="$1"
	release_arch="$2"

	magic=$(dd if="$file_path" bs=1 count=4 2>/dev/null | od -An -tx1 | tr -d ' \n')
	[ "$magic" = "7f454c46" ] || {
		echo "downloaded core is not an ELF binary" >&2
		return 1
	}

	description=$(file -b "$file_path") || return 1
	case "$release_arch:$description" in
		linux-amd64-*:*x86-64*|linux-amd64-*:*x86_64*) ;;
		linux-386:*80386*) ;;
		linux-arm64:*aarch64*|linux-arm64:*ARM64*) ;;
		linux-armv*:*ARM*) ;;
		linux-mipsle*:*MIPS*LSB*|linux-mips64le:*MIPS*LSB*) ;;
		linux-mips*:*MIPS*|linux-mips64:*MIPS*) ;;
		linux-riscv64:*RISC-V*) ;;
		linux-loong64*:*LoongArch*) ;;
		*)
			echo "ELF architecture mismatch: $description" >&2
			return 1
			;;
	esac
}

[ -n "$OPENWRT_ARCH" ] || usage
RELEASE_ARCH=$(map_release_arch "$OPENWRT_ARCH")

case "$CHANNEL" in
	release|stable) CHANNEL="release" ;;
	Prerelease-Alpha|alpha) CHANNEL="Prerelease-Alpha" ;;
	*) echo "unsupported Mihomo channel: $CHANNEL" >&2; exit 1 ;;
esac

if [ "$MAP_ONLY" -eq 1 ]; then
	echo "$RELEASE_ARCH"
	exit 0
fi

if [ "$RESOLVE_ALPHA_ONLY" -eq 1 ]; then
	[ "$CHANNEL" = "Prerelease-Alpha" ] || {
		echo "--resolve-alpha-only requires the Prerelease-Alpha channel" >&2
		exit 2
	}
	resolve_alpha_asset
	exit 0
fi

[ -n "$DL_DIR" ] && [ -n "$OUTPUT" ] && [ -n "$VERSION_FILE" ] || usage
command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }
command -v gzip >/dev/null 2>&1 || { echo "gzip is required" >&2; exit 1; }
command -v file >/dev/null 2>&1 || { echo "file is required" >&2; exit 1; }

if [ -n "$VERSION" ]; then
	case "$VERSION" in
		v[0-9]*) ;;
		*) echo "invalid Mihomo version: $VERSION" >&2; exit 1 ;;
	esac
	RELEASE_TAG="$VERSION"
	ASSET="mihomo-${RELEASE_ARCH}-${VERSION}.gz"
elif [ "$CHANNEL" = "Prerelease-Alpha" ]; then
	RELEASE_TAG="Prerelease-Alpha"
	ASSET=$(resolve_alpha_asset)
	VERSION=${ASSET%.gz}
	VERSION="alpha-${VERSION##*-alpha-}"
else
	VERSION=$(resolve_latest_version)
	RELEASE_TAG="$VERSION"
	ASSET="mihomo-${RELEASE_ARCH}-${VERSION}.gz"
fi

SOURCE_URL="${DOWNLOAD_BASE%/}/${RELEASE_TAG}/${ASSET}"
if [ -n "$MIRROR_PREFIX" ]; then
	SOURCE_URL="${MIRROR_PREFIX%/}/${SOURCE_URL}"
fi

CACHE_DIR="${DL_DIR%/}/mihomox"
CACHE_FILE="$CACHE_DIR/$ASSET"
mkdir -p "$CACHE_DIR" "$(dirname "$OUTPUT")" "$(dirname "$VERSION_FILE")"

if [ -f "$CACHE_FILE" ] && ! gzip -t "$CACHE_FILE" >/dev/null 2>&1; then
	rm -f "$CACHE_FILE"
fi

if [ ! -f "$CACHE_FILE" ]; then
	CACHE_TMP="$CACHE_FILE.tmp.$$"
	trap 'rm -f "$CACHE_TMP"' EXIT HUP INT TERM
	echo "Downloading Mihomo $VERSION ($RELEASE_ARCH)"
	curl -fsSL --retry 2 --connect-timeout 20 --max-time 600 \
		-A "MihomoX-Build" -o "$CACHE_TMP" "$SOURCE_URL"
	gzip -t "$CACHE_TMP"
	mv -f "$CACHE_TMP" "$CACHE_FILE"
	trap - EXIT HUP INT TERM
else
	echo "Using cached Mihomo asset: $ASSET"
fi

OUTPUT_TMP="$OUTPUT.tmp.$$"
VERSION_TMP="$VERSION_FILE.tmp.$$"
trap 'rm -f "$OUTPUT_TMP" "$VERSION_TMP"' EXIT HUP INT TERM
gzip -cd "$CACHE_FILE" > "$OUTPUT_TMP"
chmod 0755 "$OUTPUT_TMP"
verify_elf_arch "$OUTPUT_TMP" "$RELEASE_ARCH"

SHA256=$(sha256_file "$CACHE_FILE")
cat > "$VERSION_TMP" <<EOF
version=$VERSION
channel=$CHANNEL
release=$RELEASE_TAG
architecture=$RELEASE_ARCH
asset=$ASSET
source=$SOURCE_URL
sha256=$SHA256
EOF

mv -f "$OUTPUT_TMP" "$OUTPUT"
mv -f "$VERSION_TMP" "$VERSION_FILE"
trap - EXIT HUP INT TERM

echo "Prepared Mihomo $VERSION ($ASSET, $SHA256)"

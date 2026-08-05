#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
MAKEFILE="${MIHOMO_MAKEFILE:-$ROOT_DIR/mihomox/Makefile}"
REPOSITORY_URL="${MIHOMO_REPOSITORY_URL:-https://github.com/MetaCubeX/mihomo.git}"
SOURCE_BASE="${MIHOMO_SOURCE_BASE:-https://codeload.github.com/MetaCubeX/mihomo/tar.gz}"
SOURCE_VERSION="${MIHOMO_SOURCE_VERSION:-}"
SOURCE_HASH="${MIHOMO_SOURCE_HASH:-}"

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

valid_commit() {
	printf '%s\n' "$1" | awk 'length($0) == 40 && $0 !~ /[^0-9a-f]/ { exit 0 } { exit 1 }'
}

valid_hash() {
	printf '%s\n' "$1" | awk 'length($0) == 64 && $0 !~ /[^0-9a-f]/ { exit 0 } { exit 1 }'
}

if [ -z "$SOURCE_VERSION" ] && [ -z "$SOURCE_HASH" ]; then
	SOURCE_VERSION=''
	for attempt in 1 2 3; do
		SOURCE_VERSION=$(git ls-remote "$REPOSITORY_URL" refs/heads/Alpha 2>/dev/null | awk 'NR == 1 { print $1 }')
		[ -n "$SOURCE_VERSION" ] && break
		[ "$attempt" -eq 3 ] || sleep 2
	done
	valid_commit "$SOURCE_VERSION" || {
		echo "unable to resolve the Mihomo Alpha source commit" >&2
		exit 1
	}

	archive=$(mktemp)
	trap 'rm -f "$archive"' EXIT HUP INT TERM
	curl -fsSL --retry 3 --retry-all-errors --connect-timeout 20 --max-time 300 \
		-A "MihomoX-Build" -o "$archive" "${SOURCE_BASE%/}/$SOURCE_VERSION"
	SOURCE_HASH=$(sha256_file "$archive")
	rm -f "$archive"
	trap - EXIT HUP INT TERM
elif [ -z "$SOURCE_VERSION" ] || [ -z "$SOURCE_HASH" ]; then
	echo "MIHOMO_SOURCE_VERSION and MIHOMO_SOURCE_HASH must be set together" >&2
	exit 2
fi

valid_commit "$SOURCE_VERSION" || { echo "invalid Mihomo source commit" >&2; exit 1; }
valid_hash "$SOURCE_HASH" || { echo "invalid Mihomo source SHA256" >&2; exit 1; }

BUILD_VERSION="alpha-$(printf '%s' "$SOURCE_VERSION" | cut -c 1-7)"
makefile_tmp="$MAKEFILE.tmp.$$"
trap 'rm -f "$makefile_tmp"' EXIT HUP INT TERM
awk -v source="$SOURCE_VERSION" -v build="$BUILD_VERSION" -v hash="$SOURCE_HASH" '
	/^MIHOMO_SOURCE_VERSION:=/ { print "MIHOMO_SOURCE_VERSION:=" source; next }
	/^MIHOMO_BUILD_VERSION:=/ { print "MIHOMO_BUILD_VERSION:=" build; next }
	/^PKG_HASH:=/ { print "PKG_HASH:=" hash; next }
	{ print }
' "$MAKEFILE" > "$makefile_tmp"
mv -f "$makefile_tmp" "$MAKEFILE"
trap - EXIT HUP INT TERM

grep -Fqx "MIHOMO_SOURCE_VERSION:=$SOURCE_VERSION" "$MAKEFILE"
grep -Fqx "MIHOMO_BUILD_VERSION:=$BUILD_VERSION" "$MAKEFILE"
grep -Fqx "PKG_HASH:=$SOURCE_HASH" "$MAKEFILE"

printf 'Resolved Mihomo %s (%s)\n' "$BUILD_VERSION" "$SOURCE_HASH"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
	printf 'source_version=%s\nbuild_version=%s\nsource_hash=%s\n' \
		"$SOURCE_VERSION" "$BUILD_VERSION" "$SOURCE_HASH" >> "$GITHUB_OUTPUT"
fi

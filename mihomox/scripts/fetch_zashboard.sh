#!/bin/sh

set -eu

DL_DIR=""
OUTPUT_DIR=""
ZASHBOARD_URL="${ZASHBOARD_URL:-https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip}"
EXPECTED_SHA256="${ZASHBOARD_SHA256:-}"
EXTRACT_DIR=""
DOWNLOAD_TMP=""

usage() {
	echo "usage: $0 --dl-dir <dir> --output-dir <dir> [--url <url>] [--sha256 <hex>]" >&2
	exit 2
}

cleanup() {
	if [ -n "$DOWNLOAD_TMP" ]; then
		rm -f "$DOWNLOAD_TMP"
	fi
	if [ -n "$EXTRACT_DIR" ]; then
		rm -rf "$EXTRACT_DIR"
	fi
	return 0
}

fail() {
	echo "$*" >&2
	exit 1
}

while [ "$#" -gt 0 ]; do
	case "$1" in
		--dl-dir) DL_DIR="$2"; shift 2 ;;
		--output-dir) OUTPUT_DIR="$2"; shift 2 ;;
		--url) ZASHBOARD_URL="$2"; shift 2 ;;
		--sha256) EXPECTED_SHA256="$2"; shift 2 ;;
		*) usage ;;
	esac
done

[ -n "$DL_DIR" ] && [ -n "$OUTPUT_DIR" ] && [ -n "$ZASHBOARD_URL" ] || usage
case "$OUTPUT_DIR" in /|.|..|'') fail "refusing unsafe output directory: $OUTPUT_DIR" ;; esac
command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v unzip >/dev/null 2>&1 || fail "unzip is required"

trap cleanup EXIT HUP INT TERM

sha256_file() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{print $1}'
	else
		shasum -a 256 "$1" | awk '{print $1}'
	fi
}

sha256_text() {
	if command -v sha256sum >/dev/null 2>&1; then
		printf '%s' "$1" | sha256sum | awk '{print $1}'
	else
		printf '%s' "$1" | shasum -a 256 | awk '{print $1}'
	fi
}

valid_sha256() {
	[ -n "$1" ] || return 1
	printf '%s\n' "$1" | awk 'length($0) == 64 && $0 !~ /[^0-9a-fA-F]/ { exit 0 } { exit 1 }'
}

RESOLVED_URL="$ZASHBOARD_URL"
case "$ZASHBOARD_URL" in
	http://*/releases/latest/download/*|https://*/releases/latest/download/*)
		HEADERS=$(curl -fsSI --retry 2 --connect-timeout 20 --max-time 120 \
			-A "MihomoX-Build" "$ZASHBOARD_URL") || fail "failed to resolve latest Zashboard release"
		LOCATION=$(printf '%s\n' "$HEADERS" | awk 'tolower($1) == "location:" { sub(/\r$/, "", $2); print $2; exit }')
		[ -n "$LOCATION" ] || fail "latest Zashboard release did not return a download location"
		RESOLVED_URL="$LOCATION"
		;;
esac

RELEASE=$(printf '%s\n' "$RESOLVED_URL" | sed -n 's#^.*/releases/download/\([^/]*\)/.*#\1#p')
[ -n "$RELEASE" ] || RELEASE="custom"
SAFE_RELEASE=$(printf '%s' "$RELEASE" | tr -c 'A-Za-z0-9._-' '_')

if [ -n "$EXPECTED_SHA256" ]; then
	valid_sha256 "$EXPECTED_SHA256" || fail "invalid Zashboard SHA256"
else
	REPOSITORY=$(printf '%s\n' "$RESOLVED_URL" | sed -n 's#^https://github.com/\([^/]*/[^/]*\)/releases/download/.*#\1#p')
	ASSET_URL=${RESOLVED_URL%%\?*}
	ASSET=${ASSET_URL##*/}
	[ -n "$REPOSITORY" ] && [ "$RELEASE" != "custom" ] || fail "custom Zashboard URL requires SHA256"
	ASSETS_PAGE="${TMPDIR:-/tmp}/zashboard-assets.$$"
	DOWNLOAD_TMP="$ASSETS_PAGE"
	curl -fsSL --retry 2 --connect-timeout 20 --max-time 120 \
		-A "MihomoX-Build" -o "$ASSETS_PAGE" "https://github.com/$REPOSITORY/releases/expanded_assets/$RELEASE"
	EXPECTED_SHA256=$(awk -v asset="$ASSET" '
		index($0, ">" asset "<") { found=1; next }
		found && index($0, "sha256:") {
			value=$0
			sub(/^.*sha256:/, "", value)
			sub(/[^0-9a-fA-F].*$/, "", value)
			print value
			exit
		}' "$ASSETS_PAGE")
	rm -f "$ASSETS_PAGE"
	DOWNLOAD_TMP=""
	valid_sha256 "$EXPECTED_SHA256" || fail "unable to resolve trusted Zashboard SHA256"
fi
EXPECTED_SHA256=$(printf '%s' "$EXPECTED_SHA256" | tr 'A-F' 'a-f')

CACHE_DIR="${DL_DIR%/}/mihomox/zashboard"
URL_KEY=$(sha256_text "$RESOLVED_URL")
ARCHIVE="$CACHE_DIR/zashboard-${SAFE_RELEASE}-${URL_KEY}-dist.zip"
mkdir -p "$CACHE_DIR" "$(dirname "$OUTPUT_DIR")"

archive_is_valid() {
	unzip -tq "$1" >/dev/null 2>&1 || return 1
	unzip -Z1 "$1" | awk '/^\// || /(^|\/)\.\.(\/|$)/ { bad=1 } END { exit bad }'
}

if [ -s "$ARCHIVE" ]; then
	CACHED_SHA256=$(sha256_file "$ARCHIVE")
	if ! archive_is_valid "$ARCHIVE" || [ "$(printf '%s' "$CACHED_SHA256" | tr 'A-F' 'a-f')" != "$EXPECTED_SHA256" ]; then
		echo "Discarding invalid cached Zashboard archive"
		rm -f "$ARCHIVE"
	fi
fi

if [ ! -s "$ARCHIVE" ]; then
	DOWNLOAD_TMP="$ARCHIVE.tmp.$$"
	echo "Downloading Zashboard $RELEASE"
	curl -fsSL --retry 2 --connect-timeout 20 --max-time 600 \
		-A "MihomoX-Build" -o "$DOWNLOAD_TMP" "$RESOLVED_URL"
	[ -s "$DOWNLOAD_TMP" ] || fail "downloaded Zashboard archive is empty"
	DOWNLOADED_SHA256=$(sha256_file "$DOWNLOAD_TMP")
	[ "$(printf '%s' "$DOWNLOADED_SHA256" | tr 'A-F' 'a-f')" = "$EXPECTED_SHA256" ] || fail "Zashboard SHA256 verification failed"
	archive_is_valid "$DOWNLOAD_TMP" || fail "downloaded Zashboard archive is invalid"
	mv -f "$DOWNLOAD_TMP" "$ARCHIVE"
	DOWNLOAD_TMP=""
else
	echo "Using cached Zashboard: $RELEASE"
fi

EXTRACT_DIR="${OUTPUT_DIR}.extract.$$"
rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
unzip -q "$ARCHIVE" -d "$EXTRACT_DIR"

if [ -f "$EXTRACT_DIR/dist/index.html" ]; then
	SOURCE_DIR="$EXTRACT_DIR/dist"
elif [ -f "$EXTRACT_DIR/index.html" ]; then
	SOURCE_DIR="$EXTRACT_DIR"
else
	fail "Zashboard archive does not contain index.html"
fi

rm -rf "$OUTPUT_DIR"
if [ "$SOURCE_DIR" = "$EXTRACT_DIR" ]; then
	mv "$EXTRACT_DIR" "$OUTPUT_DIR"
	EXTRACT_DIR=""
else
	mv "$SOURCE_DIR" "$OUTPUT_DIR"
	rm -rf "$EXTRACT_DIR"
	EXTRACT_DIR=""
fi

printf '%s\n' "$RELEASE" > "$OUTPUT_DIR/.version"
echo "Prepared Zashboard $RELEASE"

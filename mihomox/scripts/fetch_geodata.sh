#!/bin/sh

set -eu

DL_DIR=""
OUTPUT_DIR=""
GEOSITE_URL="${GEOSITE_URL:-https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geosite.dat}"
GEOIP_MMDB_URL="${GEOIP_MMDB_URL:-https://raw.githubusercontent.com/Loyalsoldier/geoip/release/Country.mmdb}"
GEOIP_DAT_URL="${GEOIP_DAT_URL:-https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geoip.dat}"
GEOIP_ASN_URL="${GEOIP_ASN_URL:-https://github.com/xishang0128/geoip/releases/download/latest/GeoLite2-ASN.mmdb}"

usage() {
	echo "usage: $0 --dl-dir <dir> --output-dir <dir> [--geosite-url <url>] [--geoip-mmdb-url <url>] [--geoip-dat-url <url>] [--geoip-asn-url <url>]" >&2
	exit 2
}

while [ "$#" -gt 0 ]; do
	case "$1" in
		--dl-dir) DL_DIR="$2"; shift 2 ;;
		--output-dir) OUTPUT_DIR="$2"; shift 2 ;;
		--geosite-url) GEOSITE_URL="$2"; shift 2 ;;
		--geoip-mmdb-url) GEOIP_MMDB_URL="$2"; shift 2 ;;
		--geoip-dat-url) GEOIP_DAT_URL="$2"; shift 2 ;;
		--geoip-asn-url) GEOIP_ASN_URL="$2"; shift 2 ;;
		*) usage ;;
	esac
done

[ -n "$DL_DIR" ] && [ -n "$OUTPUT_DIR" ] || usage
command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }

CACHE_DIR="${DL_DIR%/}/mihomox/geodata"
mkdir -p "$CACHE_DIR" "$OUTPUT_DIR"

download() {
	name="$1"
	url="$2"
	cache_file="$CACHE_DIR/$name"

	if [ ! -s "$cache_file" ]; then
		cache_tmp="$cache_file.tmp.$$"
		trap 'rm -f "$cache_tmp"' EXIT HUP INT TERM
		echo "Downloading $name"
		curl -fsSL --retry 2 --connect-timeout 20 --max-time 600 \
			-A "MihomoX-Build" -o "$cache_tmp" "$url"
		[ -s "$cache_tmp" ] || { echo "downloaded $name is empty" >&2; exit 1; }
		mv -f "$cache_tmp" "$cache_file"
		trap - EXIT HUP INT TERM
	else
		echo "Using cached geodata: $name"
	fi

	output_tmp="$OUTPUT_DIR/$name.tmp.$$"
	trap 'rm -f "$output_tmp"' EXIT HUP INT TERM
	cp -f "$cache_file" "$output_tmp"
	mv -f "$output_tmp" "$OUTPUT_DIR/$name"
	trap - EXIT HUP INT TERM
}

download GeoSite.dat "$GEOSITE_URL"
download Country.mmdb "$GEOIP_MMDB_URL"
download GeoIP.dat "$GEOIP_DAT_URL"
download ASN.mmdb "$GEOIP_ASN_URL"

echo "Prepared GeoSite and GeoIP databases"

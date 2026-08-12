#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
FETCH_SCRIPT="$ROOT_DIR/mihomox/scripts/fetch_geodata.sh"
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT HUP INT TERM

SOURCE_DIR="$TEST_DIR/source"
OUTPUT_DIR="$TEST_DIR/output"
mkdir -p "$SOURCE_DIR"

for file in GeoSite.dat Country.mmdb GeoIP.dat ASN.mmdb; do
	printf '%s fixture\n' "$file" > "$SOURCE_DIR/$file"
done

file_url() {
	printf 'file://%s\n' "$SOURCE_DIR/$1"
}

sha256_file() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{print $1}'
	else
		shasum -a 256 "$1" | awk '{print $1}'
	fi
}

GEOSITE_SHA256=$(sha256_file "$SOURCE_DIR/GeoSite.dat")
GEOIP_MMDB_SHA256=$(sha256_file "$SOURCE_DIR/Country.mmdb")
GEOIP_DAT_SHA256=$(sha256_file "$SOURCE_DIR/GeoIP.dat")
GEOIP_ASN_SHA256=$(sha256_file "$SOURCE_DIR/ASN.mmdb")

fetch_fixture() {
	"$FETCH_SCRIPT" \
		--dl-dir "$TEST_DIR/dl" \
		--output-dir "$OUTPUT_DIR" \
		--geosite-url "$(file_url GeoSite.dat)" \
		--geoip-mmdb-url "$(file_url Country.mmdb)" \
		--geoip-dat-url "$(file_url GeoIP.dat)" \
		--geoip-asn-url "$(file_url ASN.mmdb)" \
		--geosite-sha256 "$GEOSITE_SHA256" \
		--geoip-mmdb-sha256 "$GEOIP_MMDB_SHA256" \
		--geoip-dat-sha256 "$GEOIP_DAT_SHA256" \
		--geoip-asn-sha256 "$GEOIP_ASN_SHA256"
}

fetch_fixture

for file in GeoSite.dat Country.mmdb GeoIP.dat ASN.mmdb; do
	cmp "$SOURCE_DIR/$file" "$OUTPUT_DIR/$file"
done

rm -rf "$SOURCE_DIR" "$OUTPUT_DIR"
fetch_fixture

for file in GeoSite.dat Country.mmdb GeoIP.dat ASN.mmdb; do
	[ -s "$OUTPUT_DIR/$file" ]
done

if "$FETCH_SCRIPT" \
	--dl-dir "$TEST_DIR/dl" \
	--output-dir "$OUTPUT_DIR" \
	--geosite-url "file:///unavailable" \
	--geoip-mmdb-url "file:///unavailable" \
	--geoip-dat-url "file:///unavailable" \
	--geoip-asn-url "file:///unavailable" \
	--geosite-sha256 "$GEOSITE_SHA256" \
	--geoip-mmdb-sha256 "$GEOIP_MMDB_SHA256" \
	--geoip-dat-sha256 "$GEOIP_DAT_SHA256" \
	--geoip-asn-sha256 "$GEOIP_ASN_SHA256"; then
	echo "changed unavailable URLs unexpectedly reused cached geodata" >&2
	exit 1
fi

if "$FETCH_SCRIPT" \
	--dl-dir "$TEST_DIR/missing-sha-dl" \
	--output-dir "$TEST_DIR/missing-sha-output" \
	--geosite-url "file:///unavailable" \
	--geosite-sha256 ""; then
	echo "empty GeoData SHA256 unexpectedly succeeded" >&2
	exit 1
fi

grep -Eq '^GEOSITE_SHA256\?=[0-9a-f]{64}$' "$ROOT_DIR/mihomox/Makefile"
grep -Eq '^GEOIP_MMDB_SHA256\?=[0-9a-f]{64}$' "$ROOT_DIR/mihomox/Makefile"
grep -Eq '^GEOIP_DAT_SHA256\?=[0-9a-f]{64}$' "$ROOT_DIR/mihomox/Makefile"
grep -Eq '^GEOIP_ASN_SHA256\?=[0-9a-f]{64}$' "$ROOT_DIR/mihomox/Makefile"
grep -Eq '^GEOSITE_URL\?=https://raw[.]githubusercontent[.]com/MetaCubeX/meta-rules-dat/[0-9a-f]{40}/geosite[.]dat$' "$ROOT_DIR/mihomox/Makefile"
grep -Eq '^GEOIP_MMDB_URL\?=https://raw[.]githubusercontent[.]com/Loyalsoldier/geoip/[0-9a-f]{40}/Country[.]mmdb$' "$ROOT_DIR/mihomox/Makefile"
grep -Eq '^GEOIP_DAT_URL\?=https://raw[.]githubusercontent[.]com/MetaCubeX/meta-rules-dat/[0-9a-f]{40}/geoip[.]dat$' "$ROOT_DIR/mihomox/Makefile"
grep -Eq '^GEOIP_ASN_URL\?=https://raw[.]githubusercontent[.]com/xishang0128/geoip/[0-9a-f]{40}/GeoLite2-ASN[.]mmdb$' "$ROOT_DIR/mihomox/Makefile"

echo "fetch geodata tests passed"

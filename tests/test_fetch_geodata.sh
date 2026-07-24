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

"$FETCH_SCRIPT" \
	--dl-dir "$TEST_DIR/dl" \
	--output-dir "$OUTPUT_DIR" \
	--geosite-url "$(file_url GeoSite.dat)" \
	--geoip-mmdb-url "$(file_url Country.mmdb)" \
	--geoip-dat-url "$(file_url GeoIP.dat)" \
	--geoip-asn-url "$(file_url ASN.mmdb)"

for file in GeoSite.dat Country.mmdb GeoIP.dat ASN.mmdb; do
	cmp "$SOURCE_DIR/$file" "$OUTPUT_DIR/$file"
done

rm -rf "$SOURCE_DIR" "$OUTPUT_DIR"
"$FETCH_SCRIPT" \
	--dl-dir "$TEST_DIR/dl" \
	--output-dir "$OUTPUT_DIR" \
	--geosite-url "$(file_url GeoSite.dat)" \
	--geoip-mmdb-url "$(file_url Country.mmdb)" \
	--geoip-dat-url "$(file_url GeoIP.dat)" \
	--geoip-asn-url "$(file_url ASN.mmdb)"

for file in GeoSite.dat Country.mmdb GeoIP.dat ASN.mmdb; do
	[ -s "$OUTPUT_DIR/$file" ]
done

if "$FETCH_SCRIPT" \
	--dl-dir "$TEST_DIR/dl" \
	--output-dir "$OUTPUT_DIR" \
	--geosite-url "file:///unavailable" \
	--geoip-mmdb-url "file:///unavailable" \
	--geoip-dat-url "file:///unavailable" \
	--geoip-asn-url "file:///unavailable"; then
	echo "changed unavailable URLs unexpectedly reused cached geodata" >&2
	exit 1
fi

echo "fetch geodata tests passed"

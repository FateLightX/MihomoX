#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
FETCH_SCRIPT="$ROOT_DIR/mihomox/scripts/fetch_zashboard.sh"
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT HUP INT TERM

SOURCE_DIR="$TEST_DIR/source"
ARCHIVE="$TEST_DIR/dist.zip"
OUTPUT_DIR="$TEST_DIR/output"
mkdir -p "$SOURCE_DIR/dist/assets"
printf '<!doctype html><title>Zashboard</title>\n' > "$SOURCE_DIR/dist/index.html"
printf 'fixture\n' > "$SOURCE_DIR/dist/assets/app.js"

(cd "$SOURCE_DIR" && zip -qr "$ARCHIVE" dist)
if command -v sha256sum >/dev/null 2>&1; then
	ARCHIVE_SHA256=$(sha256sum "$ARCHIVE" | awk '{print $1}')
else
	ARCHIVE_SHA256=$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')
fi

"$FETCH_SCRIPT" \
	--dl-dir "$TEST_DIR/dl" \
	--output-dir "$OUTPUT_DIR" \
	--url "file://$ARCHIVE" \
	--sha256 "$ARCHIVE_SHA256"

cmp "$SOURCE_DIR/dist/index.html" "$OUTPUT_DIR/index.html"
cmp "$SOURCE_DIR/dist/assets/app.js" "$OUTPUT_DIR/assets/app.js"
[ "$(cat "$OUTPUT_DIR/.version")" = "custom" ]
[ ! -e "$OUTPUT_DIR/dist" ]

rm -rf "$SOURCE_DIR" "$ARCHIVE" "$OUTPUT_DIR"
"$FETCH_SCRIPT" \
	--dl-dir "$TEST_DIR/dl" \
	--output-dir "$OUTPUT_DIR" \
	--url "file://$ARCHIVE" \
	--sha256 "$ARCHIVE_SHA256"

[ -s "$OUTPUT_DIR/index.html" ]
[ -s "$OUTPUT_DIR/assets/app.js" ]

if "$FETCH_SCRIPT" \
	--dl-dir "$TEST_DIR/dl" \
	--output-dir "$OUTPUT_DIR" \
	--url "file:///unavailable" \
	--sha256 "$ARCHIVE_SHA256"; then
	echo "changed unavailable URL unexpectedly reused cached Zashboard" >&2
	exit 1
fi

echo "fetch Zashboard tests passed"

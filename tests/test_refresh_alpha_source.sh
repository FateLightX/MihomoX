#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
SCRIPT="$ROOT_DIR/mihomox/scripts/refresh_alpha_source.sh"
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT HUP INT TERM

repo="$TEST_DIR/repo"
mkdir -p "$repo"
git -C "$repo" init -q
git -C "$repo" config user.name test
git -C "$repo" config user.email test@example.invalid
printf 'alpha\n' > "$repo/source.txt"
git -C "$repo" add source.txt
git -C "$repo" commit -qm alpha
git -C "$repo" branch -M Alpha
commit=$(git -C "$repo" rev-parse HEAD)
short=$(printf '%s' "$commit" | cut -c 1-7)

mkdir -p "$TEST_DIR/source"
printf 'source archive\n' > "$TEST_DIR/source/$commit"
hash=$(sha256_file="$TEST_DIR/source/$commit"; shasum -a 256 "$sha256_file" | awk '{print $1}')

cat > "$TEST_DIR/Makefile" <<'EOF'
MIHOMO_SOURCE_VERSION:=0000000000000000000000000000000000000000
MIHOMO_BUILD_VERSION:=alpha-0000000
PKG_HASH:=0000000000000000000000000000000000000000000000000000000000000000
EOF

GITHUB_OUTPUT="$TEST_DIR/output" \
MIHOMO_MAKEFILE="$TEST_DIR/Makefile" \
MIHOMO_REPOSITORY_URL="$repo" \
MIHOMO_SOURCE_BASE="file://$TEST_DIR/source" \
	"$SCRIPT"

grep -Fqx "MIHOMO_SOURCE_VERSION:=$commit" "$TEST_DIR/Makefile"
grep -Fqx "MIHOMO_BUILD_VERSION:=alpha-$short" "$TEST_DIR/Makefile"
grep -Fqx "PKG_HASH:=$hash" "$TEST_DIR/Makefile"
grep -Fqx "source_version=$commit" "$TEST_DIR/output"
grep -Fqx "build_version=alpha-$short" "$TEST_DIR/output"
grep -Fqx "source_hash=$hash" "$TEST_DIR/output"

echo "refresh Alpha source tests passed"

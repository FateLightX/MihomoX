#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
UPDATE_SCRIPT="$ROOT_DIR/mihomox/files/scripts/update_core.sh"
TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/mihomox-update-test.XXXXXX")

cleanup() {
	rm -rf "$TEST_DIR"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$TEST_DIR/bin" "$TEST_DIR/core" "$TEST_DIR/run" "$TEST_DIR/log"

cat > "$TEST_DIR/bin/uci" <<'EOF'
#!/bin/sh
exit 1
EOF
chmod 0755 "$TEST_DIR/bin/uci"

write_core() {
	path="$1"
	version="$2"
	cat > "$path" <<EOF
#!/bin/sh
echo "Mihomo Meta $version"
EOF
	chmod 0755 "$path"
}

run_update() {
	channel="$1"
	url="$2"
	sha256="${3-}"
	PATH="$TEST_DIR/bin:$PATH" \
	MIHOMOX_CORE_DIR="$TEST_DIR/core" \
	MIHOMOX_RUN_DIR="$TEST_DIR/run" \
	MIHOMOX_LOG_DIR="$TEST_DIR/log" \
	MIHOMOX_INIT_SCRIPT="$TEST_DIR/init" \
	MIHOMOX_CHANNEL="$channel" \
	MIHOMOX_ARCHITECTURE=amd64-v1 \
	MIHOMO_CUSTOM_URL="$url" \
	MIHOMO_CUSTOM_SHA256="$sha256" \
	sh "$UPDATE_SCRIPT"
}

sha256_file() {
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$1" | awk '{print $1}'
	else
		shasum -a 256 "$1" | awk '{print $1}'
	fi
}

detect_arch() {
	PATH="$TEST_DIR/bin:$PATH" \
	MIHOMOX_CORE_DIR="$TEST_DIR/core" \
	MIHOMOX_RUN_DIR="$TEST_DIR/run" \
	MIHOMOX_LOG_DIR="$TEST_DIR/log" \
	MIHOMOX_SYSTEM_ARCH=x86_64 \
	MIHOMOX_CPU_FLAGS="$1" \
	sh "$UPDATE_SCRIPT" --detect-arch
}

[ "$(detect_arch 'sse2')" = "amd64-v1" ]
[ "$(detect_arch 'lahf_lm cx16 popcnt pni ssse3 sse4_1 sse4_2')" = "amd64-v2" ]
[ "$(detect_arch 'lahf_lm cx16 popcnt pni ssse3 sse4_1 sse4_2 avx avx2 bmi1 bmi2 fma movbe xsave abm')" = "amd64-v3" ]

write_core "$TEST_DIR/core/mihomo" "v1.0.0"
write_core "$TEST_DIR/new-mihomo" "v9.9.9"
gzip -c "$TEST_DIR/new-mihomo" > "$TEST_DIR/new-mihomo.gz"
NEW_CORE_SHA256=$(sha256_file "$TEST_DIR/new-mihomo.gz")

run_update release "file://$TEST_DIR/new-mihomo.gz" "$NEW_CORE_SHA256"
"$TEST_DIR/core/mihomo" -v | grep -q 'v9.9.9'
grep -q '^version=v9.9.9$' "$TEST_DIR/core/mihomo.version"
grep -q '^state=success$' "$TEST_DIR/run/core-update.status"
grep -Eq '^updated_at=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$' "$TEST_DIR/run/core-update.status"

run_update Prerelease-Alpha "file://$TEST_DIR/new-mihomo.gz" "$NEW_CORE_SHA256"
grep -q '^channel=Prerelease-Alpha$' "$TEST_DIR/core/mihomo.version"
grep -q '^state=success$' "$TEST_DIR/run/core-update.status"

write_core "$TEST_DIR/core/mihomo" "v1.0.0"
printf 'version=v1.0.0\narchitecture=linux-amd64-v1\n' > "$TEST_DIR/core/mihomo.version"
cat > "$TEST_DIR/bin/mv" <<EOF
#!/bin/sh
case "\$1:\$2" in
	-f:$TEST_DIR/core/.mihomo.version.new.*) exit 1 ;;
esac
exec /bin/mv "\$@"
EOF
chmod 0755 "$TEST_DIR/bin/mv"
if run_update Prerelease-Alpha "file://$TEST_DIR/new-mihomo.gz" "$NEW_CORE_SHA256"; then
	echo "failed metadata install unexpectedly succeeded" >&2
	exit 1
fi
"$TEST_DIR/core/mihomo" -v | grep -q 'v1.0.0'
grep -q '^version=v1.0.0$' "$TEST_DIR/core/mihomo.version"

write_core "$TEST_DIR/core/mihomo" "v1.0.0"
printf 'not gzip\n' > "$TEST_DIR/invalid.gz"
INVALID_SHA256=$(sha256_file "$TEST_DIR/invalid.gz")
if run_update release "file://$TEST_DIR/invalid.gz" "$INVALID_SHA256"; then
	echo "invalid archive unexpectedly succeeded" >&2
	exit 1
fi
"$TEST_DIR/core/mihomo" -v | grep -q 'v1.0.0'
grep -q '^state=failed$' "$TEST_DIR/run/core-update.status"
grep -Eq '^updated_at=[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$' "$TEST_DIR/run/core-update.status"

if run_update release "file://$TEST_DIR/new-mihomo.gz" "0000000000000000000000000000000000000000000000000000000000000000"; then
	echo "incorrect SHA256 unexpectedly succeeded" >&2
	exit 1
fi
grep -q '^state=failed$' "$TEST_DIR/run/core-update.status"

echo "runtime core update tests passed"

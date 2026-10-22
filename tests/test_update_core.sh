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

printf 'pending\n' > "$TEST_DIR/run/core-update.pending"
[ "$(detect_arch 'sse2')" = "amd64-v1" ]
[ -f "$TEST_DIR/run/core-update.pending" ]
rm "$TEST_DIR/run/core-update.pending"
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

# A restart returning zero is insufficient if no service is running afterwards.
cat > "$TEST_DIR/init" <<'EOF'
#!/bin/sh
case "$1" in
 running) [ ! -f "$MIHOMOX_RUN_DIR/restart-attempted" ] ;;
 restart) touch "$MIHOMOX_RUN_DIR/restart-attempted"; exit 0 ;;
esac
EOF
chmod 0755 "$TEST_DIR/init"
write_core "$TEST_DIR/core/mihomo" "v1.0.0"
printf 'version=v1.0.0\n' > "$TEST_DIR/core/mihomo.version"
if run_update release "file://$TEST_DIR/new-mihomo.gz" "$NEW_CORE_SHA256"; then
	echo "restart without a running process unexpectedly succeeded" >&2
	exit 1
fi
grep -q '^state=restart_failed$' "$TEST_DIR/run/core-update.status"
grep -q '^message=内核已更新，但 MihomoX 重启失败$' "$TEST_DIR/run/core-update.status"
for backup in "$TEST_DIR/core"/.mihomo.backup.*; do
	"$backup" -v | grep -q v1.0.0
done
for backup in "$TEST_DIR/core"/.mihomo.version.backup.*; do
	grep -q '^version=v1.0.0$' "$backup"
done
rm -f "$TEST_DIR/core"/.mihomo*backup.* "$TEST_DIR/run/restart-attempted"

# Explicit restart failures also keep the backup; healthy restarts remove it.
cat > "$TEST_DIR/init" <<'EOF'
#!/bin/sh
case "$1" in
 running) exit 0 ;;
 restart) exit 1 ;;
esac
EOF
if run_update release "file://$TEST_DIR/new-mihomo.gz" "$NEW_CORE_SHA256"; then
	echo "restart failure unexpectedly succeeded" >&2
	exit 1
fi
grep -q '^state=restart_failed$' "$TEST_DIR/run/core-update.status"
[ -f "$(echo "$TEST_DIR/core"/.mihomo.backup.*)" ]
rm -f "$TEST_DIR/core"/.mihomo*backup.*
cat > "$TEST_DIR/init" <<'EOF'
#!/bin/sh
case "$1" in
 running) exit 0 ;;
 restart) touch "$MIHOMOX_RUN_DIR/restart-attempted"; exit 0 ;;
esac
EOF
run_update release "file://$TEST_DIR/new-mihomo.gz" "$NEW_CORE_SHA256"
grep -q '^state=success$' "$TEST_DIR/run/core-update.status"
[ -f "$TEST_DIR/run/restart-attempted" ]
for backup in "$TEST_DIR/core"/.mihomo*backup.*; do [ ! -e "$backup" ]; done
rm "$TEST_DIR/run/restart-attempted"

# A stale started flag must not start a previously stopped service.
cat > "$TEST_DIR/init" <<'EOF'
#!/bin/sh
case "$1" in
 running) exit 1 ;;
 restart) touch "$MIHOMOX_RUN_DIR/restart-attempted" ;;
esac
EOF
touch "$TEST_DIR/run/started.flag"
run_update release "file://$TEST_DIR/new-mihomo.gz" "$NEW_CORE_SHA256"
[ ! -e "$TEST_DIR/run/restart-attempted" ]
rm -f "$TEST_DIR/run/started.flag" "$TEST_DIR/init"

grep -q '^interrupted() {' "$UPDATE_SCRIPT"
grep -q 'write_status "failed" "内核更新已中断"' "$UPDATE_SCRIPT"
grep -q 'trap interrupted HUP INT TERM' "$UPDATE_SCRIPT"

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

# Exercise the real candidate loops without network access.
(
	eval "$(sed -n '/^apply_mirror() {/,/^sha256_file() {/p' "$UPDATE_SCRIPT" | sed '$d')"
	TMP_DIR="$TEST_DIR"
	LATEST_URL=https://example.test/latest
	API_URL=https://example.test/api
	ALPHA_ASSETS_URL=https://example.test/alpha
	curl() {
		for arg in "$@"; do last_arg="$arg"; done
		printf '%s\n' "$last_arg" >> "$TEST_DIR/requests"
		return 1
	}
	for MIRROR_PREFIX in '' https://mirror.test; do
		: > "$TEST_DIR/requests"
		resolve_latest_version && exit 1
		resolve_alpha_asset && exit 1
		download_url https://example.test/core "$TEST_DIR/download" && exit 1
		if [ -z "$MIRROR_PREFIX" ]; then expected=4; else expected=8; fi
		[ "$(wc -l < "$TEST_DIR/requests" | tr -d ' ')" = "$expected" ]
		[ "$(sort -u "$TEST_DIR/requests" | wc -l | tr -d ' ')" = "$expected" ]
	done
)
echo "runtime core update tests passed"

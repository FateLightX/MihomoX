#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/mihomox-cache-paths.XXXXXX")
trap 'rm -rf "$TEST_DIR"' EXIT

mkdir -p "$TEST_DIR/log" "$TEST_DIR/run" "$TEST_DIR/tmp"
printf 'legacy-cache\n' > "$TEST_DIR/run/cache.db"

(
	. "$ROOT_DIR/mihomox/files/scripts/include.sh"
	LOG_DIR="$TEST_DIR/log"
	APP_LOG_PATH="$LOG_DIR/app.log"
	TEMP_DIR="$TEST_DIR/tmp"
	RUN_DIR="$TEST_DIR/run"
	CACHE_DB_PATH="$TEMP_DIR/cache.db"
	CACHE_MOUNT_PATH="$RUN_DIR/cache.db"
	CACHE_SNAPSHOT_PATH="$TEST_DIR/cache.snapshot"
	prepare_cache
	[ "$(cat "$CACHE_DB_PATH")" = 'legacy-cache' ]
	[ -e "$CACHE_MOUNT_PATH" ]
	[ "$(readlink "$CACHE_MOUNT_PATH" 2>/dev/null || true)" = "$CACHE_DB_PATH" ] || \
		[ "$(cat "$CACHE_MOUNT_PATH")" = 'legacy-cache' ]
	printf 'saved-selection\n' > "$CACHE_DB_PATH"
	cp_calls=0
	cp() {
		cp_calls=$((cp_calls + 1))
		command cp "$@"
	}
	persist_cache_snapshot
	persist_cache_snapshot
	[ "$cp_calls" -eq 1 ]
	[ "$(cat "$CACHE_SNAPSHOT_PATH")" = 'saved-selection' ]
	cleanup_cache
	rm -f "$CACHE_MOUNT_PATH" "$CACHE_DB_PATH"
	prepare_cache
	[ "$(cat "$CACHE_DB_PATH")" = 'saved-selection' ]
	cleanup_cache
)

echo 'cache path tests passed'

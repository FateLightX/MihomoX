#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/mihomox-log-trim.XXXXXX")
trap 'rm -rf "$TEST_DIR"' EXIT HUP INT TERM

(
	. "$ROOT_DIR/mihomox/files/scripts/include.sh"
	LOG_DIR="$TEST_DIR/log"
	APP_LOG_PATH="$LOG_DIR/app.log"
	CORE_LOG_PATH="$LOG_DIR/core.log"
	mkdir -p "$LOG_DIR"
	printf '0123456789abcdefghijklmnopqrstuvwxyz' > "$APP_LOG_PATH"
	printf 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' > "$CORE_LOG_PATH"

	app_inode=$(ls -i "$APP_LOG_PATH" | awk '{print $1}')
	core_inode=$(ls -i "$CORE_LOG_PATH" | awk '{print $1}')
	trim_log_file "$APP_LOG_PATH" 20 10
	trim_log_file "$CORE_LOG_PATH" 20 8

	[ "$(cat "$APP_LOG_PATH")" = 'qrstuvwxyz' ]
	[ "$(cat "$CORE_LOG_PATH")" = '23456789' ]
	[ "$(ls -i "$APP_LOG_PATH" | awk '{print $1}')" = "$app_inode" ]
	[ "$(ls -i "$CORE_LOG_PATH" | awk '{print $1}')" = "$core_inode" ]
)

echo 'runtime log trim tests passed'

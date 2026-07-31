#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SOURCE="$ROOT_DIR/mihomox/src/mihomox-stun.c"
MAKEFILE="$ROOT_DIR/mihomox/Makefile"

[ -f "$SOURCE" ]
grep -q 'mihomox-stun' "$MAKEFILE"
grep -q '/usr/libexec/mihomox/stun-test' "$MAKEFILE"

if command -v cc >/dev/null 2>&1; then
    binary=$(mktemp "${TMPDIR:-/tmp}/mihomox-stun.XXXXXX")
    trap 'rm -f "$binary"' EXIT HUP INT TERM
    cc -std=c99 -Wall -Wextra -Werror -O2 -o "$binary" "$SOURCE"
    "$binary" --self-test | grep -q '"success":true'
fi

echo "STUN helper tests passed"

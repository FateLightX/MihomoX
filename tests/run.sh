#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

for file in $(find "$ROOT_DIR" -type f \( -name '*.sh' -o -name '*.init' \) | sort); do
	sh -n "$file"
done

"$ROOT_DIR/tests/test_fetch_arch.sh"
"$ROOT_DIR/tests/test_update_core.sh"

echo "all tests passed"

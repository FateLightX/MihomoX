#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

for file in $(find "$ROOT_DIR" -type f \( -name '*.sh' -o -name '*.init' \) | sort); do
	sh -n "$file"
done

"$ROOT_DIR/tests/test_fetch_arch.sh"
"$ROOT_DIR/tests/test_release_support.sh"
"$ROOT_DIR/tests/test_fetch_geodata.sh"
"$ROOT_DIR/tests/test_fetch_zashboard.sh"
"$ROOT_DIR/tests/test_update_core.sh"
"$ROOT_DIR/tests/test_security_helpers.sh"
"$ROOT_DIR/tests/test_default_settings.sh"
"$ROOT_DIR/tests/test_stun_helper.sh"
node "$ROOT_DIR/tests/test_luci_core_update.js"
node "$ROOT_DIR/tests/test_luci_editor.js"
node "$ROOT_DIR/tests/test_mixin_generator.js"
node "$ROOT_DIR/tests/test_luci_mixin.js"
node "$ROOT_DIR/tests/test_luci_profile.js"
node "$ROOT_DIR/tests/test_luci_logs.js"
node "$ROOT_DIR/tests/test_luci_network.js"
node "$ROOT_DIR/tests/test_luci_writefile.js"
node "$ROOT_DIR/tests/test_security_acl.js"

echo "all tests passed"

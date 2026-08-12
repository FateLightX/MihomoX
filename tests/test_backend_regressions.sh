#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
INIT_SCRIPT="$ROOT_DIR/mihomox/files/mihomox.init"
INCLUDE_SCRIPT="$ROOT_DIR/mihomox/files/scripts/include.sh"

# Subscription failures must preserve the last known metadata and return non-zero.
awk '
/^update_subscription\(\)/ { in_fn = 1 }
in_fn { block = block $0 "\n" }
in_fn && /^}/ { exit }
END {
	if (block ~ /# reset subscription info/)
		exit 1
	if (block !~ /Replace metadata only after the new subscription has been validated/)
		exit 1
	if (block !~ /\[ "\$success" = 1 \]/)
		exit 1
}
' "$INIT_SCRIPT"

# Runtime routing cleanup must use saved parameters and avoid flushing shared tables.
grep -q 'ROUTING_STATE_PATH="$TEMP_DIR/routing.state"' "$INCLUDE_SCRIPT"
grep -q 'mv -f "$routing_state_tmp" "$ROUTING_STATE_PATH"' "$INIT_SCRIPT"
grep -q 'ip -4 rule del pref "$tproxy_rule_pref" fwmark "$tproxy_fw_mark/$tproxy_fw_mask" table "$tproxy_route_table"' "$INIT_SCRIPT"
grep -q 'ip -6 route del "$fake_ip6_range" dev "$dummy_device"' "$INIT_SCRIPT"
if grep -q 'route flush table' "$INIT_SCRIPT"; then
	echo "routing cleanup must not flush whole route tables" >&2
	exit 1
fi

echo "backend regression tests passed"

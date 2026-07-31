#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CONFIG="$ROOT_DIR/mihomox/files/mihomox.conf"
INIT_DEFAULTS="$ROOT_DIR/mihomox/files/uci-defaults/init.sh"
INIT_SCRIPT="$ROOT_DIR/mihomox/files/mihomox.init"

grep -q "option 'fast_reload' '1'" "$CONFIG"
grep -q "option 'unify_delay' '1'" "$CONFIG"
grep -q "option 'tcp_concurrent' '1'" "$CONFIG"
grep -q "option 'authentication' '1'" "$CONFIG"
grep -q "option 'password' '2333'" "$CONFIG"
grep -q "option 'dns_cache_algorithm' 'arc'" "$CONFIG"
grep -q "option 'fake_ip_filter' '1'" "$CONFIG"
grep -q "option 'hosts' '1'" "$CONFIG"
grep -q "option 'sniffer' '1'" "$CONFIG"
grep -q "option 'sniffer_sniff_dns_mapping' '1'" "$CONFIG"
grep -q "option 'sniffer_sniff' '1'" "$CONFIG"
grep -q "option 'geoip_format' 'mmdb'" "$CONFIG"
grep -q "option 'geodata_loader' 'standard'" "$CONFIG"
grep -q "option 'geox_auto_update' '1'" "$CONFIG"
grep -q "option 'geox_update_interval' '72'" "$CONFIG"
grep -q 'config_get_bool fast_reload "procd" "fast_reload" 1' "$INIT_SCRIPT"

awk '
function finish_block() {
	if (block ~ /option '\''protocol'\'' '\''HTTP'\''/ && block ~ /option '\''enabled'\'' '\''1'\''/) http = 1
	if (block ~ /option '\''protocol'\'' '\''TLS'\''/ && block ~ /option '\''enabled'\'' '\''1'\''/) tls = 1
	if (block ~ /option '\''protocol'\'' '\''QUIC'\''/ && block ~ /option '\''enabled'\'' '\''1'\''/) quic = 1
}
/^config sniff$/ { if (in_sniff) finish_block(); in_sniff = 1; block = ""; next }
in_sniff { block = block $0 "\n" }
END { if (in_sniff) finish_block(); exit !(http && tls && quic) }
' "$CONFIG"

if grep -q 'auth_password=$(generate_secret)' "$INIT_DEFAULTS"; then
	echo "uci-defaults must preserve the configured authentication password" >&2
	exit 1
fi

echo "default settings tests passed"

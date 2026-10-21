#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CONFIG="$ROOT_DIR/mihomox/files/mihomox.conf"
INIT_DEFAULTS="$ROOT_DIR/mihomox/files/uci-defaults/init.sh"
INIT_SCRIPT="$ROOT_DIR/mihomox/files/mihomox.init"
INCLUDE_SCRIPT="$ROOT_DIR/mihomox/files/scripts/include.sh"
MIGRATE="$ROOT_DIR/mihomox/files/uci-defaults/migrate.sh"

grep -q "option 'fast_reload' '1'" "$CONFIG"
grep -q "option 'env_disable_quic_go_ecn' '1'" "$CONFIG"
grep -q "option 'unify_delay' '1'" "$CONFIG"
grep -q "option 'tcp_concurrent' '1'" "$CONFIG"
grep -q "option 'authentication' '1'" "$CONFIG"
grep -q "option 'tun_enabled' '1'" "$CONFIG"
# Upstream changed the default TUN stack to mips (Alpha 63bd52ec/88dcbf7f).
grep -q "option 'tun_stack' 'mips'" "$CONFIG"
grep -q "option 'tcp_mode' 'tproxy'" "$CONFIG"
grep -q "option 'udp_mode' 'tun'" "$CONFIG"
grep -q "option 'password' '2333'" "$CONFIG"
grep -q "option 'api_secret' '2333'" "$CONFIG"
grep -q "option 'start_delay' '10'" "$CONFIG"
grep -q "option 'dns_cache_algorithm' 'arc'" "$CONFIG"
grep -q "option 'fake_ip_filter' '1'" "$CONFIG"
grep -q "option 'fake_ip_filter_mode' 'blacklist'" "$CONFIG"
grep -q "option 'fake_ip_cache' '0'" "$CONFIG"
grep -q "option 'fake_ip6_range' 'fc00::/18'" "$CONFIG"
grep -q "list 'fake_ip_filters' '+.gstatic.com'" "$CONFIG"
grep -q "list 'fake_ip_filters' '+.miwifi.com'" "$CONFIG"
grep -q "list 'fake_ip_filters' '+.market.xiaomi.com'" "$CONFIG"
grep -q "list 'fake_ip_filters' '+.push.apple.com'" "$CONFIG"
grep -q "option 'hosts' '1'" "$CONFIG"
grep -q "option 'sniffer' '1'" "$CONFIG"
grep -q "option 'sniffer_sniff_dns_mapping' '1'" "$CONFIG"
grep -q "option 'sniffer_ignore_domain_name' '1'" "$CONFIG"
grep -q "list 'sniffer_ignore_domain_names' '+.lan'" "$CONFIG"
grep -q "list 'sniffer_ignore_domain_names' '+.local'" "$CONFIG"
grep -q "list 'sniffer_ignore_domain_names' 'Mijia Cloud'" "$CONFIG"
grep -q "list 'sniffer_ignore_domain_names' '+.push.apple.com'" "$CONFIG"
grep -q "option 'sniffer_sniff' '1'" "$CONFIG"
grep -q "option 'geoip_format' 'mmdb'" "$CONFIG"
grep -q "option 'geodata_loader' 'standard'" "$CONFIG"
grep -q "option 'geox_auto_update' '1'" "$CONFIG"
grep -q "option 'geox_update_interval' '72'" "$CONFIG"
grep -q "option 'bypass_china_mainland_ip' '1'" "$CONFIG"
grep -q "option 'bypass_china_mainland_ip6' '1'" "$CONFIG"
grep -q "option 'china_ip_update' '1'" "$CONFIG"
grep -q "option 'china_ip_update_cron' '0 4 \* \* 1'" "$CONFIG"
grep -q "option 'china_ip_url' 'https://raw.githubusercontent.com/gaoyifan/china-operator-ip/refs/heads/ip-lists/china.txt'" "$CONFIG"
grep -q "option 'china_ip6_url' 'https://raw.githubusercontent.com/gaoyifan/china-operator-ip/refs/heads/ip-lists/china6.txt'" "$CONFIG"
grep -q "option 'network_test_fw_mark' '0x82'" "$CONFIG"
grep -q 'config_get_bool fast_reload "procd" "fast_reload" 1' "$INIT_SCRIPT"
grep -q 'RUN_PROFILE_PATH="$TEMP_DIR/config.yaml"' "$INCLUDE_SCRIPT"
grep -q 'CACHE_DB_PATH="$TEMP_DIR/cache.db"' "$INCLUDE_SCRIPT"
grep -q -- '-f "$RUN_PROFILE_PATH"' "$INIT_SCRIPT"
grep -q 'CACHE_SNAPSHOT_PATH="$HOME_DIR/cache.snapshot"' "$INCLUDE_SCRIPT"

cron_guard_count=$(grep -c 'if grep -q "#mihomox" "/etc/crontabs/root"; then' "$INIT_SCRIPT")
[ "$cron_guard_count" -eq 2 ]
# crond rescans /etc/crontabs on its own, so MihomoX must not restart the shared
# cron service; reload_service() re-runs this block on every reload.
if grep -q '/etc/init.d/cron' "$INIT_SCRIPT"; then
	echo "cron must not be restarted: crond rescans /etc/crontabs itself" >&2
	exit 1
fi

# The pre-flight test must run with the same environment procd uses, otherwise a
# profile can pass the test and still fail on the real start.
awk '
/if \[ "\$test_profile" = 1 \]; then/ { in_test = 1; next }
in_test && /^\t\tif env \\$/ { has_env = 1; next }
in_test && /-t >> "\$CORE_LOG_PATH"/ {
	if (!has_env) {
		print "test profile must run with the procd environment" > "/dev/stderr"
		exit 1
	}
	found = 1
	in_test = 0
}
END {
	if (!found) {
		print "test profile block not found" > "/dev/stderr"
		exit 1
	}
}
' "$INIT_SCRIPT"

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

grep -q 'auth_password=$(generate_secret)' "$MIGRATE"
grep -q 'auth_password=$(generate_secret)' "$INIT_DEFAULTS"
grep -q 'mihomox.mixin.fake_ip6_range=fc00::/18' "$MIGRATE"
grep -q 'uci set mihomox.procd.env_disable_quic_go_ecn=1' "$MIGRATE"

echo "default settings tests passed"

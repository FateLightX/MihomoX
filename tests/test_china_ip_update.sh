#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SCRIPT="$ROOT_DIR/mihomox/files/scripts/update_china_ip.sh"
INIT_SCRIPT="$ROOT_DIR/mihomox/files/mihomox.init"
MAKEFILE="$ROOT_DIR/mihomox/Makefile"

sh -n "$SCRIPT"
grep -q 'CHINA_IP_URL_DEFAULT="https://raw.githubusercontent.com/gaoyifan/china-operator-ip/refs/heads/ip-lists/china.txt"' "$SCRIPT"
grep -q 'CHINA_IP6_URL_DEFAULT="https://raw.githubusercontent.com/gaoyifan/china-operator-ip/refs/heads/ip-lists/china6.txt"' "$SCRIPT"
grep -q 'CHINA_IP_PROXY_URL="https://v4.gh-proxy.org/https://raw.githubusercontent.com/gaoyifan/china-operator-ip/refs/heads/ip-lists/china.txt"' "$SCRIPT"
grep -q 'CHINA_IP6_PROXY_URL="https://v4.gh-proxy.org/https://raw.githubusercontent.com/gaoyifan/china-operator-ip/refs/heads/ip-lists/china6.txt"' "$SCRIPT"
grep -q 'CHINA_IP_JSDELIVR_URL="https://fastly.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china.txt"' "$SCRIPT"
grep -q 'CHINA_IP6_JSDELIVR_URL="https://fastly.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china6.txt"' "$SCRIPT"
grep -q "extra_command 'update_china_ip'" "$INIT_SCRIPT"
grep -q 'update_china_ip #mihomox china ip update' "$INIT_SCRIPT"
grep -q 'config_get china_ip_update_cron "proxy" "china_ip_update_cron" "0 4 \* \* 1"' "$INIT_SCRIPT"
grep -q 'update_china_ip.sh' "$MAKEFILE"
if grep -q 'restart.*mihomo' "$SCRIPT"; then
	echo "China IP updater must not restart Mihomo" >&2
	exit 1
fi

echo "China IP update tests passed"

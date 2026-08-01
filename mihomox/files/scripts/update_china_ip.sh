#!/bin/sh

set -u

. "$(dirname "$0")/include.sh"

CHINA_IP_URL_DEFAULT="https://raw.githubusercontent.com/gaoyifan/china-operator-ip/refs/heads/ip-lists/china.txt"
CHINA_IP6_URL_DEFAULT="https://raw.githubusercontent.com/gaoyifan/china-operator-ip/refs/heads/ip-lists/china6.txt"
CHINA_IP_PROXY_URL="https://v4.gh-proxy.org/https://raw.githubusercontent.com/gaoyifan/china-operator-ip/refs/heads/ip-lists/china.txt"
CHINA_IP6_PROXY_URL="https://v4.gh-proxy.org/https://raw.githubusercontent.com/gaoyifan/china-operator-ip/refs/heads/ip-lists/china6.txt"
CHINA_IP_JSDELIVR_URL="https://fastly.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china.txt"
CHINA_IP6_JSDELIVR_URL="https://fastly.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china6.txt"

LOCK_DIR="$TEMP_DIR/china-ip-update.lock"

log_update() {
	log "ChinaIP" "$1"
}

cleanup_update() {
	rm -rf "$LOCK_DIR" "$TEMP_DIR/china-ip-"*.tmp "$TEMP_DIR/china-ip-"*.raw "$TEMP_DIR/china-ip-"*.valid "$TEMP_DIR/china-ip-"*.list "$TEMP_DIR/china-ip-"*.nft "$TEMP_DIR/china-ip-"*.apply
}

prepare_files
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
	log_update "Update already running."
	exit 0
fi
trap cleanup_update EXIT INT TERM

download_list() {
	local family="$1"
	local output="$2"
	local list="$3"
	local primary="$4"
	local proxy="$5"
	local jsdelivr="$6"
	local url

	for url in "$primary" "$proxy" "$jsdelivr"; do
		log_update "Download $family list: $url"
		if curl -fL --connect-timeout 15 --max-time 120 --silent --show-error "$url" -o "$output"; then
			if [ -s "$output" ] && normalise_list "$family" "$output" "$list"; then
				printf '%s\n' "$url"
				return 0
			fi
			log_update "$family list from $url failed validation; try the next source."
		fi
	done

	return 1
}

normalise_list() {
	local family="$1"
	local input="$2"
	local output="$3"

	tr -d '\r' < "$input" | sed -e '/^[[:space:]]*$/d' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' > "$output.raw"
	case "$family" in
		ipv4)
			if ! awk '
				/^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\/[0-9][0-9]*$/ { print; count++; next }
			{ invalid = 1 }
			END { exit (invalid || count == 0) }
			' "$output.raw" > "$output.valid"; then
				return 1
			fi
			sort -u "$output.valid" > "$output"
			;;
		ipv6)
			if ! awk '
				/^[0-9A-Fa-f:][0-9A-Fa-f:]*\/[0-9][0-9]*$/ { print; count++; next }
			{ invalid = 1 }
			END { exit (invalid || count == 0) }
			' "$output.raw" > "$output.valid"; then
				return 1
			fi
			sort -u "$output.valid" > "$output"
			;;
		*)
			return 1
			;;
	esac

	[ "$(wc -l < "$output")" -gt 100 ]
}

write_nft_file() {
	local set_name="$1"
	local input="$2"
	local output="$3"

	{
		printf '%s\n\n' '#!/usr/sbin/nft -f'
		printf '%s\n' 'table inet mihomox {'
		printf '\tset %s {\n' "$set_name"
		printf '\t\ttype %s\n' "$( [ "$set_name" = china_ip ] && printf ipv4_addr || printf ipv6_addr )"
		printf '\t\tflags interval\n'
		printf '\t\telements = {\n'
		while IFS= read -r cidr; do
			printf '\t\t\t%s,\n' "$cidr"
		done < "$input"
		printf '\t\t}\n\t}\n}\n'
	} > "$output"
}

write_apply_file() {
	local set_name="$1"
	local input="$2"
	local output="$3"

	{
		printf 'flush set inet mihomox %s\n' "$set_name"
		printf 'add element inet mihomox %s {\n' "$set_name"
		while IFS= read -r cidr; do
			printf '\t%s,\n' "$cidr"
		done < "$input"
		printf '}\n'
	} > "$output"
}

update_family() {
	local family="$1"
	local set_name="$2"
	local target="$3"
	local primary="$4"
	local proxy="$5"
	local jsdelivr="$6"
	local raw="$TEMP_DIR/china-ip-$family.tmp"
	local list="$TEMP_DIR/china-ip-$family.list"
	local candidate="$TEMP_DIR/china-ip-$family.nft"
	local apply="$TEMP_DIR/china-ip-$family.apply"
	local source

	if ! source=$(download_list "$family" "$raw" "$list" "$primary" "$proxy" "$jsdelivr"); then
		log_update "$family list download failed; keep the current list."
		return 1
	fi
	write_nft_file "$set_name" "$list" "$candidate"

	if nft list set inet mihomox "$set_name" >/dev/null 2>&1; then
		write_apply_file "$set_name" "$list" "$apply"
		if ! nft -c -f "$apply" >/dev/null 2>&1 || ! nft -f "$apply" >/dev/null 2>&1; then
			log_update "$family nft set update failed; keep the current list."
			return 1
		fi
	else
		if ! nft -c -f "$candidate" >/dev/null 2>&1; then
			log_update "$family nft file validation failed; keep the current list."
			return 1
		fi
	fi

	if ! mv -f "$candidate" "$target"; then
		log_update "$family list file update failed."
		return 1
	fi
	log_update "$family list updated from $source ($(wc -l < "$list") CIDRs)."
	return 0
}

proxy_china_ip_url=$(uci -q get mihomox.proxy.china_ip_url)
proxy_china_ip6_url=$(uci -q get mihomox.proxy.china_ip6_url)
[ -n "$proxy_china_ip_url" ] || proxy_china_ip_url="$CHINA_IP_URL_DEFAULT"
[ -n "$proxy_china_ip6_url" ] || proxy_china_ip6_url="$CHINA_IP6_URL_DEFAULT"

status=0
update_family ipv4 china_ip "$GEOIP_CN_NFT" "$proxy_china_ip_url" "$CHINA_IP_PROXY_URL" "$CHINA_IP_JSDELIVR_URL" || status=1
update_family ipv6 china_ip6 "$GEOIP6_CN_NFT" "$proxy_china_ip6_url" "$CHINA_IP6_PROXY_URL" "$CHINA_IP6_JSDELIVR_URL" || status=1
exit "$status"

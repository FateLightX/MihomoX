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
LOCK_HELD=0
# The temporary directory is removed on exit, so a failed run has to leave its
# evidence somewhere that survives: fixed path, one file per address family.
KEEP_FAILED_DIR="${MIHOMOX_KEEP_FAILED_DIR:-/tmp}"
KEEP_FAILED_PREFIX="${MIHOMOX_KEEP_FAILED_PREFIX:-mihomox_china_ip_failed}"

log_update() {
	log "ChinaIP" "$1"
}

cleanup_update() {
	[ "$LOCK_HELD" -eq 1 ] && rm -rf "$LOCK_DIR"
	rm -f "$TEMP_DIR/china-ip-"*.tmp "$TEMP_DIR/china-ip-"*.raw "$TEMP_DIR/china-ip-"*.valid \
		"$TEMP_DIR/china-ip-"*.list "$TEMP_DIR/china-ip-"*.nft "$TEMP_DIR/china-ip-"*.apply \
		"$TEMP_DIR/china-ip-"*.error "$TEMP_DIR/china-ip-"*.bad
}

prepare_files
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
	lock_pid=$(cat "$LOCK_DIR/pid" 2>/dev/null || true)
	if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
		log_update "Update already running."
		exit 0
	fi
	log_update "Remove stale update lock."
	rm -rf "$LOCK_DIR"
	mkdir "$LOCK_DIR" 2>/dev/null || {
		log_update "Unable to acquire update lock."
		exit 1
	}
fi
LOCK_HELD=1
printf '%s\n' "$$" > "$LOCK_DIR/pid"
trap cleanup_update EXIT INT TERM

first_line() {
	head -n 1 "$1" 2>/dev/null | tr -d '\r'
}

nft_version() {
	nft --version 2>/dev/null | head -n 1 || true
}

# Keep the input that failed validation so a later inspection can reproduce the
# error; the working copy under $TEMP_DIR is gone once the trap runs.
keep_failed_source() {
	local family="$1"
	local source_file="$2"
	local keep="$KEEP_FAILED_DIR/${KEEP_FAILED_PREFIX}_$family.txt"

	[ -d "$KEEP_FAILED_DIR" ] || mkdir -p "$KEEP_FAILED_DIR" 2>/dev/null || return 1
	cp -f "$source_file" "$keep" 2>/dev/null || return 1
	chmod 644 "$keep" >/dev/null 2>&1 || true
	printf '%s\n' "$keep"
}

report_failure() {
	local label="$1"
	local family="$2"
	local source_file="$3"
	local kind="$4"
	local detail="$5"
	local lines keep

	lines=$(grep -c '[^[:space:]]' "$source_file" 2>/dev/null || true)
	[ -n "${lines:-}" ] || lines="?"
	[ -n "$detail" ] || detail="no error output"
	if keep=$(keep_failed_source "$family" "$source_file"); then
		log_update "$label failed ($kind), ${lines} entries, $(nft_version); source kept at $keep"
	else
		log_update "$label failed ($kind), ${lines} entries, $(nft_version); unable to keep the source file"
	fi
	log_update "$label error: $detail"
}

download_list() {
	local family="$1"
	local output="$2"
	local list="$3"
	local primary="$4"
	local proxy="$5"
	local jsdelivr="$6"
	local curl_log="$TEMP_DIR/china-ip-$family.curl-error"
	local url

	for url in "$primary" "$proxy" "$jsdelivr"; do
		log_update "Download $family list: $url"
		if ! curl -fL --connect-timeout 15 --max-time 120 --silent --show-error "$url" -o "$output" 2>"$curl_log"; then
			log_update "$family download failed from $url: $(first_line "$curl_log")"
			continue
		fi
		if [ -s "$output" ] && normalise_list "$family" "$output" "$list"; then
			printf '%s\n' "$url"
			return 0
		fi
		log_update "$family list from $url failed validation; try the next source."
	done

	return 1
}

normalise_list() {
	local family="$1"
	local input="$2"
	local output="$3"
	local bad_log="$TEMP_DIR/china-ip-$family.bad"
	local detail

	if normalise_china_ip_list "$family" "$input" "$output" "$bad_log"; then
		return 0
	fi
	detail=$(first_line "$bad_log")
	[ -n "$detail" ] || detail="no valid entries"
	log_update "$family format check rejected line $detail"
	return 1
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
	local nft_log="$TEMP_DIR/china-ip-$family.nft-error"
	local source

	if ! source=$(download_list "$family" "$raw" "$list" "$primary" "$proxy" "$jsdelivr"); then
		log_update "$family list download failed; keep the current list."
		if [ -s "$raw" ]; then
			report_failure "$family list validation" "$family" "$raw" "every source failed" \
				"$(first_line "$TEMP_DIR/china-ip-$family.bad")"
		fi
		return 1
	fi
	write_nft_file "$set_name" "$list" "$candidate"
	if cmp -s "$candidate" "$target"; then
		log_update "$family list unchanged ($(wc -l < "$list") CIDRs)."
		return 0
	fi

	: > "$nft_log"
	if nft list set inet mihomox "$set_name" >/dev/null 2>&1; then
		write_apply_file "$set_name" "$list" "$apply"
		if nft -c -f "$apply" >/dev/null 2>"$nft_log" && nft -f "$apply" >/dev/null 2>>"$nft_log"; then
			:
		else
			report_failure "$family nft set update" "$family" "$list" "nft rejected the update" "$(first_line "$nft_log")"
			return 1
		fi
	else
		if ! nft -c -f "$candidate" >/dev/null 2>"$nft_log"; then
			report_failure "$family nft file validation" "$family" "$list" "nft rejected the candidate file" "$(first_line "$nft_log")"
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

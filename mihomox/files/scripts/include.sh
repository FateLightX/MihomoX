#!/bin/sh

# paths
HOME_DIR="/etc/mihomox"
BIN_DIR="$HOME_DIR/bin"
CORE_PATH="$BIN_DIR/mihomo"
CORE_VERSION_PATH="$BIN_DIR/mihomo.version"
PROFILES_DIR="$HOME_DIR/profiles"
SUBSCRIPTIONS_DIR="$HOME_DIR/subscriptions"
MIXIN_FILE_PATH="$HOME_DIR/mixin.yaml"
RUN_DIR="$HOME_DIR/run"
PROVIDERS_DIR="$RUN_DIR/providers"
RULE_PROVIDERS_DIR="$PROVIDERS_DIR/rule"
PROXY_PROVIDERS_DIR="$PROVIDERS_DIR/proxy"

# log
LOG_DIR="/var/log/mihomox"
APP_LOG_PATH="$LOG_DIR/app.log"
CORE_LOG_PATH="$LOG_DIR/core.log"

# temp
TEMP_DIR="/var/run/mihomox"
RUN_PROFILE_PATH="$TEMP_DIR/config.yaml"
PID_FILE_PATH="$TEMP_DIR/mihomox.pid"
STARTED_FLAG_PATH="$TEMP_DIR/started.flag"
ROUTING_STATE_PATH="$TEMP_DIR/routing.state"
BRIDGE_NF_CALL_IPTABLES_FLAG_PATH="$TEMP_DIR/bridge_nf_call_iptables.flag"
BRIDGE_NF_CALL_IP6TABLES_FLAG_PATH="$TEMP_DIR/bridge_nf_call_ip6tables.flag"
SUBSCRIPTION_REFRESH_PENDING_PATH="$TEMP_DIR/subscription-refresh.pending"
SUBSCRIPTION_REFRESH_STATUS_PATH="$TEMP_DIR/subscription-refresh.status"
CACHE_DB_PATH="$TEMP_DIR/cache.db"
CACHE_MOUNT_PATH="$RUN_DIR/cache.db"
CACHE_SNAPSHOT_PATH="$HOME_DIR/cache.snapshot"

# ucode
UCODE_DIR="$HOME_DIR/ucode"
INCLUDE_UC="$UCODE_DIR/include.uc"
MIXIN_UC="$UCODE_DIR/mixin.uc"
HIJACK_UT="$UCODE_DIR/hijack.ut"

# scripts
SH_DIR="$HOME_DIR/scripts"
INCLUDE_SH="$SH_DIR/include.sh"
FIREWALL_INCLUDE_SH="$SH_DIR/firewall_include.sh"
CORE_UPDATE_SH="$SH_DIR/update_core.sh"
CHINA_IP_UPDATE_SH="$SH_DIR/update_china_ip.sh"

# nftables
NFT_DIR="$HOME_DIR/nftables"
GEOIP_CN_NFT="$NFT_DIR/geoip_cn.nft"
GEOIP6_CN_NFT="$NFT_DIR/geoip6_cn.nft"

# functions
format_filesize() {
	local b; b=1
	local kb; kb=$((b * 1024))
	local mb; mb=$((kb * 1024))
	local gb; gb=$((mb * 1024))
	local tb; tb=$((gb * 1024))
	local pb; pb=$((tb * 1024))
	local size; size="$1"
	if [ -n "$size" ]; then
		if [ "$size" -lt "$kb" ]; then
			echo "$(awk "BEGIN {print $size / $b}") B"
		elif [ "$size" -lt "$mb" ]; then
			echo "$(awk "BEGIN {print $size / $kb}") KB"
		elif [ "$size" -lt "$gb" ]; then
			echo "$(awk "BEGIN {print $size / $mb}") MB"
		elif [ "$size" -lt "$tb" ]; then
			echo "$(awk "BEGIN {print $size / $gb}") GB"
		elif [ "$size" -lt "$pb" ]; then
			echo "$(awk "BEGIN {print $size / $tb}") TB"
		else
			echo "$(awk "BEGIN {print $size / $pb}") PB"
		fi
	fi
}

prepare_files() {
	if [ ! -d "$LOG_DIR" ]; then
		mkdir -p "$LOG_DIR"
	fi
	if [ ! -f "$APP_LOG_PATH" ]; then
		touch "$APP_LOG_PATH"
	fi
	if [ ! -f "$CORE_LOG_PATH" ]; then
		touch "$CORE_LOG_PATH"
	fi
	if [ ! -d "$TEMP_DIR" ]; then
		mkdir -p "$TEMP_DIR"
	fi
	if [ ! -d "$RUN_DIR" ]; then
		mkdir -p "$RUN_DIR"
	fi
}

cache_mounted() {
	grep -qs " $CACHE_MOUNT_PATH " /proc/mounts
}

prepare_cache() {
	if [ ! -d "$RUN_DIR" ]; then
		mkdir -p "$RUN_DIR"
	fi
	if [ ! -s "$CACHE_DB_PATH" ] && [ -s "$CACHE_SNAPSHOT_PATH" ]; then
		cp -p "$CACHE_SNAPSHOT_PATH" "$CACHE_DB_PATH" 2>/dev/null || \
			log "Cache" "Unable to restore selection cache snapshot."
	fi
	# Move the old cache out of /etc once, then keep it on tmpfs.
	if [ -f "$CACHE_MOUNT_PATH" ] && [ ! -L "$CACHE_MOUNT_PATH" ] && ! cache_mounted; then
		if [ ! -s "$CACHE_DB_PATH" ]; then
			cp -p "$CACHE_MOUNT_PATH" "$CACHE_DB_PATH" 2>/dev/null || {
				log "Cache" "Unable to migrate cache.db to runtime storage."
				return 1
			}
		fi
		rm -f "$CACHE_MOUNT_PATH"
	fi
	[ -e "$CACHE_DB_PATH" ] || : > "$CACHE_DB_PATH"
	if cache_mounted; then
		return 0
	fi
	# Remove a fallback symlink left by an earlier start before trying bind again.
	if [ -L "$CACHE_MOUNT_PATH" ]; then
		rm -f "$CACHE_MOUNT_PATH"
	fi
	[ -e "$CACHE_MOUNT_PATH" ] || : > "$CACHE_MOUNT_PATH"
	if command -v mount >/dev/null 2>&1 && \
		mount --bind "$CACHE_DB_PATH" "$CACHE_MOUNT_PATH" >/dev/null 2>&1; then
		return 0
	fi
	# Kernel/filesystem without file bind mounts: fall back to a symlink.
	rm -f "$CACHE_MOUNT_PATH"
	ln -s "$CACHE_DB_PATH" "$CACHE_MOUNT_PATH" || return 1
}

persist_cache_snapshot() {
	[ -s "$CACHE_DB_PATH" ] || return 0
	local snapshot_tmp="$CACHE_SNAPSHOT_PATH.$$"
	cp -p "$CACHE_DB_PATH" "$snapshot_tmp" 2>/dev/null || {
		log "Cache" "Unable to save selection cache snapshot."
		rm -f "$snapshot_tmp"
		return 1
	}
	mv -f "$snapshot_tmp" "$CACHE_SNAPSHOT_PATH" || {
		log "Cache" "Unable to install selection cache snapshot."
		rm -f "$snapshot_tmp"
		return 1
	}
}

cleanup_cache() {
	if cache_mounted; then
		umount "$CACHE_MOUNT_PATH" >/dev/null 2>&1 || log "Cache" "Unable to unmount runtime cache mount."
	fi
}

log() {
	echo "[$(date "+%Y-%m-%d %H:%M:%S")] [$1] $2" >> "$APP_LOG_PATH"
}

generate_secret() {
	[ -r /dev/urandom ] || return 1
	od -An -N32 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n'
}

is_valid_cron() {
	[ "$#" -eq 1 ] || return 1
	[ -n "$1" ] || return 1
	printf '%s\n' "$1" | awk '
		BEGIN { valid = 1 }
		NR != 1 || NF != 5 { valid = 0; exit }
		{
			for (i = 1; i <= NF; i++)
				if ($i !~ /^[0-9*\/,\-]+$/)
					valid = 0
		}
		END { exit !valid }
	'
}

is_uint() {
	[ "$#" -eq 1 ] || return 1
	[ -n "$1" ] && [ "${#1}" -le 10 ] || return 1
	case "$1" in *[!0-9]*) return 1 ;; esac
	return 0
}

is_safe_identifier() {
	[ "$#" -eq 1 ] || return 1
	[ -n "$1" ] && [ "${#1}" -le 64 ] || return 1
	case "$1" in *[!A-Za-z0-9_.-]*) return 1 ;; esac
	return 0
}

is_valid_mark() {
	[ "$#" -eq 1 ] || return 1
	printf '%s\n' "$1" | grep -Eq '^(0[xX][0-9A-Fa-f]+|[0-9]+)$'
}

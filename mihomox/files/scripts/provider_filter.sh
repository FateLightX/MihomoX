#!/bin/sh

set -u

HOME_DIR="${MIHOMOX_HOME_DIR:-/etc/mihomox}"
RUN_DIR="${MIHOMOX_RUN_DIR:-$HOME_DIR/run}"
CORE_PATH="${MIHOMOX_CORE_PATH:-$HOME_DIR/bin/mihomo}"
POLICY_FILE="${MIHOMOX_PROVIDER_POLICY_FILE:-$HOME_DIR/provider-discard.json}"
STORE_DIR="${MIHOMOX_PROVIDER_FILTER_STORE_DIR:-$HOME_DIR/provider-filter}"
FILTER_DIR="${MIHOMOX_PROVIDER_FILTER_DIR:-$RUN_DIR/provider-filter}"
MANIFEST_FILE="$FILTER_DIR/manifest.json"
QUEUE_DIR="$FILTER_DIR/queue"
LOCK_DIR="$FILTER_DIR/worker.lock"
WORKER_PID="$FILTER_DIR/worker.pid"
PROBE_DIR="$FILTER_DIR/probe"
LOG_FILE="${MIHOMOX_PROVIDER_FILTER_LOG_FILE:-$FILTER_DIR/activity.log}"
LOG_MAX_BYTES="${MIHOMOX_PROVIDER_FILTER_LOG_MAX_BYTES:-65536}"
PROBE_PORT="${MIHOMOX_PROVIDER_PROBE_PORT:-19091}"
PROBE_MARK="${MIHOMOX_PROVIDER_PROBE_MARK:-}"
YQ="${MIHOMOX_YQ:-yq}"
CURL="${MIHOMOX_CURL:-curl}"

umask 077

if [ -z "$PROBE_MARK" ] && command -v uci > /dev/null 2>&1; then
	PROBE_MARK=$(uci -q get mihomox.routing.provider_probe_fw_mark)
fi
[ -n "$PROBE_MARK" ] || PROBE_MARK=0x82

valid_mark() {
	case "$1" in
		0[xX]*)
			local hex
			hex=${1#??}
			case "$hex" in ''|*[!0-9A-Fa-f]*) return 1 ;; esac
			;;
		*[!0-9]*|'') return 1 ;;
		*) ;;
	esac
	return 0
}

probe_mark_available() {
	local tproxy_mark tproxy_mask tun_mark tun_mask
	valid_mark "$PROBE_MARK" || return 1
	command -v uci > /dev/null 2>&1 || return 0
	tproxy_mark=$(uci -q get mihomox.routing.tproxy_fw_mark); [ -n "$tproxy_mark" ] || tproxy_mark=0x80
	tproxy_mask=$(uci -q get mihomox.routing.tproxy_fw_mask); [ -n "$tproxy_mask" ] || tproxy_mask=0xFF
	tun_mark=$(uci -q get mihomox.routing.tun_fw_mark); [ -n "$tun_mark" ] || tun_mark=0x81
	tun_mask=$(uci -q get mihomox.routing.tun_fw_mask); [ -n "$tun_mask" ] || tun_mask=0xFF
	valid_mark "$tproxy_mark" && valid_mark "$tproxy_mask" &&
		valid_mark "$tun_mark" && valid_mark "$tun_mask" || return 1
	[ $((PROBE_MARK & tproxy_mask)) -ne $((tproxy_mark & tproxy_mask)) ] &&
		[ $((PROBE_MARK & tun_mask)) -ne $((tun_mark & tun_mask)) ]
}

prepare_dirs() {
	mkdir -p "$STORE_DIR" "$FILTER_DIR" "$QUEUE_DIR"
}

log_event() {
	local message size temporary
	prepare_dirs
	message=$(printf '%s' "$*" | tr '\r\n' '  ')
	printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$message" >> "$LOG_FILE"
	size=$(wc -c < "$LOG_FILE" 2>/dev/null)
	case "$size:$LOG_MAX_BYTES" in *[!0-9:]*) return ;; esac
	[ "$size" -le "$LOG_MAX_BYTES" ] && return
	temporary="$LOG_FILE.tmp.$$"
	tail -n 300 "$LOG_FILE" > "$temporary" && mv -f "$temporary" "$LOG_FILE"
}

provider_key() {
	printf '%s' "$1" | hexdump -ve '1/1 "%02x"'
}

provider_dir() {
	printf '%s/%s' "$STORE_DIR" "$(provider_key "$1")"
}

write_state() {
	local key dir store_dir temporary persistent_tmp now
	key=$(provider_key "$1")
	dir="$FILTER_DIR/$key"
	store_dir="$STORE_DIR/$key"
	mkdir -p "$dir"
	temporary="$dir/state.json.tmp.$$"
	now=$(date '+%Y-%m-%dT%H:%M:%S%z')
	cat > "$temporary" <<-EOF
	{"state":"$2","total":${3:-0},"tested":${4:-0},"available":${5:-0},"discarded":${6:-0},"message":"${7:-}","updatedAt":"$now"}
	EOF
	mv -f "$temporary" "$dir/state.json"
	case "$2" in
		active|disabled|failed|fallback|retained|unsupported)
			mkdir -p "$store_dir"
			persistent_tmp="$store_dir/last-state.json.tmp.$$"
			cp -f "$dir/state.json" "$persistent_tmp" && mv -f "$persistent_tmp" "$store_dir/last-state.json"
			;;
	esac
}

policy_field() {
	local name field fallback value
	name="$1"
	field="$2"
	fallback="$3"
	[ -s "$POLICY_FILE" ] || {
		printf '%s\n' "$fallback"
		return
	}
	value=$(PROVIDER_NAME="$name" "$YQ" -r ".providers[strenv(PROVIDER_NAME)].${field} // \"${fallback}\"" "$POLICY_FILE" 2>/dev/null)
	[ -n "$value" ] && [ "$value" != null ] || value="$fallback"
	printf '%s\n' "$value"
}

global_field() {
	local field fallback value
	field="$1"
	fallback="$2"
	[ -s "$POLICY_FILE" ] || {
		printf '%s\n' "$fallback"
		return
	}
	value=$(FIELD="$field" "$YQ" -r '.global[strenv(FIELD)] // ""' "$POLICY_FILE" 2>/dev/null)
	[ -n "$value" ] && [ "$value" != null ] || value="$fallback"
	printf '%s\n' "$value"
}

manager_enabled() {
	local value
	[ -s "$POLICY_FILE" ] || return 0
	value=$("$YQ" -r '.global.enabled // true' "$POLICY_FILE" 2>/dev/null)
	[ "$value" = true ]
}

percent_encode() {
	local byte
	for byte in $(printf '%s' "$1" | hexdump -ve '1/1 "%02x\n"'); do
		case "$byte" in
			2d|2e|3[0-9]|4[1-9a-f]|5[0-9a]|5f|6[1-9a-f]|7[0-9a]|7e)
				printf '%b' "\\x$byte"
				;;
			*) printf '%%%s' "$byte" ;;
		esac
	done
}

read_pid() {
	local file pid
	file="$1"
	[ -s "$file" ] || return 1
	pid=$(cat "$file" 2>/dev/null) || return 1
	case "$pid" in ''|*[!0-9]*) return 1 ;; esac
	[ "$pid" -gt 1 ] || return 1
	printf '%s\n' "$pid"
}

stop_probe() {
	local pid
	if pid=$(read_pid "$PROBE_DIR/pid"); then
		kill "$pid" 2>/dev/null || true
		wait "$pid" 2>/dev/null || true
	fi
	rm -f "$PROBE_DIR/pid"
}

probe_one() {
	local name encoded_name attempt expected_args response delay
	name="$1"
	encoded_name=$(percent_encode "$name")
	attempt=0
	expected_args=
	[ -z "$EXPECTED_STATUS" ] || expected_args="expected=$EXPECTED_STATUS"
	while [ "$attempt" -le "$RETRIES" ]; do
		if response=$("$CURL" --noproxy '*' --silent --show-error --fail --max-time "$CURL_TIMEOUT" \
			--oauth2-bearer "$PROBE_SECRET" \
			--get --data-urlencode "url=$TEST_URL" --data-urlencode "timeout=$TIMEOUT" \
			${expected_args:+--data-urlencode "$expected_args"} \
			"http://127.0.0.1:$PROBE_PORT/providers/proxies/candidate/$encoded_name/healthcheck" \
			2>/dev/null); then
			delay=$(printf '%s' "$response" | "$YQ" -p=json -r '.delay // 0' 2>/dev/null)
			case "$delay" in ''|*[!0-9]*) delay=0 ;; esac
			if [ "$delay" -gt 0 ] && { [ "$MAX_DELAY" -eq 0 ] || [ "$delay" -le "$MAX_DELAY" ]; }; then
				printf '%s\n' "$name" >> "$ALIVE_FILE"
				return 0
			fi
		fi
		attempt=$((attempt + 1))
	done
	return 1
}

start_probe() {
	local source_file raw_file config_file count pid
	source_file="$1"
	raw_file="$2"
	config_file="$PROBE_DIR/config.yaml"

	probe_mark_available || return 1
	stop_probe
	mkdir -p "$PROBE_DIR"
	PROBE_SECRET=$(head -c 16 /dev/urandom 2>/dev/null | hexdump -ve '1/1 "%02x"')
	[ -n "$PROBE_SECRET" ] || return 1
	cat > "$config_file" <<-EOF
	external-controller: 127.0.0.1:$PROBE_PORT
	secret: $PROBE_SECRET
	log-level: silent
	unified-delay: $UNIFIED_DELAY
	allow-lan: false
	mixed-port: 0
	mode: rule
	routing-mark: $PROBE_MARK
	dns:
	  enable: true
	  ipv6: false
	  nameserver:
	    - https://223.5.5.5/dns-query
	    - https://1.1.1.1/dns-query
	proxy-providers:
	  candidate: {}
	proxy-groups:
	  - name: PROBE
	    type: select
	    use:
	      - candidate
	rules:
	  - MATCH,DIRECT
	EOF
	SOURCE_FILE="$source_file" RAW_FILE="$raw_file" "$YQ" -i \
		'.["proxy-providers"].candidate = load(strenv(SOURCE_FILE)) |
		 .["proxy-providers"].candidate.path = strenv(RAW_FILE) |
		 .["proxy-providers"].candidate.interval = 0 |
		 .["proxy-providers"].candidate["health-check"] = {"enable": false}' \
		"$config_file" || return 1

	HTTP_PROXY= HTTPS_PROXY= ALL_PROXY= http_proxy= https_proxy= all_proxy= NO_PROXY='*' SAFE_PATHS="$STORE_DIR:$FILTER_DIR" \
		"$CORE_PATH" -d "$PROBE_DIR" -f "$config_file" > "$PROBE_DIR/core.log" 2>&1 &
	printf '%s\n' "$!" > "$PROBE_DIR/pid"

	count=0
	while [ "$count" -lt 60 ]; do
		if "$CURL" --noproxy '*' --silent --fail --max-time 2 \
			--oauth2-bearer "$PROBE_SECRET" \
			"http://127.0.0.1:$PROBE_PORT/providers/proxies/candidate" \
			-o "$PROBE_DIR/provider.json" 2>/dev/null && [ -s "$raw_file" ]; then
			return 0
		fi
		pid=$(read_pid "$PROBE_DIR/pid") || return 1
		kill -0 "$pid" 2>/dev/null || return 1
		count=$((count + 1))
		sleep 1
	done
	return 1
}

update_one() {
	local name dir source_file raw_file current_file names_file filtered_file
	local manual enabled total tested available discarded concurrency running line pids pid
	name="$1"
	manual="${2:-false}"
	dir=$(provider_dir "$name")
	source_file="$dir/source.yaml"
	raw_file="$dir/raw.yaml"
	current_file="$dir/current.yaml"
	names_file="$PROBE_DIR/names.txt"
	ALIVE_FILE="$PROBE_DIR/alive.txt"
	filtered_file="$dir/current.yaml.tmp.$$"

	if [ ! -s "$source_file" ]; then
		log_event "[$name] failed: source_missing"
		return 1
	fi
	enabled=$(policy_field "$name" enabled false)
	if [ "$manual" != true ] && [ "$enabled" != true ] && [ -s "$raw_file" ]; then
		total=$("$YQ" -r '.proxies | length' "$raw_file" 2>/dev/null)
		case "$total" in ''|*[!0-9]*) total=0 ;; esac
		cp -f "$raw_file" "$filtered_file" && mv -f "$filtered_file" "$current_file"
		write_state "$name" disabled "$total" "$total" "$total" 0 keep_all
		date +%s > "$dir/last_update"
		log_event "[$name] completed: filtering_disabled available=$total total=$total"
		return 0
	fi
	write_state "$name" downloading 0 0 0 0 downloading
	log_event "[$name] downloading"
	UNIFIED_DELAY=$(global_field unifiedDelay true)
	[ "$UNIFIED_DELAY" = false ] || UNIFIED_DELAY=true
	MAX_DELAY=$(global_field maxDelay 400)
	case "$MAX_DELAY" in ''|*[!0-9]*) MAX_DELAY=400 ;; esac
	[ "$MAX_DELAY" -ge 0 ] && [ "$MAX_DELAY" -le 30000 ] || MAX_DELAY=400
	if ! start_probe "$source_file" "$raw_file"; then
		stop_probe
		if probe_mark_available; then
			write_state "$name" failed 0 0 0 0 download_failed
		else
			write_state "$name" failed 0 0 0 0 probe_mark_conflict
		fi
		date +%s > "$dir/last_update"
		log_event "[$name] failed: probe_start_failed"
		return 1
	fi

	"$YQ" -p=json -r '.proxies[]?.name' "$PROBE_DIR/provider.json" > "$names_file" 2>/dev/null
	total=$(awk 'NF { count++ } END { print count + 0 }' "$names_file")
	if [ "$total" -eq 0 ]; then
		stop_probe
		write_state "$name" failed 0 0 0 0 no_nodes
		log_event "[$name] failed: no_nodes"
		return 1
	fi
	log_event "[$name] downloaded: total=$total"

	if [ "$manual" != true ] && [ "$enabled" != true ]; then
		cp -f "$raw_file" "$filtered_file" && mv -f "$filtered_file" "$current_file"
		stop_probe
		write_state "$name" disabled "$total" "$total" "$total" 0 keep_all
		date +%s > "$dir/last_update"
		log_event "[$name] completed: filtering_disabled available=$total total=$total"
		return 0
	fi

	TEST_URL=$(policy_field "$name" url '')
	EXPECTED_STATUS=
	if [ -z "$TEST_URL" ]; then
		TEST_URL=$("$YQ" -r '.["health-check"].url // "https://www.gstatic.com/generate_204"' "$source_file")
		EXPECTED_STATUS=$("$YQ" -r '.["health-check"]["expected-status"] // ""' "$source_file")
	fi
	TIMEOUT=$(policy_field "$name" timeout 3000)
	RETRIES=$(policy_field "$name" retries 2)
	concurrency=$(policy_field "$name" concurrency 5)
	case "$TIMEOUT" in ''|*[!0-9]*) TIMEOUT=3000 ;; esac
	case "$RETRIES" in ''|*[!0-9]*) RETRIES=2 ;; esac
	case "$concurrency" in ''|*[!0-9]*) concurrency=5 ;; esac
	[ "$TIMEOUT" -ge 500 ] && [ "$TIMEOUT" -le 30000 ] || TIMEOUT=3000
	[ "$RETRIES" -ge 0 ] && [ "$RETRIES" -le 5 ] || RETRIES=2
	[ "$concurrency" -ge 1 ] && [ "$concurrency" -le 20 ] || concurrency=5
	CURL_TIMEOUT=$((TIMEOUT / 1000 + 2))
	[ "$CURL_TIMEOUT" -ge 3 ] || CURL_TIMEOUT=3
	: > "$ALIVE_FILE"
	write_state "$name" testing "$total" 0 0 0 testing
	log_event "[$name] testing: 0/$total"

	tested=0
	running=0
	pids=
	while IFS= read -r line; do
		[ -n "$line" ] || continue
		probe_one "$line" &
		pids="$pids $!"
		running=$((running + 1))
		if [ "$running" -ge "$concurrency" ]; then
			for pid in $pids; do wait "$pid" || true; done
			tested=$((tested + running))
			available=$(awk 'NF { count++ } END { print count + 0 }' "$ALIVE_FILE")
			write_state "$name" testing "$total" "$tested" "$available" "$((tested - available))" testing
			log_event "[$name] testing: $tested/$total available=$available discarded=$((tested - available))"
			running=0
			pids=
		fi
	done < "$names_file"
	for pid in $pids; do wait "$pid" || true; done
	if [ "$running" -gt 0 ]; then
		tested=$((tested + running))
		available=$(awk 'NF { count++ } END { print count + 0 }' "$ALIVE_FILE")
		write_state "$name" testing "$total" "$tested" "$available" "$((tested - available))" testing
		log_event "[$name] testing: $tested/$total available=$available discarded=$((tested - available))"
	fi

	available=$(awk 'NF { count++ } END { print count + 0 }' "$ALIVE_FILE")
	discarded=$((total - available))
	if [ "$available" -eq 0 ]; then
		if [ ! -s "$current_file" ]; then
			cp -f "$raw_file" "$filtered_file" && mv -f "$filtered_file" "$current_file"
			write_state "$name" fallback "$total" "$total" "$total" 0 initial_keep_all
			log_event "[$name] completed: no_available_nodes keep_all=true"
		else
			write_state "$name" retained "$total" "$total" 0 "$total" retained_previous
			log_event "[$name] completed: no_available_nodes retained_previous=true"
		fi
		stop_probe
		date +%s > "$dir/last_update"
		return 0
	fi

	ALIVE_FILE="$ALIVE_FILE" "$YQ" \
		'load_str(strenv(ALIVE_FILE)) as $text |
		 ($text | split("\n") | map(select(length > 0))) as $alive |
		 .proxies = [.proxies[] | select(.name as $name | $alive | contains([$name]))]' \
		"$raw_file" > "$filtered_file" || {
		stop_probe
		rm -f "$filtered_file"
		write_state "$name" failed "$total" "$total" 0 "$total" filter_failed
		log_event "[$name] failed: filter_failed"
		return 1
	}
	mv -f "$filtered_file" "$current_file"
	stop_probe
	write_state "$name" active "$total" "$total" "$available" "$discarded" direct_isolation
	date +%s > "$dir/last_update"
	log_event "[$name] completed: available=$available total=$total discarded=$discarded"
	return 0
}

prepare_profile() {
	local profile temporary manifest_tmp names_file name key dir source_file current_file
	local state_file legacy_dir interval test_url unsupported supported current_total queued_initial
	profile="$1"
	[ -s "$profile" ] || return 1
	prepare_dirs
	temporary="$profile.provider-filter.tmp.$$"
	manifest_tmp="$MANIFEST_FILE.tmp.$$"
	names_file="$FILTER_DIR/providers.txt.tmp.$$"
	cp -f "$profile" "$temporary" || return 1
	printf '%s\n' '{"providers":{}}' > "$manifest_tmp"
	"$YQ" -r '.["proxy-providers"] // {} | to_entries[] | select(.value.type == "http") | .key' \
		"$profile" > "$names_file" 2>/dev/null

	while IFS= read -r name; do
		[ -n "$name" ] || continue
		case "$name" in *'\n'*) continue ;; esac
		key=$(provider_key "$name")
		dir="$STORE_DIR/$key"
		legacy_dir="$FILTER_DIR/$key"
		source_file="$dir/source.yaml"
		current_file="$dir/current.yaml"
		state_file="$FILTER_DIR/$key/state.json"
		queued_initial=false
		mkdir -p "$dir"
		mkdir -p "$FILTER_DIR/$key"
		if [ "$legacy_dir" != "$dir" ] && [ ! -s "$current_file" ] && [ -s "$legacy_dir/current.yaml" ]; then
			cp -f "$legacy_dir/current.yaml" "$current_file"
			[ -s "$legacy_dir/raw.yaml" ] && cp -f "$legacy_dir/raw.yaml" "$dir/raw.yaml"
			[ -s "$legacy_dir/last_update" ] && cp -f "$legacy_dir/last_update" "$dir/last_update"
		fi
		if [ ! -s "$state_file" ] && [ -s "$dir/last-state.json" ]; then
			cp -f "$dir/last-state.json" "$state_file"
		fi
		PROVIDER_NAME="$name" "$YQ" -o=yaml '.["proxy-providers"][strenv(PROVIDER_NAME)]' \
			"$profile" > "$source_file" || continue
		unsupported=$("$YQ" -r '
			has("override") or
			((.proxy // "") as $proxy | ($proxy != "" and $proxy != "DIRECT" and $proxy != "direct"))' \
			"$source_file")
		interval=$("$YQ" -r '.interval // 3600' "$source_file")
		case "$interval" in ''|*[!0-9]*) interval=3600 ;; esac
		test_url=$("$YQ" -r '.["health-check"].url // ""' "$source_file")
		supported=true
		if [ "$unsupported" = true ]; then
			supported=false
			write_state "$name" unsupported 0 0 0 0 unsupported_provider_options
		elif [ ! -s "$current_file" ]; then
			write_state "$name" inactive 0 0 0 0 test_required
			if manager_enabled; then
				printf '%s\n' "$name" > "$QUEUE_DIR/$key.request.tmp.$$" &&
					mv -f "$QUEUE_DIR/$key.request.tmp.$$" "$QUEUE_DIR/$key.request" && queued_initial=true
			fi
		elif [ -s "$current_file" ] && [ ! -s "$state_file" ]; then
			current_total=$("$YQ" -r '.proxies | length' "$current_file" 2>/dev/null)
			case "$current_total" in ''|*[!0-9]*) current_total=0 ;; esac
			write_state "$name" active "$current_total" "$current_total" "$current_total" 0 restored_previous
		fi
		PROVIDER_NAME="$name" PROVIDER_KEY="$key" INTERVAL="$interval" TEST_URL_VALUE="$test_url" SUPPORTED="$supported" \
			"$YQ" -o=json -I=0 -i \
			'.providers[strenv(PROVIDER_NAME)] = {
			 "key": strenv(PROVIDER_KEY), "vehicleType": "HTTP",
			 "interval": (strenv(INTERVAL) | tonumber), "testUrl": strenv(TEST_URL_VALUE),
			 "supported": (strenv(SUPPORTED) == "true")
				}' "$manifest_tmp"
		if [ "$queued_initial" = true ]; then
			write_state "$name" queued 0 0 0 0 queued
		fi
		[ "$supported" = true ] && [ -s "$current_file" ] || continue
		PROVIDER_NAME="$name" SOURCE_FILE="$source_file" ACTIVE_FILE="$current_file" \
			"$YQ" -i \
			'.["proxy-providers"][strenv(PROVIDER_NAME)] = load(strenv(SOURCE_FILE)) |
			 .["proxy-providers"][strenv(PROVIDER_NAME)].type = "file" |
			 .["proxy-providers"][strenv(PROVIDER_NAME)].path = strenv(ACTIVE_FILE) |
			 del(.["proxy-providers"][strenv(PROVIDER_NAME)].url) |
			 del(.["proxy-providers"][strenv(PROVIDER_NAME)].interval) |
			 del(.["proxy-providers"][strenv(PROVIDER_NAME)].header) |
			 del(.["proxy-providers"][strenv(PROVIDER_NAME)].proxy)' \
			"$temporary" || return 1
	done < "$names_file"

	mv -f "$manifest_tmp" "$MANIFEST_FILE"
	mv -f "$temporary" "$profile"
	rm -f "$names_file"
	return 0
}

enqueue_provider() {
	local name manual key request suffix state total tested available discarded
	name="$1"
	manual="${2:-false}"
	manager_enabled || [ "$manual" = true ] || return 1
	[ -s "$MANIFEST_FILE" ] || return 1
	key=$(PROVIDER_NAME="$name" "$YQ" -r \
		'.providers[strenv(PROVIDER_NAME)] | select(.supported == true) | .key // ""' "$MANIFEST_FILE")
	[ -n "$key" ] || return 1
	suffix=request
	if [ "$manual" = true ]; then
		suffix=manual
		rm -f "$QUEUE_DIR/$key.request"
	elif [ -e "$QUEUE_DIR/$key.manual" ]; then
		return 0
	fi
	request="$QUEUE_DIR/$key.$suffix"
	printf '%s\n' "$name" > "$request.tmp.$$" && mv -f "$request.tmp.$$" "$request" || return 1
	state=$("$YQ" -r '.state // ""' "$FILTER_DIR/$key/state.json" 2>/dev/null)
	case "$state" in downloading|testing) return 0 ;; esac
	total=$("$YQ" -r '.total // 0' "$FILTER_DIR/$key/state.json" 2>/dev/null)
	tested=$("$YQ" -r '.tested // 0' "$FILTER_DIR/$key/state.json" 2>/dev/null)
	available=$("$YQ" -r '.available // 0' "$FILTER_DIR/$key/state.json" 2>/dev/null)
	discarded=$("$YQ" -r '.discarded // 0' "$FILTER_DIR/$key/state.json" 2>/dev/null)
	write_state "$name" queued "$total" "$tested" "$available" "$discarded" queued
	log_event "[$name] queued: mode=$([ "$manual" = true ] && printf manual || printf automatic)"
	return 0
}

queue_due() {
	local now name key dir interval last
	[ -s "$MANIFEST_FILE" ] || return 0
	manager_enabled || return 0
	now=$(date +%s)
	"$YQ" -r '.providers | to_entries[] | select(.value.supported == true) | .key' "$MANIFEST_FILE" | while IFS= read -r name; do
		key=$(PROVIDER_NAME="$name" "$YQ" -r '.providers[strenv(PROVIDER_NAME)].key' "$MANIFEST_FILE")
		dir="$STORE_DIR/$key"
		interval=$(PROVIDER_NAME="$name" "$YQ" -r '.providers[strenv(PROVIDER_NAME)].interval // 3600' "$MANIFEST_FILE")
		last=0
		[ -s "$dir/last_update" ] && last=$(cat "$dir/last_update")
		case "$interval:$last" in *[!0-9:]*) continue ;; esac
		if [ "$interval" -gt 0 ] && [ $((last + interval)) -le "$now" ]; then
			enqueue_provider "$name" || true
		fi
	done
}

run_worker() {
	local request name manual
	prepare_dirs
	mkdir "$LOCK_DIR" 2>/dev/null || return 0
	printf '%s\n' "$$" > "$WORKER_PID"
	trap 'stop_probe; rm -f "$WORKER_PID"; rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT HUP INT TERM
	while :; do
		if ! manager_enabled; then
			rm -f "$QUEUE_DIR"/*.request
		fi
		request=$(find "$QUEUE_DIR" -maxdepth 1 -type f \( -name '*.manual' -o -name '*.request' \) 2>/dev/null | sort | head -n 1)
		[ -n "$request" ] || break
		name=$(cat "$request")
		manual=false
		case "$request" in *.manual) manual=true ;; esac
		rm -f "$request"
		log_event "[$name] started"
		update_one "$name" "$manual" || true
	done
}

start_worker() {
	nohup "$0" worker > /dev/null 2>&1 < /dev/null &
}

stop_manager() {
	local pid
	if pid=$(read_pid "$WORKER_PID"); then
		kill "$pid" 2>/dev/null || true
	fi
	stop_probe
	rm -f "$WORKER_PID" "$QUEUE_DIR"/*.request "$QUEUE_DIR"/*.manual
	rmdir "$LOCK_DIR" 2>/dev/null || true
	log_event "manager stopped"
}

case "${1:-}" in
	prepare)
		prepare_profile "${2:-$RUN_DIR/config.yaml}"
		;;
	enqueue)
		prepare_dirs
		enqueue_provider "$2" && start_worker
		;;
	manual)
		prepare_dirs
		enqueue_provider "$2" true && start_worker
		;;
	tick)
		prepare_dirs
		queue_due
		start_worker
		;;
	worker)
		run_worker
		;;
	stop)
		stop_manager
		;;
	*)
		echo "usage: $0 {prepare PROFILE|enqueue PROVIDER|manual PROVIDER|tick|worker|stop}" >&2
		exit 2
		;;
esac

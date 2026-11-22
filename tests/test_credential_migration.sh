#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
. "$ROOT_DIR/mihomox/files/scripts/include.sh"

# Exercise the real migration helpers against a small stateful UCI stub.
AUTH0_ENABLED=1
AUTH0_PASSWORD=2333
AUTH1_ENABLED=0
AUTH1_PASSWORD=2333
AUTH2_ENABLED=1
AUTH2_PASSWORD=
AUTH3_ENABLED=0
AUTH3_PASSWORD=
API_SECRET=2333
FAKE_FILTER=1
FAKE_FILTER_MODE=blacklist
FAKE_FILTERS=
UCI_SET_COUNT=0
ADD_LIST_COUNT=0

fixture_get() {
	case "$1" in
		mihomox.mixin.api_secret) printf '%s\n' "$API_SECRET" ;;
		'mihomox.@authentication[0]'|'mihomox.@authentication[1]'|'mihomox.@authentication[2]'|'mihomox.@authentication[3]') echo authentication ;;
		'mihomox.@authentication[0].enabled') printf '%s\n' "$AUTH0_ENABLED" ;;
		'mihomox.@authentication[0].password') printf '%s\n' "$AUTH0_PASSWORD" ;;
		'mihomox.@authentication[1].enabled') printf '%s\n' "$AUTH1_ENABLED" ;;
		'mihomox.@authentication[1].password') printf '%s\n' "$AUTH1_PASSWORD" ;;
		'mihomox.@authentication[2].enabled') printf '%s\n' "$AUTH2_ENABLED" ;;
		'mihomox.@authentication[2].password') printf '%s\n' "$AUTH2_PASSWORD" ;;
		'mihomox.@authentication[3].enabled') printf '%s\n' "$AUTH3_ENABLED" ;;
		'mihomox.@authentication[3].password') printf '%s\n' "$AUTH3_PASSWORD" ;;
		mihomox.mixin.fake_ip_filter) printf '%s\n' "$FAKE_FILTER" ;;
		mihomox.mixin.fake_ip_filter_mode) printf '%s\n' "$FAKE_FILTER_MODE" ;;
		mihomox.mixin.fake_ip_filters) printf '%s\n' "$FAKE_FILTERS" ;;
		*) return 1 ;;
	esac
}

fixture_set() {
	local assignment="$1" key value
	key=${assignment%%=*}
	value=${assignment#*=}
	case "$key" in
		mihomox.mixin.api_secret) API_SECRET="$value" ;;
		'mihomox.@authentication[0].password') AUTH0_PASSWORD="$value" ;;
		'mihomox.@authentication[1].password') AUTH1_PASSWORD="$value" ;;
		'mihomox.@authentication[2].password') AUTH2_PASSWORD="$value" ;;
		'mihomox.@authentication[3].password') AUTH3_PASSWORD="$value" ;;
		*) return 1 ;;
	esac
	UCI_SET_COUNT=$((UCI_SET_COUNT + 1))
}

fixture_add_list() {
	local assignment="$1" key value
	key=${assignment%%=*}
	value=${assignment#*=}
	[ "$key" = mihomox.mixin.fake_ip_filters ] || return 1
	FAKE_FILTERS="${FAKE_FILTERS:+$FAKE_FILTERS }$value"
	ADD_LIST_COUNT=$((ADD_LIST_COUNT + 1))
}

uci() {
	local command option
	[ "${1:-}" = "-q" ] && shift
	command=${1:-}
	[ "$#" -gt 0 ] && shift
	case "$command" in
		get) fixture_get "${1:-}" ;;
		show)
			[ "${1:-}" = mihomox ] || return 1
			cat <<'EOF'
mihomox.named_account=authentication
mihomox.@authentication[1]=authentication
mihomox.@authentication[2]=authentication
mihomox.@authentication[3]=authentication
EOF
			;;
		set) fixture_set "${1:-}" ;;
		add_list) fixture_add_list "${1:-}" ;;
		*) echo "unsupported UCI command: $command $*" >&2; return 1 ;;
	esac
}

ensure_credentials
[ "$API_SECRET" = 2333 ]
[ "$AUTH0_PASSWORD" = 2333 ]
[ "$AUTH1_PASSWORD" = 2333 ]
[ "$AUTH2_PASSWORD" = 2333 ]
[ -z "$AUTH3_PASSWORD" ] || {
	echo "an empty disabled password must remain unset" >&2
	exit 1
}
[ "$UCI_SET_COUNT" -eq 1 ] || {
	echo "only the empty enabled authentication password should be filled" >&2
	exit 1
}
[ "$MIHOMOX_CREDENTIALS_CHANGED" -eq 1 ]

# User-chosen and intentionally absent disabled credentials must not be touched.
API_SECRET=custom-api-secret
AUTH0_PASSWORD=custom-auth-password
AUTH1_PASSWORD=
AUTH2_PASSWORD=custom-second-password
AUTH3_PASSWORD=
UCI_SET_COUNT=0
ensure_credentials
[ "$API_SECRET" = custom-api-secret ]
[ "$AUTH0_PASSWORD" = custom-auth-password ]
[ -z "$AUTH1_PASSWORD" ]
[ "$AUTH2_PASSWORD" = custom-second-password ]
[ -z "$AUTH3_PASSWORD" ]
[ "$UCI_SET_COUNT" -eq 0 ]
[ "$MIHOMOX_CREDENTIALS_CHANGED" -eq 0 ]

# A missing API secret is filled with the fixed default without changing auth sections.
API_SECRET=
ensure_credentials
[ "$API_SECRET" = 2333 ]
[ "$AUTH0_PASSWORD" = custom-auth-password ]
[ "$AUTH2_PASSWORD" = custom-second-password ]
[ "$UCI_SET_COUNT" -eq 1 ] || {
	echo "missing API secret must only update the API field" >&2
	exit 1
}

# NCSI domains are appended once to the overwrite-only blacklist.
FAKE_FILTERS='dns.msftncsi.com custom.example'
ADD_LIST_COUNT=0
ensure_windows_ncsi_fake_ip_filters
[ "$ADD_LIST_COUNT" -eq 2 ]
[ "$FAKE_FILTERS" = 'dns.msftncsi.com custom.example www.msftncsi.com www.msftconnecttest.com' ]
ensure_windows_ncsi_fake_ip_filters
[ "$ADD_LIST_COUNT" -eq 2 ] || {
	echo "NCSI migration added duplicate domains" >&2
	exit 1
}

# Inherited subscription filters and non-blacklist modes must remain untouched.
for mode in whitelist rule; do
	FAKE_FILTER_MODE=$mode
	FAKE_FILTERS='custom.example'
	ADD_LIST_COUNT=0
	ensure_windows_ncsi_fake_ip_filters
	[ "$FAKE_FILTERS" = custom.example ]
	[ "$ADD_LIST_COUNT" -eq 0 ]
done
FAKE_FILTER_MODE=blacklist
FAKE_FILTER=0
FAKE_FILTERS='custom.example'
ADD_LIST_COUNT=0
ensure_windows_ncsi_fake_ip_filters
[ "$FAKE_FILTERS" = custom.example ]
[ "$ADD_LIST_COUNT" -eq 0 ]

echo 'credential and migration helper tests passed'

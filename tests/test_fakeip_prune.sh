#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/mihomox-fakeip-prune.XXXXXX")
trap 'rm -rf "$TEST_DIR"' EXIT HUP INT TERM

(
	. "$ROOT_DIR/mihomox/files/scripts/include.sh"
	TEMP_DIR="$TEST_DIR/tmp"
	mkdir -p "$TEMP_DIR"
	profile="$TEST_DIR/profile.yaml"
	printf 'fixture\n' > "$profile"
	log_calls="$TEST_DIR/log"

	log() {
		printf '%s\n' "$2" >> "$log_calls"
	}
	yq() {
		case "$*" in
			*'(.rule-providers // {}) | keys'*) printf 'cn\n' ;;
			*'(.dns."fake-ip-filter" // [])[]'*) printf '%s\n' 'RULE-SET,cn,real-ip' 'RULE-SET,missing,real-ip' 'rule-set:gone' '+.lan' ;;
			*'strenv(MIHOMOX_DROP_ENTRY)'*)
				printf '%s\n' "$MIHOMOX_DROP_ENTRY" >> "$TEST_DIR/dropped"
				;;
			*) return 1 ;;
		esac
	}

	prune_missing_fake_ip_rule_sets "$profile"
	[ "$(cat "$TEST_DIR/dropped")" = "RULE-SET,missing,real-ip
rule-set:gone" ]
	grep -Fq 'RULE-SET,missing,real-ip' "$log_calls"
	grep -Fq 'rule-set:gone' "$log_calls"
	[ "$(grep -Fxc 'RULE-SET,cn,real-ip' "$TEST_DIR/dropped" || true)" -eq 0 ]
)

echo 'Fake-IP rule-set prune tests passed'

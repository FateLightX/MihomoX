#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/mihomox-reload-test.XXXXXX")
trap 'rm -rf "$TEST_DIR"' EXIT HUP INT TERM
export TEST_DIR

# Load the actual init functions, replacing only device paths and dependencies.
sed '/^\. /d; s|/etc/crontabs/root|'"$TEST_DIR"'/crontab|g' \
	"$ROOT_DIR/mihomox/files/mihomox.init" > "$TEST_DIR/init"
CORE_PATH="$TEST_DIR/core"
extra_command() { :; }
. "$TEST_DIR/init"

RUN_DIR="$TEST_DIR/data"
TEMP_DIR="$TEST_DIR/run"
RUN_PROFILE_PATH="$TEMP_DIR/config.yaml"
STARTED_FLAG_PATH="$TEMP_DIR/started.flag"
SUBSCRIPTION_REFRESH_PENDING_PATH="$TEMP_DIR/subscription-refresh.pending"
PID_FILE_PATH="$TEMP_DIR/pid"
PROFILES_DIR="$TEST_DIR/profiles"
SUBSCRIPTIONS_DIR="$TEST_DIR/subscriptions"
CORE_LOG_PATH="$TEST_DIR/core.log"
MIXIN_UC="$TEST_DIR/mixin.uc"
mkdir -p "$RUN_DIR" "$TEMP_DIR" "$PROFILES_DIR" "$SUBSCRIPTIONS_DIR"
: > "$TEST_DIR/crontab"
printf 'new profile\n' > "$PROFILES_DIR/test.yaml"
cat > "$CORE_PATH" <<'EOF'
#!/bin/sh
echo tested >> "$TEST_DIR/events"
printf '%s\n' "$GOMAXPROCS" "$GOMEMLIMIT" "$SAFE_PATHS" \
	"$DISABLE_LOOPBACK_DETECTOR" "$QUIC_GO_DISABLE_GSO" \
	"$QUIC_GO_DISABLE_ECN" "$SKIP_SYSTEM_IPV6_CHECK" > "$TEST_DIR/test-env"
test ! -f "$TEST_DIR/core-fails"
EOF
chmod +x "$CORE_PATH"

prepare_files() { :; }
prepare_cache() { return 0; }
log() { :; }
uci() {
	case "$*" in
		'-q get mihomox.mixin.api_secret') echo fixture ;;
		'-q get mihomox.fixture') echo subscription ;;
	esac
}
config_load() { :; }
config_get() {
	local value="${4:-}"
	case "$2.$3" in
		config.enabled) value="$ENABLED" ;;
		config.profile) value="$PROFILE" ;;
		config.core_only) value="$CORE_ONLY" ;;
		config.test_profile) value=1 ;;
		core.*_listener_name) value=listener ;;
		procd.env_go_max_procs) value=2 ;;
		procd.env_go_mem_limit) value=64MiB ;;
		procd.env_safe_paths) value=/fixture ;;
		procd.env_*) value=1 ;;
		proxy.china_ip_update) value=0 ;;
	esac
	eval "$1=\$value"
}
config_get_bool() { config_get "$@"; }
is_safe_identifier() { return 0; }
is_valid_cron() { return 1; }
ucode() { echo '{}'; test ! -f "$TEST_DIR/mixin-fails"; }
yq() {
	local count
	count=$(cat "$TEST_DIR/yq-count")
	count=$((count + 1))
	echo "$count" > "$TEST_DIR/yq-count"
	[ "$count" != "$FAIL_READ" ] || return 1
	case "$*" in
		*' -e '*) return 1 ;;
		*'length)'*) echo 0 ;;
		*'// false'*) echo false ;;
		*' -p '*) echo '{}' ;;
	esac
}
cleanup() {
	[ "${1:-}" = keep_cache ] || return 1
	echo cleanup >> "$TEST_DIR/events"
	rm -f "$STARTED_FLAG_PATH"
}
# Emulate the rc.common wrapper that submits a definition even if its callback fails.
rc_procd() {
	echo open-service >> "$TEST_DIR/events"
	"$@"
	echo submit-service >> "$TEST_DIR/events"
}
procd_open_instance() { echo instance >> "$TEST_DIR/events"; }
procd_close_instance() { :; }
procd_set_param() { printf '%s\n' "$*" >> "$TEST_DIR/params"; }
procd_append_param() { procd_set_param "$@"; }
service_started() { echo routing >> "$TEST_DIR/events"; }
stop() { echo stopped >> "$TEST_DIR/events"; }
subscription_profile_valid() { [ -s "$1" ]; }
update_subscription() {
	# Candidate generation must keep the shared subscription lock directory.
	[ "$TEMP_DIR" = "$TEST_DIR/run" ] || return 1
	cp "$PROFILES_DIR/test.yaml" "$SUBSCRIPTIONS_DIR/$1.yaml"
}
mv() {
	local arg destination
	for arg in "$@"; do destination="$arg"; done
	if [ -f "$TEST_DIR/install-fails" ] && [ "$destination" = "$live_profile" ]; then
		return 1
	fi
	command mv "$@"
}

ENABLED=1
CORE_ONLY=1
FAIL_READ=0
PROFILE=file:test.yaml
reset_fixture() {
	printf 'old profile\n' > "$RUN_PROFILE_PATH"
	printf 'pending\n' > "$SUBSCRIPTION_REFRESH_PENDING_PATH"
	touch "$STARTED_FLAG_PATH"
	: > "$TEST_DIR/events"
	: > "$TEST_DIR/params"
	echo 0 > "$TEST_DIR/yq-count"
}
assert_preserved() {
	grep -q '^old profile$' "$RUN_PROFILE_PATH"
	[ -f "$STARTED_FLAG_PATH" ]
	grep -q '^pending$' "$SUBSCRIPTION_REFRESH_PENDING_PATH"
	! grep -Eq 'cleanup|service|instance|routing' "$TEST_DIR/events"
	for candidate in "$TEMP_DIR"/.profile.*; do [ ! -e "$candidate" ]; done
}

# Each required parser read must fail closed rather than supplying a fake default.
for FAIL_READ in 1 2 3 4 5 6 7 8; do
	reset_fixture
	if reload_service; then echo 'parser failure accepted' >&2; exit 1; fi
	assert_preserved
done
FAIL_READ=0
reset_fixture
touch "$TEST_DIR/core-fails"
if reload_service; then echo 'core validation failure accepted' >&2; exit 1; fi
assert_preserved
rm "$TEST_DIR/core-fails"

reset_fixture
mv "$PROFILES_DIR/test.yaml" "$PROFILES_DIR/missing.yaml"
if reload_service; then echo 'missing profile accepted' >&2; exit 1; fi
assert_preserved
mv "$PROFILES_DIR/missing.yaml" "$PROFILES_DIR/test.yaml"

reset_fixture
touch "$TEST_DIR/install-fails"
if reload_service; then echo 'failed config replacement accepted' >&2; exit 1; fi
assert_preserved
rm "$TEST_DIR/install-fails"

# Failed mixin generation must not be masked by the following successful yq.
CORE_ONLY=0
reset_fixture
touch "$TEST_DIR/mixin-fails"
if reload_service; then echo 'mixin failure accepted' >&2; exit 1; fi
assert_preserved
rm "$TEST_DIR/mixin-fails"
CORE_ONLY=1

reset_fixture
reload_service
grep -q '^new profile$' "$RUN_PROFILE_PATH"
printf 'tested\ncleanup\nopen-service\ninstance\nsubmit-service\nrouting\n' > "$TEST_DIR/expected-events"
cmp "$TEST_DIR/expected-events" "$TEST_DIR/events"
grep -Fxq "file $RUN_PROFILE_PATH" "$TEST_DIR/params"
grep -Fxq 'reload_signal HUP' "$TEST_DIR/params"
printf '2\n64MiB\n/fixture\n1\n1\n1\n1\n' > "$TEST_DIR/expected-env"
cmp "$TEST_DIR/expected-env" "$TEST_DIR/test-env"
for value in GOMAXPROCS=2 GOMEMLIMIT=64MiB SAFE_PATHS=/fixture \
	DISABLE_LOOPBACK_DETECTOR=1 QUIC_GO_DISABLE_GSO=1 \
	QUIC_GO_DISABLE_ECN=1 SKIP_SYSTEM_IPV6_CHECK=1; do
	grep -Fxq "env $value" "$TEST_DIR/params"
done
[ -f "$STARTED_FLAG_PATH" ]
[ ! -f "$SUBSCRIPTION_REFRESH_PENDING_PATH" ]
for candidate in "$TEMP_DIR"/.profile.*; do [ ! -e "$candidate" ]; done

# Normal starts still register in rc.common's existing procd context.
reset_fixture
rc_procd start_service
service_started
printf 'open-service\ntested\ninstance\nsubmit-service\nrouting\n' > "$TEST_DIR/expected-events"
cmp "$TEST_DIR/expected-events" "$TEST_DIR/events"
grep -Fxq "file $RUN_PROFILE_PATH" "$TEST_DIR/params"

# Subscription preparation shares the existing runtime directory and locks.
reset_fixture
PROFILE=subscription:fixture
reload_service
grep -q '^new profile$' "$RUN_PROFILE_PATH"
PROFILE=file:test.yaml

# Disabling via reload still stops the service without generating a profile.
ENABLED=0
reset_fixture
reload_service
[ "$(cat "$TEST_DIR/events")" = stopped ]

echo 'configuration reload tests passed'

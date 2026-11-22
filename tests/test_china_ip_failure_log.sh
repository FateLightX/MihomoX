#!/bin/sh

set -eu

# Functional test for the China IP updater failure diagnostics:
#   * a rejected CIDR is reported with its line number instead of being swallowed;
#   * an nft rejection reports nft's own first error line;
#   * the offending list survives the trap that wipes the temp directory.

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/mihomox-china-ip-fail.XXXXXX")
trap 'rm -rf "$TEST_DIR"' EXIT HUP INT TERM

mkdir -p "$TEST_DIR/scripts" "$TEST_DIR/bin" "$TEST_DIR/home/nftables" \
	"$TEST_DIR/run" "$TEST_DIR/log" "$TEST_DIR/keep"

# Redirect the packaged paths into the sandbox.
sed \
	-e 's|^HOME_DIR="/etc/mihomox"|HOME_DIR="'"$TEST_DIR"'/home"|' \
	-e 's|^LOG_DIR="/var/log/mihomox"|LOG_DIR="'"$TEST_DIR"'/log"|' \
	-e 's|^TEMP_DIR="/var/run/mihomox"|TEMP_DIR="'"$TEST_DIR"'/run"|' \
	"$ROOT_DIR/mihomox/files/scripts/include.sh" > "$TEST_DIR/scripts/include.sh"
cp "$ROOT_DIR/mihomox/files/scripts/update_china_ip.sh" "$TEST_DIR/scripts/update_china_ip.sh"

cat > "$TEST_DIR/bin/uci" <<'UCI'
#!/bin/sh
exit 1
UCI

cat > "$TEST_DIR/bin/curl" <<'CURL'
#!/bin/sh
out=""
url=""
while [ "$#" -gt 0 ]; do
	case "$1" in
		-o) out="$2"; shift 2 ;;
		-*) shift ;;
		*) url="$1"; shift ;;
	esac
done
case "$url" in
	*china6*) src="${CURL_SRC_V6:-}" ;;
	*) src="${CURL_SRC_V4:-}" ;;
esac
if [ -z "$src" ] || [ ! -f "$src" ]; then
	echo "curl: (22) The requested URL returned error: 404" >&2
	exit 22
fi
cp "$src" "$out"
CURL

cat > "$TEST_DIR/bin/nft" <<'NFT'
#!/bin/sh
# NFT_SET=1 simulates a live mihomox set; NFT_FAIL=1 makes validation fail.
case "$*" in
	--version) echo "nftables v1.0.9 (Old Doc Yak #3)" ;;
	"list set "*)
		[ "${NFT_SET:-0}" = "1" ] || exit 1
		;;
	*-c*-f*)
		if [ "${NFT_FAIL:-0}" = "1" ]; then
			echo "Error: Could not process rule: File exists" >&2
			exit 1
		fi
		;;
esac
exit 0
NFT

chmod 0755 "$TEST_DIR/bin/uci" "$TEST_DIR/bin/curl" "$TEST_DIR/bin/nft"

# 120 valid entries so the >100 entry guard passes.
make_ok_list() {
	family="$1"
	path="$2"
	i=1
	: > "$path"
	while [ "$i" -le 120 ]; do
		if [ "$family" = ipv4 ]; then
			printf '%s.%s.0.0/16\n' "$((i % 200))" "$((i % 250))" >> "$path"
		else
			printf '2408:%x::/32\n' "$i" >> "$path"
		fi
		i=$((i + 1))
	done
}

run_update() {
	PATH="$TEST_DIR/bin:$PATH" \
	MIHOMOX_KEEP_FAILED_DIR="$TEST_DIR/keep" \
	CURL_SRC_V4="$CURL_SRC_V4" \
	CURL_SRC_V6="$CURL_SRC_V6" \
	NFT_FAIL="${NFT_FAIL:-0}" \
	NFT_SET="${NFT_SET:-0}" \
	sh "$TEST_DIR/scripts/update_china_ip.sh"
}

LOG="$TEST_DIR/log/app.log"
CN4="$TEST_DIR/home/nftables/geoip_cn.nft"

# --- baseline: both families install ---------------------------------------
make_ok_list ipv4 "$TEST_DIR/good4.txt"
make_ok_list ipv6 "$TEST_DIR/good6.txt"
CURL_SRC_V4="$TEST_DIR/good4.txt"
CURL_SRC_V6="$TEST_DIR/good6.txt"
run_update
[ -s "$CN4" ]
[ -s "$TEST_DIR/home/nftables/geoip6_cn.nft" ]
[ "$(grep -c 'elements = {' "$CN4")" = "1" ]
[ ! -e "$TEST_DIR/keep/mihomox_china_ip_failed_ipv4.txt" ]

before=$(cat "$CN4")

# --- leading-zero octet is rejected with its line number -------------------
make_ok_list ipv4 "$TEST_DIR/bad4.txt"
printf '010.1.2.0/24\n' >> "$TEST_DIR/bad4.txt"
CURL_SRC_V4="$TEST_DIR/bad4.txt"

status=0
run_update || status=$?
[ "$status" -ne 0 ]
[ "$(cat "$CN4")" = "$before" ]
[ -f "$TEST_DIR/keep/mihomox_china_ip_failed_ipv4.txt" ]
grep -qx '010\.1\.2\.0/24' "$TEST_DIR/keep/mihomox_china_ip_failed_ipv4.txt"
grep -q 'format check rejected line 121: 010.1.2.0/24' "$LOG"
grep -q 'failed validation; try the next source' "$LOG"
grep -q 'every source failed' "$LOG"

# --- out-of-range prefix is rejected too -----------------------------------
make_ok_list ipv4 "$TEST_DIR/badprefix4.txt"
printf '1.2.3.0/33\n' >> "$TEST_DIR/badprefix4.txt"
CURL_SRC_V4="$TEST_DIR/badprefix4.txt"

status=0
run_update || status=$?
[ "$status" -ne 0 ]
grep -q 'line 121: 1.2.3.0/33' "$LOG"

# --- IPv6 prefix above 128 is rejected -------------------------------
make_ok_list ipv6 "$TEST_DIR/bad6.txt"
printf '2408:1::/129\n' >> "$TEST_DIR/bad6.txt"
CURL_SRC_V4="$TEST_DIR/good4.txt"
CURL_SRC_V6="$TEST_DIR/bad6.txt"

status=0
run_update || status=$?
[ "$status" -ne 0 ]
grep -q 'line 121: 2408:1::/129' "$LOG"

# --- nft rejection reports nft's first error and keeps the list ------------
make_ok_list ipv4 "$TEST_DIR/new4.txt"
printf '9.9.9.0/24\n' >> "$TEST_DIR/new4.txt"
CURL_SRC_V4="$TEST_DIR/new4.txt"
NFT_FAIL=1

status=0
run_update || status=$?
[ "$status" -ne 0 ]
[ "$(cat "$CN4")" = "$before" ]
grep -q 'nft rejected the candidate file' "$LOG"
grep -q 'Error: Could not process rule: File exists' "$LOG"
grep -q 'nftables v1.0.9' "$LOG"
grep -q 'source kept at .*mihomox_china_ip_failed_ipv4.txt' "$LOG"

# --- same, but the live set path (flush + add element) fails ---------------
rm -f "$TEST_DIR/keep/mihomox_china_ip_failed_ipv4.txt"
: > "$LOG"
make_ok_list ipv4 "$TEST_DIR/new4b.txt"
printf '8.8.4.0/24\n' >> "$TEST_DIR/new4b.txt"
CURL_SRC_V4="$TEST_DIR/new4b.txt"
NFT_SET=1
NFT_FAIL=1

status=0
run_update || status=$?
[ "$status" -ne 0 ]
[ "$(cat "$CN4")" = "$before" ]
grep -q 'nft set update failed (nft rejected the update)' "$LOG"
grep -q 'Error: Could not process rule: File exists' "$LOG"
[ -f "$TEST_DIR/keep/mihomox_china_ip_failed_ipv4.txt" ]
grep -qx '8.8.4.0/24' "$TEST_DIR/keep/mihomox_china_ip_failed_ipv4.txt"

# --- a later successful run still installs a changed list ------------------
make_ok_list ipv4 "$TEST_DIR/final4.txt"
printf '7.7.7.0/24\n' >> "$TEST_DIR/final4.txt"
CURL_SRC_V4="$TEST_DIR/final4.txt"
CURL_SRC_V6="$TEST_DIR/good6.txt"
NFT_SET=0
NFT_FAIL=0
status=0
run_update || status=$?
[ "$status" -eq 0 ]
grep -q 'list updated from' "$LOG"
grep -q '7.7.7.0/24' "$CN4"

echo "China IP failure diagnostics tests passed"

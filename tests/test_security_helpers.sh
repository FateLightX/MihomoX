#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
. "$ROOT_DIR/mihomox/files/scripts/include.sh"

is_valid_cron '0 3 * * *'
is_valid_cron '*/5 0-23 * * 1,3,5'

for invalid in \
	'* * * * * touch /tmp/pwned #' \
	'* * * *' \
	'* * * * *;reboot' \
	'* * * * *
reboot'
do
	if is_valid_cron "$invalid"; then
		echo "invalid cron expression accepted: $invalid" >&2
		exit 1
	fi
done

secret=$(generate_secret)
[ "${#secret}" -eq 64 ]
printf '%s\n' "$secret" | grep -Eq '^[0-9a-f]{64}$'

is_uint '1048576'
! is_uint '1;reboot'
is_safe_identifier 'mihomox-dummy'
! is_safe_identifier '../../etc'
is_valid_mark '0x80'
! is_valid_mark '0x80;flush'

echo "security helper tests passed"

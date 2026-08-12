#!/bin/sh

. "$IPKG_INSTROOT/etc/mihomox/scripts/include.sh"

# check mihomox.config.init
init=$(uci -q get mihomox.config.init); [ -z "$init" ] && return

# generate a cryptographically random API secret
api_secret=$(generate_secret) || exit 1

# set mihomox.mixin.api_secret
uci set mihomox.mixin.api_secret="$api_secret"

# replace the intentionally empty packaged password on a fresh installation
for auth_section in $(uci show mihomox 2>/dev/null | sed -n 's/^\(mihomox\.@authentication\[[0-9][0-9]*\]\)=authentication$/\1/p'); do
	auth_enabled=$(uci -q get "$auth_section.enabled")
	auth_password=$(uci -q get "$auth_section.password")
	if [ "$auth_enabled" = 1 ] && [ -z "$auth_password" ]; then
		auth_password=$(generate_secret) || exit 1
		uci set "$auth_section.password=$auth_password"
	fi
done

# initialize custom core checksum field for older configurations
[ -z "$(uci -q get mihomox.core.download_sha256)" ] && uci set mihomox.core.download_sha256=

# remove mihomox.config.init
uci del mihomox.config.init

# commit
uci commit mihomox

# exit with 0
exit 0

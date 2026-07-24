#!/bin/sh

. "$IPKG_INSTROOT/etc/mihomox/scripts/include.sh"

# check mihomox.config.init
init=$(uci -q get mihomox.config.init); [ -z "$init" ] && return

# generate cryptographically random credentials
api_secret=$(generate_secret) || exit 1
auth_password=$(generate_secret) || exit 1

# set mihomox.mixin.api_secret
uci set mihomox.mixin.api_secret="$api_secret"

# initialize custom core checksum field for older configurations
[ -z "$(uci -q get mihomox.core.download_sha256)" ] && uci set mihomox.core.download_sha256=

# set mihomox.@authentication[0].password
uci set mihomox.@authentication[0].password="$auth_password"

# remove mihomox.config.init
uci del mihomox.config.init

# commit
uci commit mihomox

# exit with 0
exit 0

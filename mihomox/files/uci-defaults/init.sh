#!/bin/sh

. "$IPKG_INSTROOT/etc/mihomox/scripts/include.sh"

# check mihomox.config.init
init=$(uci -q get mihomox.config.init); [ -z "$init" ] && return

# generate random string for api secret and authentication password
random=$(awk 'BEGIN{srand(); printf "%06d", int(rand() * 1000000)}')

# set mihomox.mixin.api_secret
uci set mihomox.mixin.api_secret="$random"

# set mihomox.@authentication[0].password
uci set mihomox.@authentication[0].password="$random"

# remove mihomox.config.init
uci del mihomox.config.init

# commit
uci commit mihomox

# exit with 0
exit 0

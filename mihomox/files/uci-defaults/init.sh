#!/bin/sh

. "$IPKG_INSTROOT/etc/mihomox/scripts/include.sh"

# check mihomox.config.init
init=$(uci -q get mihomox.config.init); [ -z "$init" ] && return

# rotate the historical public default and generate missing credentials
ensure_credentials || exit 1

# initialize custom core checksum field for older configurations
[ -z "$(uci -q get mihomox.core.download_sha256)" ] && uci set mihomox.core.download_sha256=

# remove mihomox.config.init
uci del mihomox.config.init

# commit
uci commit mihomox

# exit with 0
exit 0

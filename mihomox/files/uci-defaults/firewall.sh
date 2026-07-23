#!/bin/sh

. "$IPKG_INSTROOT/etc/mihomox/scripts/include.sh"

uci -q batch <<-EOF > /dev/null
	del firewall.mihomox
	set firewall.mihomox=include
	set firewall.mihomox.type=script
	set firewall.mihomox.path=$FIREWALL_INCLUDE_SH
	set firewall.mihomox.fw4_compatible=1
	commit firewall
EOF

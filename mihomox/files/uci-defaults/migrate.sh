#!/bin/sh

. "$IPKG_INSTROOT/etc/mihomox/scripts/include.sh"

# since v1.18.0

mixin_rule=$(uci -q get mihomox.mixin.rule); [ -z "$mixin_rule" ] && uci set mihomox.mixin.rule=0

mixin_rule_provider=$(uci -q get mihomox.mixin.rule_provider); [ -z "$mixin_rule_provider" ] && uci set mihomox.mixin.rule_provider=0

# since v1.19.0

uci show mihomox | grep -E 'mihomox\.@rule\[[[:digit:]]+\].match=' | sed 's/mihomox.@rule\[\([[:digit:]]\+\)\].match=.*/rename mihomox.@rule[\1].match=matcher/' | uci batch

# since v1.19.1

proxy_fake_ip_ping_hijack=$(uci -q get mihomox.proxy.fake_ip_ping_hijack); [ -z "$proxy_fake_ip_ping_hijack" ] && uci set mihomox.proxy.fake_ip_ping_hijack=0

# since v1.20.0

mixin_api_port=$(uci -q get mihomox.mixin.api_port); [ -n "$mixin_api_port" ] && {
	uci del mihomox.mixin.api_port
	uci set mihomox.mixin.api_listen="[::]:$mixin_api_port"
}

mixin_dns_port=$(uci -q get mihomox.mixin.dns_port); [ -n "$mixin_dns_port" ] && {
	uci del mihomox.mixin.dns_port
	uci set mihomox.mixin.dns_listen="[::]:$mixin_dns_port"
}

# since v1.22.0

proxy_transparent_proxy=$(uci -q get mihomox.proxy.transparent_proxy); [ -n "$proxy_transparent_proxy" ] && {
	uci rename mihomox.proxy.transparent_proxy=enabled
	uci rename mihomox.proxy.tcp_transparent_proxy_mode=tcp_mode
	uci rename mihomox.proxy.udp_transparent_proxy_mode=udp_mode

	uci add mihomox router_access_control
	uci set mihomox.@router_access_control[-1].enabled=1
	proxy_bypass_user=$(uci -q get mihomox.proxy.bypass_user); [ -n "$proxy_bypass_user" ] && {
		for router_access_control_user in $proxy_bypass_user; do
			uci add_list mihomox.@router_access_control[-1].user="$router_access_control_user"
		done
	}
	proxy_bypass_group=$(uci -q get mihomox.proxy.bypass_group); [ -n "$proxy_bypass_group" ] && {
		for router_access_control_group in $proxy_bypass_group; do
			uci add_list mihomox.@router_access_control[-1].group="$router_access_control_group"
		done
	}
	proxy_bypass_cgroup=$(uci -q get mihomox.proxy.bypass_cgroup); [ -n "$proxy_bypass_cgroup" ] && {
		for router_access_control_cgroup in $proxy_bypass_cgroup; do
			uci add_list mihomox.@router_access_control[-1].cgroup="$router_access_control_cgroup"
		done
	}
	uci set mihomox.@router_access_control[-1].proxy=0

	uci add mihomox router_access_control
	uci set mihomox.@router_access_control[-1].enabled=1
	uci set mihomox.@router_access_control[-1].proxy=1

	uci add_list mihomox.proxy.lan_inbound_interface=lan

	proxy_access_control_mode=$(uci -q get mihomox.proxy.access_control_mode)

	[ "$proxy_access_control_mode" != "all" ] && {
		proxy_acl_ip=$(uci -q get mihomox.proxy.acl_ip); [ -n "$proxy_acl_ip" ] && {
			for ip in $proxy_acl_ip; do
				uci add mihomox lan_access_control
				uci set mihomox.@lan_access_control[-1].enabled=1
				uci add_list mihomox.@lan_access_control[-1].ip="$ip"
				[ "$proxy_access_control_mode" = "allow" ] && uci set mihomox.@lan_access_control[-1].proxy=1
				[ "$proxy_access_control_mode" = "block" ] && uci set mihomox.@lan_access_control[-1].proxy=0
			done
		}
		proxy_acl_ip6=$(uci -q get mihomox.proxy.acl_ip6); [ -n "$proxy_acl_ip6" ] && {
			for ip6 in $proxy_acl_ip6; do
				uci add mihomox lan_access_control
				uci set mihomox.@lan_access_control[-1].enabled=1
				uci add_list mihomox.@lan_access_control[-1].ip6="$ip6"
				[ "$proxy_access_control_mode" = "allow" ] && uci set mihomox.@lan_access_control[-1].proxy=1
				[ "$proxy_access_control_mode" = "block" ] && uci set mihomox.@lan_access_control[-1].proxy=0
			done
		}
		proxy_acl_mac=$(uci -q get mihomox.proxy.acl_mac); [ -n "$proxy_acl_mac" ] && {
			for mac in $proxy_acl_mac; do
				uci add mihomox lan_access_control
				uci set mihomox.@lan_access_control[-1].enabled=1
				uci add_list mihomox.@lan_access_control[-1].mac="$mac"
				[ "$proxy_access_control_mode" = "allow" ] && uci set mihomox.@lan_access_control[-1].proxy=1
				[ "$proxy_access_control_mode" = "block" ] && uci set mihomox.@lan_access_control[-1].proxy=0
			done
		}
	}

	[ "$proxy_access_control_mode" != "allow" ] && {
		uci add mihomox lan_access_control
		uci set mihomox.@lan_access_control[-1].enabled=1
		uci set mihomox.@lan_access_control[-1].proxy=1
	}

	uci del mihomox.proxy.access_control_mode
	uci del mihomox.proxy.acl_ip
	uci del mihomox.proxy.acl_ip6
	uci del mihomox.proxy.acl_mac
	uci del mihomox.proxy.acl_interface
	uci del mihomox.proxy.bypass_user
	uci del mihomox.proxy.bypass_group
	uci del mihomox.proxy.bypass_cgroup
}

# since v1.23.0

section_routing=$(uci -q get mihomox.routing); [ -z "$section_routing" ] && {
	uci set mihomox.routing=routing
	uci set mihomox.routing.tproxy_fw_mark=0x80
	uci set mihomox.routing.tun_fw_mark=0x81
	uci set mihomox.routing.tproxy_rule_pref=1024
	uci set mihomox.routing.tun_rule_pref=1025
	uci set mihomox.routing.tproxy_route_table=80
	uci set mihomox.routing.tun_route_table=81
	uci set mihomox.routing.cgroup_id=0x12061206
	uci set mihomox.routing.cgroup_name=mihomox
}

proxy_tun_timeout=$(uci -q get mihomox.proxy.tun_timeout); [ -z "$proxy_tun_timeout" ] && uci set mihomox.proxy.tun_timeout=30

proxy_tun_interval=$(uci -q get mihomox.proxy.tun_interval); [ -z "$proxy_tun_interval" ] && uci set mihomox.proxy.tun_interval=1

# since v1.23.1

uci show mihomox | grep -o -E 'mihomox\.@router_access_control\[[[:digit:]]+\]=router_access_control' | cut -d '=' -f 1 | while read -r router_access_control; do
	for router_access_control_cgroup in $(uci -q get "$router_access_control.cgroup"); do
		[ -d "/sys/fs/cgroup/$router_access_control_cgroup" ] && continue
		[ -d "/sys/fs/cgroup/services/$router_access_control_cgroup" ] && {
			uci del_list "$router_access_control.cgroup=$router_access_control_cgroup"
			uci add_list "$router_access_control.cgroup=services/$router_access_control_cgroup"
		}
	done
done

# since v1.23.3

uci show mihomox | grep -o -E 'mihomox\.@router_access_control\[[[:digit:]]+\]=router_access_control' | cut -d '=' -f 1 | while read -r router_access_control; do
	router_access_control_proxy=$(uci -q get "$router_access_control.proxy")
	router_access_control_dns=$(uci -q get "$router_access_control.dns")
	[ -z "$router_access_control_dns" ] && uci set "$router_access_control.dns=$router_access_control_proxy"
done

uci show mihomox | grep -o -E 'mihomox\.@lan_access_control\[[[:digit:]]+\]=lan_access_control' | cut -d '=' -f 1 | while read -r lan_access_control; do
	lan_access_control_proxy=$(uci -q get "$lan_access_control.proxy")
	lan_access_control_dns=$(uci -q get "$lan_access_control.dns")
	[ -z "$lan_access_control_dns" ] && uci set "$lan_access_control.dns=$lan_access_control_proxy"
done

# since v1.24.0

proxy_reserved_ip=$(uci -q get mihomox.proxy.reserved_ip); [ -z "$proxy_reserved_ip" ] && {
	uci add_list mihomox.proxy.reserved_ip=0.0.0.0/8
	uci add_list mihomox.proxy.reserved_ip=10.0.0.0/8
	uci add_list mihomox.proxy.reserved_ip=127.0.0.0/8
	uci add_list mihomox.proxy.reserved_ip=100.64.0.0/10
	uci add_list mihomox.proxy.reserved_ip=169.254.0.0/16
	uci add_list mihomox.proxy.reserved_ip=172.16.0.0/12
	uci add_list mihomox.proxy.reserved_ip=192.168.0.0/16
	uci add_list mihomox.proxy.reserved_ip=224.0.0.0/4
	uci add_list mihomox.proxy.reserved_ip=240.0.0.0/4
}

proxy_reserved_ip6=$(uci -q get mihomox.proxy.reserved_ip6); [ -z "$proxy_reserved_ip6" ] && {
	uci add_list mihomox.proxy.reserved_ip6=::/128
	uci add_list mihomox.proxy.reserved_ip6=::1/128
	uci add_list mihomox.proxy.reserved_ip6=::ffff:0:0/96
	uci add_list mihomox.proxy.reserved_ip6=100::/64
	uci add_list mihomox.proxy.reserved_ip6=64:ff9b::/96
	uci add_list mihomox.proxy.reserved_ip6=2001::/32
	uci add_list mihomox.proxy.reserved_ip6=2001:10::/28
	uci add_list mihomox.proxy.reserved_ip6=2001:20::/28
	uci add_list mihomox.proxy.reserved_ip6=2001:db8::/32
	uci add_list mihomox.proxy.reserved_ip6=2002::/16
	uci add_list mihomox.proxy.reserved_ip6=fc00::/7
	uci add_list mihomox.proxy.reserved_ip6=fe80::/10
	uci add_list mihomox.proxy.reserved_ip6=ff00::/8
}

# since v1.24.3

proxy_bypass_china_mainland_ip=$(uci -q get mihomox.proxy.bypass_china_mainland_ip)
proxy_bypass_china_mainland_ip6=$(uci -q get mihomox.proxy.bypass_china_mainland_ip6)
[ -z "$proxy_bypass_china_mainland_ip6" ] && uci set mihomox.proxy.bypass_china_mainland_ip6=$proxy_bypass_china_mainland_ip

routing_tproxy_fw_mask=$(uci -q get mihomox.routing.tproxy_fw_mask); [ -z "$routing_tproxy_fw_mask" ] && uci set mihomox.routing.tproxy_fw_mask=0xFF
routing_tun_fw_mask=$(uci -q get mihomox.routing.tun_fw_mask); [ -z "$routing_tun_fw_mask" ] && uci set mihomox.routing.tun_fw_mask=0xFF

section_procd=$(uci -q get mihomox.procd); [ -z "$section_procd" ] && {
	uci set mihomox.procd=procd
	uci set mihomox.procd.fast_reload=$(uci -q get mihomox.config.fast_reload)
	uci set mihomox.procd.env_safe_paths=$(uci -q get mihomox.env.safe_paths)
	uci set mihomox.procd.env_disable_loopback_detector=$(uci -q get mihomox.env.disable_loopback_detector)
	uci set mihomox.procd.env_disable_quic_go_gso=$(uci -q get mihomox.env.disable_quic_go_gso)
	uci set mihomox.procd.env_disable_quic_go_ecn=$(uci -q get mihomox.env.disable_quic_go_ecn)
	uci set mihomox.procd.env_skip_system_ipv6_check=$(uci -q get mihomox.env.skip_system_ipv6_check)
	uci del mihomox.config.fast_reload
	uci del mihomox.env
}

# since v1.25.1

routing_dummy_device=$(uci -q get mihomox.routing.dummy_device); [ -z "$routing_dummy_device" ] && uci set mihomox.routing.dummy_device=mihomox-dummy

# since v1.25.2

section_core=$(uci -q get mihomox.core); [ -z "$section_core" ] && {
	uci set mihomox.core=core
	uci set mihomox.core.channel=Prerelease-Alpha
	uci set mihomox.core.architecture=auto
	uci set mihomox.core.mirror_prefix=
	uci set mihomox.core.download_url=
	uci set mihomox.core.redirect_listener_name=redir-in
	uci set mihomox.core.tproxy_listener_name=tproxy-in
	uci set mihomox.core.tun_listener_name=tun-in
}

# since v1.26.0

[ -z "$(uci -q get mihomox.core.channel)" ] && uci set mihomox.core.channel=Prerelease-Alpha
[ "$(uci -q get mihomox.core.channel)" = "stable" ] && uci set mihomox.core.channel=release
[ "$(uci -q get mihomox.core.channel)" = "alpha" ] && uci set mihomox.core.channel=Prerelease-Alpha
[ -z "$(uci -q get mihomox.core.architecture)" ] && uci set mihomox.core.architecture=auto
[ -z "$(uci -q get mihomox.core.mirror_prefix)" ] && uci set mihomox.core.mirror_prefix=
[ -z "$(uci -q get mihomox.core.download_url)" ] && uci set mihomox.core.download_url=

# since v1.25.3

config_scheduled_restart_cron=$(uci -q get mihomox.config.scheduled_restart_cron); [ -z "$config_scheduled_restart_cron" ] && uci rename mihomox.config.cron_expression="scheduled_restart_cron"

log_scheduled_clear=$(uci -q get mihomox.log.scheduled_clear); [ -z "$log_scheduled_clear" ] && uci set mihomox.log.scheduled_clear=1
log_scheduled_clear_cron=$(uci -q get mihomox.log.scheduled_clear_cron); [ -z "$log_scheduled_clear_cron" ] && uci set mihomox.log.scheduled_clear_cron="*/5 * * * *"
log_scheduled_clear_size_limit=$(uci -q get mihomox.log.scheduled_clear_size_limit); [ -z "$log_scheduled_clear_size_limit" ] && uci set mihomox.log.scheduled_clear_size_limit=1
log_scheduled_clear_size_limit_unit=$(uci -q get mihomox.log.scheduled_clear_size_limit_unit); [ -z "$log_scheduled_clear_size_limit_unit" ] && uci set mihomox.log.scheduled_clear_size_limit_unit=MB

# since v1.25.4

config_clear_at_stop=$(uci -q get mihomox.log.clear_at_stop); [ -z "$config_clear_at_stop" ] && uci set mihomox.log.clear_at_stop=1

# commit
uci commit mihomox

# exit with 0
exit 0

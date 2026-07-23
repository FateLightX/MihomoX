#!/bin/sh

# Import an existing Nikki installation once, without changing Nikki's files.
[ -s /etc/config/nikki ] || exit 0
[ "$(uci -q get mihomox.config.init)" = "1" ] || exit 0

for dir in profiles subscriptions; do
	[ -d "/etc/nikki/$dir" ] || continue
	mkdir -p "/etc/mihomox/$dir"
	cp -fpR "/etc/nikki/$dir/." "/etc/mihomox/$dir/" 2>/dev/null || true
done

[ -f /etc/nikki/mixin.yaml ] && cp -fp /etc/nikki/mixin.yaml /etc/mihomox/mixin.yaml

cp -fp /etc/config/nikki /etc/config/mihomox.new
sed -i "s/'nikki'/'mihomox'/g; s/\"nikki\"/\"mihomox\"/g" /etc/config/mihomox.new
mv -f /etc/config/mihomox.new /etc/config/mihomox

uci -q delete mihomox.config.init
uci set mihomox.config.enabled=0
uci set mihomox.routing.cgroup_name=mihomox
uci set mihomox.routing.dummy_device=mihomox-dummy
uci set mihomox.mixin.tun_device=mihomox
uci set mihomox.core.channel="$(uci -q get mihomox.core.channel || echo stable)"
uci set mihomox.core.architecture="$(uci -q get mihomox.core.architecture || echo auto)"
uci set mihomox.core.mirror_prefix="$(uci -q get mihomox.core.mirror_prefix || true)"
uci set mihomox.core.download_url="$(uci -q get mihomox.core.download_url || true)"
uci commit mihomox

exit 0

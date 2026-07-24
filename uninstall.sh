#!/bin/sh

# MihomoX's uninstaller

# uninstall
if [ -x "/bin/opkg" ]; then
	opkg list-installed luci-i18n-mihomox-* | cut -d ' ' -f 1 | xargs -r opkg remove
	opkg remove luci-app-mihomox
	opkg remove mihomox
elif [ -x "/usr/bin/apk" ]; then
	apk list --installed --manifest luci-i18n-mihomox-* | cut -d ' ' -f 1 | xargs -r apk del
	apk del luci-app-mihomox
	apk del mihomox
fi
# remove config
rm -f /etc/config/mihomox
# remove files
rm -rf /etc/mihomox
# remove log
rm -rf /var/log/mihomox
# remove temp
rm -rf /var/run/mihomox
# remove feed
if [ -x "/bin/opkg" ]; then
	if grep -q mihomox /etc/opkg/customfeeds.conf; then
		sed -i '/mihomox/d' /etc/opkg/customfeeds.conf
	fi
	key_file=$(mktemp /tmp/mihomox-key.XXXXXX) || exit 1
	trap 'rm -f "$key_file"' EXIT HUP INT TERM
	wget -O "$key_file" "${MIHOMOX_FEED_URL:-https://mihomox.pages.dev}/key-build.pub"
	opkg-key remove "$key_file"
	rm -f "$key_file"
	trap - EXIT HUP INT TERM
elif [ -x "/usr/bin/apk" ]; then
	if grep -q mihomox /etc/apk/repositories.d/customfeeds.list; then
		sed -i '/mihomox/d' /etc/apk/repositories.d/customfeeds.list
	fi
	rm -f /etc/apk/keys/mihomox.pem
fi

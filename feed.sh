#!/bin/sh

# MihomoX's feed

# check env
if { [ ! -x "/bin/opkg" ] && [ ! -x "/usr/bin/apk" ]; } || [ ! -x "/sbin/fw4" ]; then
	echo "only supports OpenWrt build with firewall4!"
	exit 1
fi

# include openwrt_release
. /etc/openwrt_release

# get branch/arch
arch="$DISTRIB_ARCH"
branch=
case "$DISTRIB_RELEASE" in
	*"24.10"*)
		branch="openwrt-24.10"
		;;
	*"25.12"*)
		branch="openwrt-25.12"
		;;
	"SNAPSHOT")
		branch="SNAPSHOT"
		;;
	*)
		echo "unsupported release: $DISTRIB_RELEASE"
		exit 1
		;;
esac

# feed url
repository_url="${MIHOMOX_FEED_URL:-https://mihomox.pages.dev}"
feed_url="$repository_url/$branch/$arch/mihomox"

if [ -x "/bin/opkg" ]; then
	# add key
	echo "add key"
	key_build_pub_file=$(mktemp /tmp/mihomox-key.XXXXXX) || exit 1
	trap 'rm -f "$key_build_pub_file"' EXIT HUP INT TERM
	wget -O "$key_build_pub_file" "$repository_url/key-build.pub"
	[ -s "$key_build_pub_file" ] || { echo "invalid feed signing key" >&2; exit 1; }
	opkg-key add "$key_build_pub_file"
	rm -f "$key_build_pub_file"
	trap - EXIT HUP INT TERM
	# add feed
	echo "add feed"
	if grep -q mihomox /etc/opkg/customfeeds.conf; then
		sed -i '/mihomox/d' /etc/opkg/customfeeds.conf
	fi
	echo "src/gz mihomox $feed_url" >> /etc/opkg/customfeeds.conf
	# update feeds
	echo "update feeds"
	opkg update
elif [ -x "/usr/bin/apk" ]; then
	# add key
	echo "add key"
	mkdir -p /etc/apk/keys
	key_tmp="/etc/apk/keys/mihomox.pem.tmp.$$"
	trap 'rm -f "$key_tmp"' EXIT HUP INT TERM
	wget -O "$key_tmp" "$repository_url/public-key.pem"
	[ -s "$key_tmp" ] || { echo "invalid APK signing key" >&2; exit 1; }
	chmod 0644 "$key_tmp"
	mv -f "$key_tmp" /etc/apk/keys/mihomox.pem
	trap - EXIT HUP INT TERM
	# add feed
	echo "add feed"
	if grep -q mihomox /etc/apk/repositories.d/customfeeds.list; then
		sed -i '/mihomox/d' /etc/apk/repositories.d/customfeeds.list
	fi
	echo "$feed_url/packages.adb" >> /etc/apk/repositories.d/customfeeds.list
	# update feeds
	echo "update feeds"
	apk update
fi

echo "success"

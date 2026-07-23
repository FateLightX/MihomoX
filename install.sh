#!/bin/sh

# MihomoX's installer

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
	# update feeds
	echo "update feeds"
	opkg update
	# get languages
	echo "get languages"
	languages=$(opkg list-installed luci-i18n-base-* | cut -d ' ' -f 1 | cut -d '-' -f 4-)
	# get latest version
	echo "get latest version"
	wget -O mihomox.version $feed_url/index.json
	# install ipks
	echo "install ipks"
	eval "$(jsonfilter -i mihomox.version -e "mihomox_version=@['packages']['mihomox']" -e "luci_app_mihomox_version=@['packages']['luci-app-mihomox']")"
	opkg install "$feed_url/mihomox_${mihomox_version}_${arch}.ipk"
	opkg install "$feed_url/luci-app-mihomox_${luci_app_mihomox_version}_all.ipk"
	for lang in $languages; do
		lang_version=$(jsonfilter -i mihomox.version -e "@['packages']['luci-i18n-mihomox-${lang}']")
		opkg install "$feed_url/luci-i18n-mihomox-${lang}_${lang_version}_all.ipk"
	done

	rm -f mihomox.version
elif [ -x "/usr/bin/apk" ]; then
	# update feeds
	echo "update feeds"
	apk update
	# get languages
	echo "get languages"
	languages=$(apk list --installed --manifest luci-i18n-base-* | cut -d ' ' -f 1 | cut -d '-' -f 4-)
	# install apks from remote repository
	echo "install apks from remote repository"
	apk add --allow-untrusted -X "$feed_url/packages.adb" mihomox luci-app-mihomox
	for lang in $languages; do
		apk add --allow-untrusted -X $feed_url/packages.adb "luci-i18n-mihomox-${lang}"
	done
fi

echo "success"

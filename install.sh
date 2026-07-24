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
	version_file=$(mktemp /tmp/mihomox-version.XXXXXX) || exit 1
	trap 'rm -f "$version_file"' EXIT HUP INT TERM
	wget -O "$version_file" "$feed_url/index.json"
	# install ipks
	echo "install ipks"
	mihomox_version=$(jsonfilter -i "$version_file" -e "@['packages']['mihomox']")
	luci_app_mihomox_version=$(jsonfilter -i "$version_file" -e "@['packages']['luci-app-mihomox']")
	case "$mihomox_version:$luci_app_mihomox_version" in
		*[!A-Za-z0-9._+~:-]*) echo "invalid package version metadata" >&2; exit 1 ;;
	esac
	[ -n "$mihomox_version" ] && [ -n "$luci_app_mihomox_version" ] || { echo "missing package version metadata" >&2; exit 1; }
	opkg install "$feed_url/mihomox_${mihomox_version}_${arch}.ipk"
	opkg install "$feed_url/luci-app-mihomox_${luci_app_mihomox_version}_all.ipk"
	for lang in $languages; do
		lang_version=$(jsonfilter -i "$version_file" -e "@['packages']['luci-i18n-mihomox-${lang}']")
		case "$lang:$lang_version" in
			*[!A-Za-z0-9._+~:-]*) echo "invalid language package metadata" >&2; exit 1 ;;
		esac
		[ -n "$lang" ] && [ -n "$lang_version" ] || continue
		opkg install "$feed_url/luci-i18n-mihomox-${lang}_${lang_version}_all.ipk"
	done

	rm -f "$version_file"
	trap - EXIT HUP INT TERM
elif [ -x "/usr/bin/apk" ]; then
	# add repository signing key before refreshing or installing packages
	echo "add key"
	mkdir -p /etc/apk/keys
	key_tmp="/etc/apk/keys/mihomox.pem.tmp.$$"
	trap 'rm -f "$key_tmp"' EXIT HUP INT TERM
	wget -O "$key_tmp" "$repository_url/public-key.pem"
	[ -s "$key_tmp" ] || { echo "invalid APK signing key" >&2; exit 1; }
	chmod 0644 "$key_tmp"
	mv -f "$key_tmp" /etc/apk/keys/mihomox.pem
	trap - EXIT HUP INT TERM
	# update feeds
	echo "update feeds"
	apk update
	# get languages
	echo "get languages"
	languages=$(apk list --installed --manifest luci-i18n-base-* | cut -d ' ' -f 1 | cut -d '-' -f 4-)
	# install apks from remote repository
	echo "install apks from remote repository"
	apk add -X "$feed_url/packages.adb" mihomox luci-app-mihomox
	for lang in $languages; do
		apk add -X "$feed_url/packages.adb" "luci-i18n-mihomox-${lang}"
	done
fi

echo "success"

include $(TOPDIR)/rules.mk

PKG_NAME:=mihomox
PKG_VERSION:=2026.7.25
PKG_RELEASE:=12

MIHOMO_SOURCE_VERSION:=7198c9dc1eeba39e12cf37176a6ad1ff9cda3732
MIHOMO_BUILD_VERSION:=alpha-7198c9d
PKG_SOURCE:=mihomo-$(MIHOMO_SOURCE_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/MetaCubeX/mihomo/tar.gz/$(MIHOMO_SOURCE_VERSION)?
PKG_HASH:=6d42395e39e58e051df397c5e8289de7ada0e3f9bb22867b81e6ad3b9c4c1e99
PKG_BUILD_DIR:=$(BUILD_DIR)/mihomo-$(MIHOMO_SOURCE_VERSION)
PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16
GEOSITE_URL?=https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geosite.dat
GEOIP_MMDB_URL?=https://raw.githubusercontent.com/Loyalsoldier/geoip/release/Country.mmdb
GEOIP_DAT_URL?=https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geoip.dat
GEOIP_ASN_URL?=https://github.com/xishang0128/geoip/releases/download/latest/GeoLite2-ASN.mmdb
ZASHBOARD_URL?=https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip
GEOSITE_SHA256?=
GEOIP_MMDB_SHA256?=
GEOIP_DAT_SHA256?=
GEOIP_ASN_SHA256?=
ZASHBOARD_SHA256?=

PKG_LICENSE:=GPL3.0+
PKG_MAINTAINER:=MihomoX contributors

GO_PKG:=github.com/metacubex/mihomo
GO_PKG_BUILD_PKG:=github.com/metacubex/mihomo
GO_PKG_LDFLAGS_X:=$(GO_PKG)/constant.Version=$(MIHOMO_BUILD_VERSION) $(GO_PKG)/constant.BuildTime=$(SOURCE_DATE_EPOCH)
GO_PKG_TAGS:=with_gvisor
GO_PKG_INSTALL_BIN_PATH:=/etc/mihomox/bin

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/mihomox
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Transparent Proxy with Mihomo on OpenWrt.
  URL:=https://github.com/nikkinikki-org/OpenWrt-nikki
  DEPENDS:=$(GO_ARCH_DEPENDS) +ca-bundle +curl +yq +firewall4 +ip-full +jsonfilter +ucode +coreutils-nohup +kmod-inet-diag +kmod-nft-socket +kmod-nft-tproxy +kmod-tun +kmod-dummy
endef

define Package/mihomox/conffiles
/etc/config/mihomox
/etc/mihomox/mixin.yaml
/etc/mihomox/bin/mihomo
/etc/mihomox/bin/mihomo.version
endef

define Package/mihomox/install
	$(INSTALL_DIR) $(1)/etc/mihomox
	$(INSTALL_DIR) $(1)/etc/mihomox/bin
	$(INSTALL_DIR) $(1)/etc/mihomox/ucode
	$(INSTALL_DIR) $(1)/etc/mihomox/scripts
	$(INSTALL_DIR) $(1)/etc/mihomox/nftables
	$(INSTALL_DIR) $(1)/etc/mihomox/profiles
	$(INSTALL_DIR) $(1)/etc/mihomox/subscriptions
	$(INSTALL_DIR) $(1)/etc/mihomox/run
	$(INSTALL_DIR) $(1)/etc/mihomox/run/providers
	$(INSTALL_DIR) $(1)/etc/mihomox/run/providers/rule
	$(INSTALL_DIR) $(1)/etc/mihomox/run/providers/proxy
	$(INSTALL_DIR) $(1)/etc/mihomox/run/ui

	$(INSTALL_DATA) $(CURDIR)/files/mixin.yaml $(1)/etc/mihomox/mixin.yaml
	$(call GoPackage/Package/Install/Bin,$(1))
	printf '%s\n' \
		'version=$(MIHOMO_BUILD_VERSION)' \
		'channel=Prerelease-Alpha' \
		'release=$(MIHOMO_SOURCE_VERSION)' \
		> $(1)/etc/mihomox/bin/mihomo.version
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/GeoSite.dat $(1)/etc/mihomox/run/GeoSite.dat
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/Country.mmdb $(1)/etc/mihomox/run/Country.mmdb
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/GeoIP.dat $(1)/etc/mihomox/run/GeoIP.dat
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/ASN.mmdb $(1)/etc/mihomox/run/ASN.mmdb
	$(CP) $(PKG_BUILD_DIR)/zashboard/. $(1)/etc/mihomox/run/ui/

	$(INSTALL_BIN) $(CURDIR)/files/ucode/include.uc $(1)/etc/mihomox/ucode/include.uc
	$(INSTALL_BIN) $(CURDIR)/files/ucode/mixin.uc $(1)/etc/mihomox/ucode/mixin.uc
	$(INSTALL_BIN) $(CURDIR)/files/ucode/hijack.ut $(1)/etc/mihomox/ucode/hijack.ut

	$(INSTALL_BIN) $(CURDIR)/files/scripts/include.sh $(1)/etc/mihomox/scripts/include.sh
	$(INSTALL_BIN) $(CURDIR)/files/scripts/firewall_include.sh $(1)/etc/mihomox/scripts/firewall_include.sh
	$(INSTALL_BIN) $(CURDIR)/files/scripts/debug.sh $(1)/etc/mihomox/scripts/debug.sh
	$(INSTALL_BIN) $(CURDIR)/files/scripts/update_core.sh $(1)/etc/mihomox/scripts/update_core.sh

	$(INSTALL_BIN) $(CURDIR)/files/nftables/geoip_cn.nft $(1)/etc/mihomox/nftables/geoip_cn.nft
	$(INSTALL_BIN) $(CURDIR)/files/nftables/geoip6_cn.nft $(1)/etc/mihomox/nftables/geoip6_cn.nft

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) $(CURDIR)/files/mihomox.conf $(1)/etc/config/mihomox

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) $(CURDIR)/files/mihomox.init $(1)/etc/init.d/mihomox

	$(INSTALL_DIR) $(1)/usr/libexec/mihomox
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/mihomox-stun $(1)/usr/libexec/mihomox/stun-test

	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) $(CURDIR)/files/uci-defaults/import_nikki.sh $(1)/etc/uci-defaults/98_import_nikki_to_mihomox
	$(INSTALL_BIN) $(CURDIR)/files/uci-defaults/firewall.sh $(1)/etc/uci-defaults/99_firewall_mihomox
	$(INSTALL_BIN) $(CURDIR)/files/uci-defaults/init.sh $(1)/etc/uci-defaults/99_init_mihomox
	$(INSTALL_BIN) $(CURDIR)/files/uci-defaults/migrate.sh $(1)/etc/uci-defaults/99_migrate_mihomox

	$(INSTALL_DIR) $(1)/lib/upgrade/keep.d
	$(INSTALL_DATA) $(CURDIR)/files/mihomox.upgrade $(1)/lib/upgrade/keep.d/mihomox
endef

define Package/mihomox/postrm
#!/bin/sh
if [ -z $${IPKG_INSTROOT} ]; then
	uci -q batch <<-EOF > /dev/null
		del firewall.mihomox
		commit firewall
	EOF
fi
endef

define Build/Compile
	$(call GoPackage/Build/Compile)
	$(TARGET_CC) $(TARGET_CFLAGS) $(TARGET_CPPFLAGS) -std=c99 -Wall -Wextra \
		-o $(PKG_BUILD_DIR)/mihomox-stun $(CURDIR)/src/mihomox-stun.c $(TARGET_LDFLAGS)
endef

define Build/Prepare
	$(call Build/Prepare/Default)
	# Build/Prepare/Default overlays package src/ into the Go module root.
	$(RM) $(PKG_BUILD_DIR)/mihomox-stun.c
	$(RM) -r $(PKG_BUILD_DIR)/rules/logic_test
	$(CURDIR)/scripts/fetch_geodata.sh \
		--dl-dir "$(DL_DIR)" \
		--output-dir "$(PKG_BUILD_DIR)" \
		--geosite-url "$(GEOSITE_URL)" \
		--geoip-mmdb-url "$(GEOIP_MMDB_URL)" \
		--geoip-dat-url "$(GEOIP_DAT_URL)" \
		--geoip-asn-url "$(GEOIP_ASN_URL)" \
		--geosite-sha256 "$(GEOSITE_SHA256)" \
		--geoip-mmdb-sha256 "$(GEOIP_MMDB_SHA256)" \
		--geoip-dat-sha256 "$(GEOIP_DAT_SHA256)" \
		--geoip-asn-sha256 "$(GEOIP_ASN_SHA256)"
	$(CURDIR)/scripts/fetch_zashboard.sh \
		--dl-dir "$(DL_DIR)" \
		--output-dir "$(PKG_BUILD_DIR)/zashboard" \
		--url "$(ZASHBOARD_URL)" \
		--sha256 "$(ZASHBOARD_SHA256)"
endef

$(eval $(call BuildPackage,mihomox))

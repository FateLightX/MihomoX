include $(TOPDIR)/rules.mk

PKG_NAME:=mihomox
PKG_VERSION:=2026.7.25
PKG_RELEASE:=15

PKG_BUILD_DIR:=$(BUILD_DIR)/mihomox-$(PKG_VERSION)
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

include $(INCLUDE_DIR)/package.mk

define Package/mihomox
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Transparent Proxy with Mihomo on OpenWrt.
  URL:=https://github.com/FateLightX/MihomoX
  DEPENDS:=
  EXTRA_DEPENDS:=ca-bundle (>=0), curl (>=0), yq (>=0), firewall4 (>=0), ip-full (>=0), jsonfilter (>=0), ucode (>=0), coreutils-nohup (>=0), kmod-inet-diag (>=0), kmod-nft-socket (>=0), kmod-nft-tproxy (>=0), kmod-tun (>=0), kmod-dummy (>=0)
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
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/mihomo $(1)/etc/mihomox/bin/mihomo
	$(INSTALL_DATA) $(PKG_BUILD_DIR)/mihomo.version $(1)/etc/mihomox/bin/mihomo.version
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
	$(INSTALL_BIN) $(CURDIR)/files/scripts/update_china_ip.sh $(1)/etc/mihomox/scripts/update_china_ip.sh

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
	$(TARGET_CC) $(TARGET_CFLAGS) $(TARGET_CPPFLAGS) -std=c99 -Wall -Wextra \
		-o $(PKG_BUILD_DIR)/mihomox-stun $(CURDIR)/src/mihomox-stun.c $(TARGET_LDFLAGS)
endef

define Build/Prepare
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CURDIR)/scripts/fetch_mihomo.sh \
		--arch "$(ARCH_PACKAGES)" \
		--dl-dir "$(DL_DIR)" \
		--output "$(PKG_BUILD_DIR)/mihomo" \
		--version-file "$(PKG_BUILD_DIR)/mihomo.version" \
		--channel Prerelease-Alpha
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

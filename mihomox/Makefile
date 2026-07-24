include $(TOPDIR)/rules.mk

PKG_NAME:=mihomox
PKG_VERSION:=2026.07.24
PKG_RELEASE:=2

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

MIHOMO_TARGET_ARCH:=$(if $(ARCH_PACKAGES),$(ARCH_PACKAGES),$(ARCH))
MIHOMO_AMD64_LEVEL?=v1
MIHOMO_VERSION?=
MIHOMO_CHANNEL?=Prerelease-Alpha
MIHOMO_MIRROR_PREFIX?=
GEOSITE_URL?=https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geosite.dat
GEOIP_MMDB_URL?=https://raw.githubusercontent.com/Loyalsoldier/geoip/release/Country.mmdb
GEOIP_DAT_URL?=https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/release/geoip.dat
GEOIP_ASN_URL?=https://github.com/xishang0128/geoip/releases/download/latest/GeoLite2-ASN.mmdb
ZASHBOARD_URL?=https://github.com/Zephyruso/zashboard/releases/latest/download/dist.zip

PKG_LICENSE:=GPL3.0+
PKG_MAINTAINER:=MihomoX contributors

include $(INCLUDE_DIR)/package.mk

define Package/mihomox
  SECTION:=net
  CATEGORY:=Network
  TITLE:=Transparent Proxy with Mihomo on OpenWrt.
  URL:=https://github.com/nikkinikki-org/OpenWrt-nikki
  DEPENDS:=+ca-bundle +curl +yq +firewall4 +ip-full +jsonfilter +ucode +coreutils-nohup +kmod-inet-diag +kmod-nft-socket +kmod-nft-tproxy +kmod-tun +kmod-dummy
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

	$(INSTALL_BIN) $(CURDIR)/files/nftables/geoip_cn.nft $(1)/etc/mihomox/nftables/geoip_cn.nft
	$(INSTALL_BIN) $(CURDIR)/files/nftables/geoip6_cn.nft $(1)/etc/mihomox/nftables/geoip6_cn.nft

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) $(CURDIR)/files/mihomox.conf $(1)/etc/config/mihomox

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) $(CURDIR)/files/mihomox.init $(1)/etc/init.d/mihomox

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

endef

define Build/Prepare
	$(RM) -r $(PKG_BUILD_DIR)
	$(INSTALL_DIR) $(PKG_BUILD_DIR)
	$(CURDIR)/scripts/fetch_mihomo.sh \
		--arch "$(MIHOMO_TARGET_ARCH)" \
		--amd64-level "$(MIHOMO_AMD64_LEVEL)" \
		--channel "$(MIHOMO_CHANNEL)" \
		--version "$(MIHOMO_VERSION)" \
		--mirror-prefix "$(MIHOMO_MIRROR_PREFIX)" \
		--dl-dir "$(DL_DIR)" \
		--output "$(PKG_BUILD_DIR)/mihomo" \
		--version-file "$(PKG_BUILD_DIR)/mihomo.version"
	$(CURDIR)/scripts/fetch_geodata.sh \
		--dl-dir "$(DL_DIR)" \
		--output-dir "$(PKG_BUILD_DIR)" \
		--geosite-url "$(GEOSITE_URL)" \
		--geoip-mmdb-url "$(GEOIP_MMDB_URL)" \
		--geoip-dat-url "$(GEOIP_DAT_URL)" \
		--geoip-asn-url "$(GEOIP_ASN_URL)"
	$(CURDIR)/scripts/fetch_zashboard.sh \
		--dl-dir "$(DL_DIR)" \
		--output-dir "$(PKG_BUILD_DIR)/zashboard" \
		--url "$(ZASHBOARD_URL)"
endef

$(eval $(call BuildPackage,mihomox))

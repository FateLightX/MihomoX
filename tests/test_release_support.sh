#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

assert_feed_target() {
	script="$1"
	release="$2"
	arch="$3"
	expected_status="$4"
	expected_message="$5"
	fixture=$(mktemp -d)
	mkdir -p "$fixture/bin" "$fixture/sbin" "$fixture/etc"
	printf '#!/bin/sh\nexit 0\n' > "$fixture/sbin/fw4"
	cat > "$fixture/bin/opkg" <<-'EOF'
	#!/bin/sh
	case "$1" in
		list-installed) exit 0 ;;
		*) exit 0 ;;
	esac
	EOF
	cat > "$fixture/bin/wget" <<-'EOF'
	#!/bin/sh
	while [ "$#" -gt 0 ]; do
		case "$1" in
			-O) output="$2"; shift 2 ;;
			*) shift ;;
		esac
	done
	case "$output" in
		*version*) printf '%s\n' '{"packages":{"mihomox":"1","luci-app-mihomox":"1"}}' > "$output" ;;
		*) printf '%s\n' 'fixture' > "$output" ;;
	esac
	EOF
	cat > "$fixture/bin/jsonfilter" <<-'EOF'
	#!/bin/sh
	case "$*" in
		*"luci-app-mihomox"*) printf '%s\n' 1 ;;
		*"mihomox"*) printf '%s\n' 1 ;;
		*) exit 1 ;;
	esac
	EOF
	printf '#!/bin/sh\nexit 0\n' > "$fixture/bin/opkg-key"
	chmod +x "$fixture/sbin/fw4" "$fixture/bin/opkg"
	chmod +x "$fixture/bin/wget" "$fixture/bin/jsonfilter" "$fixture/bin/opkg-key"
	: > "$fixture/etc/customfeeds.conf"
	cat > "$fixture/etc/openwrt_release" <<-EOF
	DISTRIB_RELEASE='$release'
	DISTRIB_ARCH='$arch'
	EOF
	awk -v root="$fixture" '
		/^[.] \/etc\/openwrt_release$/ { print ". \"" root "/etc/openwrt_release\""; next }
		{
			gsub("/bin/opkg", root "/bin/opkg")
			gsub("/usr/bin/apk", root "/usr/bin/apk")
			gsub("/sbin/fw4", root "/sbin/fw4")
			gsub("/etc/opkg/customfeeds.conf", root "/etc/customfeeds.conf")
			print
		}' "$ROOT_DIR/$script" > "$fixture/script.sh"
	set +e
	output=$(PATH="$fixture/bin:$PATH" sh "$fixture/script.sh" 2>&1)
	status=$?
	set -e
	rm -rf "$fixture"
	[ "$status" -eq "$expected_status" ] || { echo "$script returned $status, expected $expected_status" >&2; exit 1; }
	printf '%s\n' "$output" | grep -Fq "$expected_message"
}

for script in feed.sh install.sh; do
	grep -Fq 'set -eu' "$ROOT_DIR/$script"
	grep -Fq '[ "$arch" = "x86_64" ]' "$ROOT_DIR/$script"
	grep -Fq '*"25.12"*) branch="openwrt-25.12"' "$ROOT_DIR/$script"
	if grep -Eq 'openwrt-(23[.]05|24[.]10)|"SNAPSHOT"' "$ROOT_DIR/$script"; then
		echo "$script must match the published OpenWrt 25.12 x86_64 feed" >&2
		exit 1
	fi
	assert_feed_target "$script" 24.10 x86_64 1 'published feed: OpenWrt 25.12 only'
	assert_feed_target "$script" 25.12.0 aarch64_cortex-a53 1 'published feed: x86_64 only'
	assert_feed_target "$script" 25.12.0 x86_64 0 'success'
done

grep -Fq '使用公开安装脚本或 Feed：OpenWrt 25.12、`x86_64`' "$ROOT_DIR/README.md"
grep -Fq '公开安装脚本、Feed 和 CI 产物只覆盖 OpenWrt 25.12 x86_64' "$ROOT_DIR/AGENTS.md"

stale_workflow="$ROOT_DIR/.github/workflows/stale-issues.yml"
grep -Fq 'days-before-issue-stale: 30' "$stale_workflow"
grep -Fq 'days-before-issue-close: 14' "$stale_workflow"
if grep -Eq 'days-before-issue-(stale|close): (1|3)$' "$stale_workflow"; then
	echo "stale issue lifecycle is too aggressive" >&2
	exit 1
fi

for workflow in build-packages.yml release-packages.yml; do
	workflow_path="$ROOT_DIR/.github/workflows/$workflow"
	grep -Fq 'ARCH: x86_64-openwrt-25.12' "$workflow_path"
	grep -Fq 'bin/packages/x86_64/mihomox' "$workflow_path"
	if grep -Eq 'openwrt-(23[.]05|24[.]10)|SNAPSHOT|matrix[.](arch|branch)' "$workflow_path"; then
		echo "$workflow must only build x86_64 for OpenWrt 25.12" >&2
		exit 1
	fi
done

release_workflow="$ROOT_DIR/.github/workflows/release-packages.yml"
mihomox_version=$(sed -n 's/^PKG_VERSION:=//p' "$ROOT_DIR/mihomox/Makefile" | head -n1)
mihomox_release=$(sed -n 's/^PKG_RELEASE:=//p' "$ROOT_DIR/mihomox/Makefile" | head -n1)
luci_version=$(sed -n 's/^PKG_VERSION:=//p' "$ROOT_DIR/luci-app-mihomox/Makefile" | head -n1)
luci_release=$(sed -n 's/^PKG_RELEASE:=//p' "$ROOT_DIR/luci-app-mihomox/Makefile" | head -n1)
[ "$mihomox_version" = "$luci_version" ] || { echo "package versions must match" >&2; exit 1; }
release_version="v${mihomox_version}-${mihomox_release}-${luci_release}"
printf '%s\n' "$release_version" | grep -Eq '^v[0-9]+[.][0-9]+[.][0-9]+([.-][0-9A-Za-z.-]+)?$'
grep -Fq 'run: ./tests/run.sh' "$release_workflow"
grep -Fq "release_version=\"v\${mihomox_version}-\${mihomox_release}-\${luci_release}\"" "$release_workflow"
grep -Fq 'mihomox_version=$(sed -n '\''s/^PKG_VERSION:=//p'\'' mihomox/Makefile | head -n1)' "$release_workflow"
grep -Fq 'mihomox_release=$(sed -n '\''s/^PKG_RELEASE:=//p'\'' mihomox/Makefile | head -n1)' "$release_workflow"
grep -Fq 'luci_version=$(sed -n '\''s/^PKG_VERSION:=//p'\'' luci-app-mihomox/Makefile | head -n1)' "$release_workflow"
grep -Fq 'luci_release=$(sed -n '\''s/^PKG_RELEASE:=//p'\'' luci-app-mihomox/Makefile | head -n1)' "$release_workflow"
grep -Fq 'tag_name: ${{ needs.validate.outputs.release_version }}' "$release_workflow"
grep -Fq 'name: ${{ needs.validate.outputs.release_version }}' "$release_workflow"
grep -Fq "if: env.CLOUDFLARE_ACCOUNT_ID != '' && env.CLOUDFLARE_API_TOKEN != ''" "$release_workflow"
if grep -Eq 'inputs:|default: v1.0.0|RELEASE_VERSION' "$release_workflow"; then
	echo "release version must be derived from package Makefiles" >&2
	exit 1
fi
if grep -Fq "github.event_name == 'push'" "$release_workflow"; then
	echo "manual releases must not skip GitHub Release publishing" >&2
	exit 1
fi

echo "release support tests passed"

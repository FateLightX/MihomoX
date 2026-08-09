#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

for script in feed.sh install.sh; do
	grep -Fq 'set -eu' "$ROOT_DIR/$script"
	grep -Fq '*"23.05"*)' "$ROOT_DIR/$script"
	grep -Fq 'branch="openwrt-23.05"' "$ROOT_DIR/$script"
done

grep -Fq 'OpenWrt 23.05、24.10、25.12 或 SNAPSHOT' "$ROOT_DIR/README.md"

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

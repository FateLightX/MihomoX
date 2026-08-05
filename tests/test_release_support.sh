#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

for script in feed.sh install.sh; do
	grep -Fq '*"23.05"*)' "$ROOT_DIR/$script"
	grep -Fq 'branch="openwrt-23.05"' "$ROOT_DIR/$script"
done

grep -Fq 'OpenWrt 23.05、24.10、25.12 或 SNAPSHOT' "$ROOT_DIR/README.md"

for workflow in build-packages.yml release-packages.yml; do
	workflow_path="$ROOT_DIR/.github/workflows/$workflow"
	grep -Fq 'resolve latest Mihomo Alpha' "$workflow_path"
	grep -Fq 'use resolved Mihomo Alpha' "$workflow_path"
	grep -Fq 'MIHOMO_SOURCE_VERSION:' "$workflow_path"
	grep -Fq 'MIHOMO_SOURCE_HASH:' "$workflow_path"
	grep -Fq 'ARCH: x86_64-openwrt-25.12' "$workflow_path"
	grep -Fq 'bin/packages/x86_64/mihomox' "$workflow_path"
	if grep -Eq 'openwrt-(23[.]05|24[.]10)|SNAPSHOT|matrix[.](arch|branch)' "$workflow_path"; then
		echo "$workflow must only build x86_64 for OpenWrt 25.12" >&2
		exit 1
	fi
done

release_workflow="$ROOT_DIR/.github/workflows/release-packages.yml"
grep -Fq 'default: v1.0.0' "$release_workflow"
grep -Fq 'tag_name: ${{ needs.resolve.outputs.release_version }}' "$release_workflow"
grep -Fq 'name: ${{ needs.resolve.outputs.release_version }}' "$release_workflow"
grep -Fq "if: env.CLOUDFLARE_ACCOUNT_ID != '' && env.CLOUDFLARE_API_TOKEN != ''" "$release_workflow"
if grep -Fq "github.event_name == 'push'" "$release_workflow"; then
	echo "manual releases must not skip GitHub Release publishing" >&2
	exit 1
fi

echo "release support tests passed"

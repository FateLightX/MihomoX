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
	grep -Fq -- '- openwrt-23.05' "$workflow_path"
	grep -Fq "matrix.branch == 'openwrt-23.05' && '23.05.5' || matrix.branch" "$workflow_path"
	grep -Fq 'resolve latest Mihomo Alpha' "$workflow_path"
	grep -Fq 'use resolved Mihomo Alpha' "$workflow_path"
	grep -Fq 'MIHOMO_SOURCE_VERSION:' "$workflow_path"
	grep -Fq 'MIHOMO_SOURCE_HASH:' "$workflow_path"
done

for workflow in build-packages.yml release-packages.yml; do
	workflow_path="$ROOT_DIR/.github/workflows/$workflow"
	grep -Fq 'ARCH: x86_64-${{' "$workflow_path"
	grep -Fq 'bin/packages/x86_64/mihomox' "$workflow_path"
	if grep -Fq 'matrix.arch' "$workflow_path"; then
		echo "$workflow must only build x86_64" >&2
		exit 1
	fi
done

echo "release support tests passed"

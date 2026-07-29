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
	for arch in aarch64_cortex-a76 riscv64_generic loongarch64_generic; do
		awk -v arch="$arch" '
			$0 ~ "^[[:space:]]*- arch: " arch "$" { found_arch = 1; next }
			found_arch && $0 ~ "^[[:space:]]*branch: openwrt-23\\.05$" { found = 1; exit }
			found_arch { exit }
			END { exit !found }
		' "$workflow_path"
	done
done

echo "release support tests passed"

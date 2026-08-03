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
done

build_workflow="$ROOT_DIR/.github/workflows/build-packages.yml"
grep -Fq 'ARCH: x86_64-${{' "$build_workflow"
grep -Fq 'path: bin/packages/x86_64/mihomox' "$build_workflow"
if grep -Fq 'matrix.arch' "$build_workflow"; then
	echo "build-packages.yml must only build x86_64" >&2
	exit 1
fi

release_workflow="$ROOT_DIR/.github/workflows/release-packages.yml"
for arch in aarch64_cortex-a76 riscv64_generic loongarch64_generic; do
	awk -v arch="$arch" '
		$0 ~ "^[[:space:]]*- arch: " arch "$" { found_arch = 1; next }
		found_arch && $0 ~ "^[[:space:]]*branch: openwrt-23\\.05$" { found = 1; exit }
		found_arch { exit }
		END { exit !found }
	' "$release_workflow"
done

echo "release support tests passed"

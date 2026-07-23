#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
FETCH_SCRIPT="$ROOT_DIR/mihomox/scripts/fetch_mihomo.sh"

while read -r openwrt_arch expected; do
	actual=$($FETCH_SCRIPT --arch "$openwrt_arch" --map-only)
	if [ "$actual" != "$expected" ]; then
		echo "$openwrt_arch: expected $expected, got $actual" >&2
		exit 1
	fi
done <<'EOF'
x86_64 linux-amd64-v1
i386_pentium4 linux-386
aarch64_generic linux-arm64
arm_cortex-a5_vfpv4 linux-armv7
arm_cortex-a7_neon-vfpv4 linux-armv7
arm_arm1176jzf-s_vfp linux-armv6
arm_arm926ej-s linux-armv5
mips_24kc linux-mips-softfloat
mipsel_24kc linux-mipsle-softfloat
mips64_octeonplus linux-mips64
mips64el_mips64r2 linux-mips64le
riscv64_generic linux-riscv64
loongarch64_generic linux-loong64-abi2
EOF

[ "$($FETCH_SCRIPT --arch x86_64 --amd64-level v2 --map-only)" = "linux-amd64-v2" ]
[ "$($FETCH_SCRIPT --arch x86_64 --amd64-level v3 --map-only)" = "linux-amd64-v3" ]

ALPHA_TEST_DIR=$(mktemp -d)
printf '%s\n' '<a href="/MetaCubeX/mihomo/releases/download/Prerelease-Alpha/mihomo-linux-amd64-v1-alpha-test123.gz">alpha</a>' > "$ALPHA_TEST_DIR/assets.html"
[ "$($FETCH_SCRIPT --arch x86_64 --channel Prerelease-Alpha --alpha-assets-url "file://$ALPHA_TEST_DIR/assets.html" --resolve-alpha-only)" = "mihomo-linux-amd64-v1-alpha-test123.gz" ]
rm -rf "$ALPHA_TEST_DIR"

echo "fetch architecture tests passed"

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
version_script="$ROOT_DIR/scripts/release-version.sh"

[ -x "$version_script" ] || { echo "release-version.sh must be executable" >&2; exit 1; }

# The workflow must derive the tag through the shared script, so the scheme is
# testable outside CI instead of being an inline shell expression.
grep -Fq 'run: ./tests/run.sh' "$release_workflow"
grep -Fq 'release_version=$(./scripts/release-version.sh --check-remote)' "$release_workflow"
# An existing tag would make action-gh-release append to the previous release,
# so CI must refuse it rather than publish a stale build.
grep -Fq -- '--check-remote' "$version_script"
grep -Fq 'already exists on origin' "$version_script"
grep -Fq 'tag_name: ${{ needs.validate.outputs.release_version }}' "$release_workflow"
grep -Fq 'name: MihomoX ${{ needs.validate.outputs.release_version }}' "$release_workflow"
grep -Fq "if: env.CLOUDFLARE_ACCOUNT_ID != '' && env.CLOUDFLARE_API_TOKEN != ''" "$release_workflow"
if grep -Fq "github.event_name == 'push'" "$release_workflow"; then
	echo "manual releases must not skip GitHub Release publishing" >&2
	exit 1
fi

# The tag is the dated PKG_VERSION; a further release of the same version appends
# one incrementing number derived from PKG_RELEASE.
assert_version_tag() {
	version="$1"
	release="$2"
	luci_release="$3"
	expected_status="$4"
	expected_tag="$5"
	expected_message="${6:-}"
	fixture=$(mktemp -d)
	mkdir -p "$fixture/mihomox" "$fixture/luci-app-mihomox" "$fixture/scripts"
	cp "$version_script" "$fixture/scripts/release-version.sh"
	{
		printf 'PKG_NAME:=mihomox\n'
		printf 'PKG_VERSION:=%s\n' "$version"
		printf 'PKG_RELEASE:=%s\n' "$release"
	} > "$fixture/mihomox/Makefile"
	{
		printf 'PKG_VERSION:=%s\n' "$version"
		printf 'PKG_RELEASE:=%s\n' "$luci_release"
	} > "$fixture/luci-app-mihomox/Makefile"

	set +e
	output=$("$fixture/scripts/release-version.sh" 2>&1)
	status=$?
	set -e
	rm -rf "$fixture"

	[ "$status" -eq "$expected_status" ] || {
		echo "release-version.sh returned $status for version=$version release=$release, expected $expected_status" >&2
		printf '%s\n' "$output" >&2
		exit 1
	}
	if [ "$expected_status" -eq 0 ]; then
		[ "$output" = "$expected_tag" ] || {
			echo "version=$version release=$release produced '$output', expected '$expected_tag'" >&2
			exit 1
		}
	else
		printf '%s\n' "$output" | grep -Fq "$expected_message" || {
			echo "version=$version release=$release did not report: $expected_message" >&2
			printf '%s\n' "$output" >&2
			exit 1
		}
	fi
}

assert_version_tag 2026.9.18 1 1 0 v2026.9.18 ''
assert_version_tag 2026.9.18 2 2 0 v2026.9.18.1 ''
assert_version_tag 2026.9.18 3 3 0 v2026.9.18.2 ''
assert_version_tag 2026.9.19 1 1 0 v2026.9.19 ''
assert_version_tag 2026.10.1 1 1 0 v2026.10.1 ''
assert_version_tag 2026.9.18 1 2 1 'package releases must match'
assert_version_tag 2026.9.18 2 3 1 'package releases must match'
assert_version_tag 1.26.1 1 1 1 'PKG_VERSION must be a dated version'
assert_version_tag 2026-9-18 1 1 1 'PKG_VERSION must be a dated version'
assert_version_tag 20260918 1 1 1 'PKG_VERSION must be a dated version'
assert_version_tag 2026.9 1 1 1 'PKG_VERSION must be a dated version'
# A zero-padded date is accepted and echoed verbatim, never reformatted.
assert_version_tag 2026.09.18 1 1 0 v2026.09.18 ''
assert_version_tag 2026.09.18 2 2 0 v2026.09.18.1 ''
assert_version_tag 2026.9.18 0 0 1 'PKG_RELEASE must be at least 1'
assert_version_tag 2026.9.18 1 1 0 v2026.9.18 ''

# The current checkout must resolve to a valid dated tag.
current_tag=$("$version_script")
printf '%s\n' "$current_tag" | grep -Eq '^v[0-9]{4}[.][0-9]{1,2}[.][0-9]{1,2}([.][0-9]+)?$' || {
	echo "current release tag is malformed: $current_tag" >&2
	exit 1
}
current_version=$(sed -n 's/^PKG_VERSION:=//p' "$ROOT_DIR/mihomox/Makefile" | head -n1)
case "$current_tag" in
	"v$current_version"|"v$current_version".*) ;;
	*) echo "release tag $current_tag does not match PKG_VERSION $current_version" >&2; exit 1 ;;
esac

# The old scheme embedded package release numbers in the tag; it must not return.
if grep -Eq 'release_version="v\$\{mihomox_version\}-' "$release_workflow"; then
	echo "release tag must not embed PKG_RELEASE numbers" >&2
	exit 1
fi

echo "release support tests passed"

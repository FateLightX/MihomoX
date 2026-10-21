#!/bin/sh
# Resolve the GitHub Release tag for the current package version.
#
# Scheme: the version is the current UTC+8 date, e.g. 2026.10.21, and the tag is
# v<version>. A further release on the same date appends one incrementing number,
# v2026.10.21.1 then v2026.10.21.2, so a repeated run never reuses a tag that
# action-gh-release would then append to.
#
# The version is derived from the date instead of being read from the Makefiles,
# so a release cannot ship a stale date when nobody remembers to bump
# PKG_VERSION. The sync job writes the resolved version and revision back into
# both Makefiles, so the built packages and the Release tag always agree.
#
# usage: release-version.sh [--root DIR] [--date YYYY.M.D] [--check-remote]
#                            [--pkg-version] [--pkg-release] [--emit]
#                            [--set-pkg-version V] [--set-pkg-release N]
#   --root DIR            repository root (default: parent of this script's directory)
#   --date YYYY.M.D       use this date instead of the current UTC+8 date
#   --check-remote        consult origin and roll the revision forward past every
#                         tag this date already published, so a repeated run
#                         publishes the next revision instead of failing on a
#                         duplicate tag
#   --pkg-version         print only the resolved PKG_VERSION (needs --check-remote)
#   --pkg-release         print only the resolved PKG_RELEASE (needs --check-remote)
#   --emit                print release_version=, pkg_version= and pkg_release=
#                         lines suitable for $GITHUB_OUTPUT (needs --check-remote)
#   --set-pkg-version V   write PKG_VERSION=V into both Makefiles
#   --set-pkg-release N   write PKG_RELEASE=N into both Makefiles
#
# Prints the tag on stdout. Exits non-zero, with a message on stderr, when the
# version rules are not met.

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

CHECK_REMOTE=0
PRINT_PKG_VERSION=0
PRINT_PKG_RELEASE=0
EMIT=0
OVERRIDE_DATE=
SET_PKG_VERSION=
SET_PKG_RELEASE=

while [ "$#" -gt 0 ]; do
	case "$1" in
		--root) ROOT_DIR=$2; shift 2 ;;
		--date) OVERRIDE_DATE=$2; shift 2 ;;
		--check-remote) CHECK_REMOTE=1; shift ;;
		--pkg-version) PRINT_PKG_VERSION=1; shift ;;
		--pkg-release) PRINT_PKG_RELEASE=1; shift ;;
		--emit) EMIT=1; shift ;;
		--set-pkg-version) SET_PKG_VERSION=$2; shift 2 ;;
		--set-pkg-release) SET_PKG_RELEASE=$2; shift 2 ;;
		*)
			echo "usage: $0 [--root DIR] [--date YYYY.M.D] [--check-remote]" >&2
			echo "          [--pkg-version] [--pkg-release] [--emit]" >&2
			echo "          [--set-pkg-version V] [--set-pkg-release N]" >&2
			exit 2
			;;
	esac
done

fail() {
	echo "$*" >&2
	exit 1
}

read_makefile_var() {
	file=$1
	name=$2
	sed -n "s/^${name}:=//p" "$file" | head -n1
}

# Rewrite PKG_<name> in both Makefiles, verifying the result before the tracked
# file is touched so a failed run never leaves a half-written Makefile behind.
write_makefile_var() {
	name=$1
	value=$2

	for makefile in "$MIHOMOX_MAKEFILE" "$LUCI_MAKEFILE"; do
		tmp="$makefile.tmp.$$"
		if ! sed "s/^${name}:=.*$/${name}:=$value/" "$makefile" > "$tmp"; then
			rm -f "$tmp"
			fail "could not rewrite $makefile"
		fi
		if ! grep -q "^${name}:=$value$" "$tmp"; then
			rm -f "$tmp"
			fail "rewriting $makefile did not produce ${name}:=$value"
		fi
		cat "$tmp" > "$makefile" || { rm -f "$tmp"; fail "could not write $makefile"; }
		rm -f "$tmp"
	done

	written=$(read_makefile_var "$MIHOMOX_MAKEFILE" "$name")
	luci_written=$(read_makefile_var "$LUCI_MAKEFILE" "$name")
	[ "$written" = "$value" ] || fail "mihomox/Makefile $name is $written after write"
	[ "$luci_written" = "$value" ] || fail "luci-app-mihomox/Makefile $name is $luci_written after write"

	printf '%s\n' "$name set to $value in both packages" >&2
}

check_dated_version() {
	printf '%s\n' "$1" | grep -Eq '^[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}$' || \
		fail "release version must be a dated version such as 2026.9.18, got: $1"
}

# The release version is always the UTC+8 date, so a forgotten bump cannot
# publish a stale date. Extract each field and strip leading zeros manually
# instead of relying on the GNU-only %-m / %-d extensions.
today_utc8() {
	_year=$(TZ=Asia/Shanghai date '+%Y' 2>/dev/null) || return 1
	_month=$(TZ=Asia/Shanghai date '+%m' 2>/dev/null) || return 1
	_day=$(TZ=Asia/Shanghai date '+%d' 2>/dev/null) || return 1
	[ -n "$_year" ] && [ -n "$_month" ] && [ -n "$_day" ] || return 1
	_month=$(printf '%s\n' "$_month" | sed 's/^0*//')
	_day=$(printf '%s\n' "$_day" | sed 's/^0*//')
	[ -n "$_month" ] || _month=0
	[ -n "$_day" ] || _day=0
	printf '%s.%s.%s\n' "$_year" "$_month" "$_day"
}

MIHOMOX_MAKEFILE="$ROOT_DIR/mihomox/Makefile"
LUCI_MAKEFILE="$ROOT_DIR/luci-app-mihomox/Makefile"
[ -f "$MIHOMOX_MAKEFILE" ] || fail "missing $MIHOMOX_MAKEFILE"
[ -f "$LUCI_MAKEFILE" ] || fail "missing $LUCI_MAKEFILE"

mihomox_version=$(read_makefile_var "$MIHOMOX_MAKEFILE" PKG_VERSION)
luci_version=$(read_makefile_var "$LUCI_MAKEFILE" PKG_VERSION)
mihomox_release=$(read_makefile_var "$MIHOMOX_MAKEFILE" PKG_RELEASE)
luci_release=$(read_makefile_var "$LUCI_MAKEFILE" PKG_RELEASE)

[ -n "$mihomox_version" ] || fail "mihomox/Makefile has no PKG_VERSION"
[ -n "$luci_version" ] || fail "luci-app-mihomox/Makefile has no PKG_VERSION"
[ -n "$mihomox_release" ] || fail "mihomox/Makefile has no PKG_RELEASE"
[ -n "$luci_release" ] || fail "luci-app-mihomox/Makefile has no PKG_RELEASE"

# The two packages must agree with each other; the release version itself comes
# from the date below and is written back by the sync job.
[ "$mihomox_version" = "$luci_version" ] || \
	fail "package versions must match: mihomox=$mihomox_version luci=$luci_version"
[ "$mihomox_release" = "$luci_release" ] || \
	fail "package releases must match: mihomox=$mihomox_release luci=$luci_release"

printf '%s\n' "$mihomox_release" | grep -Eq '^[0-9]+$' || \
	fail "PKG_RELEASE must be a positive integer, got: $mihomox_release"
[ "$mihomox_release" -ge 1 ] || fail "PKG_RELEASE must be at least 1"

if [ -n "$SET_PKG_VERSION" ]; then
	check_dated_version "$SET_PKG_VERSION"
	write_makefile_var PKG_VERSION "$SET_PKG_VERSION"
	exit 0
fi

if [ -n "$SET_PKG_RELEASE" ]; then
	printf '%s\n' "$SET_PKG_RELEASE" | grep -Eq '^[0-9]+$' || \
		fail "PKG_RELEASE to set must be a positive integer, got: $SET_PKG_RELEASE"
	[ "$SET_PKG_RELEASE" -ge 1 ] || fail "PKG_RELEASE to set must be at least 1"
	write_makefile_var PKG_RELEASE "$SET_PKG_RELEASE"
	exit 0
fi

if [ -n "$OVERRIDE_DATE" ]; then
	version=$OVERRIDE_DATE
else
	version=$(today_utc8) || version=
	[ -n "$version" ] || fail "could not determine the current UTC+8 date"
fi
check_dated_version "$version"

tag_for_release() {
	if [ "$1" -eq 1 ]; then
		printf 'v%s\n' "$version"
	else
		printf 'v%s.%s\n' "$version" "$(( $1 - 1 ))"
	fi
}

check_tag_shape() {
	printf '%s\n' "$1" | grep -Eq '^v[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}(\.[0-9]+)?$' || \
		fail "derived tag is malformed: $1"
}

tag_exists_on_origin() {
	tag=$1
	existing=$(git -C "$ROOT_DIR" ls-remote --tags origin "refs/tags/$tag" 2>&1) || \
		fail "could not query origin for tag $tag: $existing"
	[ -n "$existing" ]
}

# Each published release consumes its tag, so the revision always starts at 1 for
# the date and rolls forward to the first free one.
effective_release=1

if [ "$CHECK_REMOTE" -eq 1 ]; then
	attempt=0
	while tag_exists_on_origin "$(tag_for_release "$effective_release")"; do
		effective_release=$(( effective_release + 1 ))
		attempt=$(( attempt + 1 ))
		[ "$attempt" -le 100 ] || fail "gave up after 100 taken revisions for $version"
	done
fi

tag=$(tag_for_release "$effective_release")
check_tag_shape "$tag"

if [ "$PRINT_PKG_VERSION" -eq 1 ] || [ "$PRINT_PKG_RELEASE" -eq 1 ] || [ "$EMIT" -eq 1 ]; then
	[ "$CHECK_REMOTE" -eq 1 ] || fail "--pkg-version, --pkg-release and --emit require --check-remote"
fi

if [ "$PRINT_PKG_VERSION" -eq 1 ]; then
	printf '%s\n' "$version"
	exit 0
fi

if [ "$PRINT_PKG_RELEASE" -eq 1 ]; then
	printf '%s\n' "$effective_release"
	exit 0
fi

if [ "$EMIT" -eq 1 ]; then
	printf 'release_version=%s\n' "$tag"
	printf 'pkg_version=%s\n' "$version"
	printf 'pkg_release=%s\n' "$effective_release"
	exit 0
fi

printf '%s\n' "$tag"

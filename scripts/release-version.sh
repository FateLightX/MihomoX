#!/bin/sh
# Resolve the GitHub Release tag for the current package version.
#
# Scheme: the tag is the dated PKG_VERSION, e.g. v2026.9.18. A further release of
# the same version (same day) appends one incrementing number, e.g. v2026.9.18.1
# then v2026.9.18.2. A new date changes PKG_VERSION and resets PKG_RELEASE to 1,
# which returns the plain dated tag again.
#
# The counter is derived from PKG_RELEASE so the release tag can never drift from
# the package revision published to the feed: PKG_RELEASE 1 -> v<version>,
# PKG_RELEASE 2 -> v<version>.1, PKG_RELEASE 3 -> v<version>.2.
#
# usage: release-version.sh [--root DIR] [--check-remote] [--pkg-release]
#                            [--set-pkg-release N]
#   --root DIR            repository root (default: parent of this script's directory)
#   --check-remote        consult origin and roll the tag forward past every release
#                         that already exists for this date, so a repeated run
#                         publishes the next revision instead of failing on a
#                         duplicate tag
#   --pkg-release         print only the PKG_RELEASE that the resolved tag maps to
#                         (requires --check-remote)
#   --set-pkg-release N   write PKG_RELEASE=N into both Makefiles, so the built
#                         packages carry exactly the revision the tag names
#
# Prints the tag on stdout. Exits non-zero, with a message on stderr, when the
# version rules are not met.

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

CHECK_REMOTE=0
PRINT_PKG_RELEASE=0
SET_PKG_RELEASE=

while [ "$#" -gt 0 ]; do
	case "$1" in
		--root) ROOT_DIR=$2; shift 2 ;;
		--check-remote) CHECK_REMOTE=1; shift ;;
		--pkg-release) PRINT_PKG_RELEASE=1; shift ;;
		--set-pkg-release) SET_PKG_RELEASE=$2; shift 2 ;;
		*) echo "usage: $0 [--root DIR] [--check-remote] [--pkg-release] [--set-pkg-release N]" >&2; exit 2 ;;
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

[ "$mihomox_version" = "$luci_version" ] || \
	fail "package versions must match: mihomox=$mihomox_version luci=$luci_version"
[ "$mihomox_release" = "$luci_release" ] || \
	fail "package releases must match: mihomox=$mihomox_release luci=$luci_release"

# The dated version form is what makes a plain "v<version>" tag unambiguous.
# Both 2026.9.18 and 2026.09.18 are accepted; the tag always echoes PKG_VERSION
# verbatim rather than reformatting it.
printf '%s\n' "$mihomox_version" | grep -Eq '^[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}$' || \
	fail "PKG_VERSION must be a dated version such as 2026.9.18, got: $mihomox_version"

printf '%s\n' "$mihomox_release" | grep -Eq '^[0-9]+$' || \
	fail "PKG_RELEASE must be a positive integer, got: $mihomox_release"
[ "$mihomox_release" -ge 1 ] || fail "PKG_RELEASE must be at least 1"

tag_for_release() {
	if [ "$1" -eq 1 ]; then
		printf 'v%s\n' "$mihomox_version"
	else
		printf 'v%s.%s\n' "$mihomox_version" "$(( $1 - 1 ))"
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

if [ -n "$SET_PKG_RELEASE" ]; then
	printf '%s\n' "$SET_PKG_RELEASE" | grep -Eq '^[0-9]+$' || \
		fail "PKG_RELEASE to set must be a positive integer, got: $SET_PKG_RELEASE"
	[ "$SET_PKG_RELEASE" -ge 1 ] || fail "PKG_RELEASE to set must be at least 1"

	for makefile in "$MIHOMOX_MAKEFILE" "$LUCI_MAKEFILE"; do
		tmp="$makefile.tmp.$$"
		if ! sed "s/^PKG_RELEASE:=.*$/PKG_RELEASE:=$SET_PKG_RELEASE/" "$makefile" > "$tmp"; then
			rm -f "$tmp"
			fail "could not rewrite $makefile"
		fi
		# Verify the rewrite before touching the tracked file, so a failed run
		# never leaves a half-written Makefile behind.
		if ! grep -q "^PKG_RELEASE:=$SET_PKG_RELEASE$" "$tmp"; then
			rm -f "$tmp"
			fail "rewriting $makefile did not produce PKG_RELEASE:=$SET_PKG_RELEASE"
		fi
		cat "$tmp" > "$makefile" || { rm -f "$tmp"; fail "could not write $makefile"; }
		rm -f "$tmp"
	done

	written=$(read_makefile_var "$MIHOMOX_MAKEFILE" PKG_RELEASE)
	luci_written=$(read_makefile_var "$LUCI_MAKEFILE" PKG_RELEASE)
	[ "$written" = "$SET_PKG_RELEASE" ] || fail "mihomox/Makefile PKG_RELEASE is $written after write"
	[ "$luci_written" = "$SET_PKG_RELEASE" ] || fail "luci-app-mihomox/Makefile PKG_RELEASE is $luci_written after write"

	printf '%s\n' "PKG_RELEASE set to $SET_PKG_RELEASE in both packages" >&2
	exit 0
fi

effective_release=$mihomox_release

if [ "$CHECK_REMOTE" -eq 1 ]; then
	# Every successful release publishes its tag, so a repeated run of the same
	# dated version must move on to the next revision rather than reusing a tag
	# that action-gh-release would then append to. Roll forward to the first
	# revision whose tag is still free.
	attempt=0
	while tag_exists_on_origin "$(tag_for_release "$effective_release")"; do
		effective_release=$(( effective_release + 1 ))
		attempt=$(( attempt + 1 ))
		[ "$attempt" -le 100 ] || fail "gave up after 100 taken revisions for $mihomox_version"
	done
fi

tag=$(tag_for_release "$effective_release")
check_tag_shape "$tag"

if [ "$PRINT_PKG_RELEASE" -eq 1 ]; then
	[ "$CHECK_REMOTE" -eq 1 ] || fail "--pkg-release requires --check-remote"
	printf '%s\n' "$effective_release"
	exit 0
fi

printf '%s\n' "$tag"

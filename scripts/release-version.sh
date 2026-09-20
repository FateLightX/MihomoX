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
# usage: release-version.sh [--root DIR] [--check-remote]
#   --root DIR      repository root (default: parent of this script's directory)
#   --check-remote  also refuse a tag that already exists on origin, so a second
#                   release of the same day must bump PKG_RELEASE instead of
#                   silently appending to the previous GitHub Release
#
# Prints the tag on stdout. Exits non-zero, with a message on stderr, when the
# version rules are not met.

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

CHECK_REMOTE=0

while [ "$#" -gt 0 ]; do
	case "$1" in
		--root) ROOT_DIR=$2; shift 2 ;;
		--check-remote) CHECK_REMOTE=1; shift ;;
		*) echo "usage: $0 [--root DIR] [--check-remote]" >&2; exit 2 ;;
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

if [ "$mihomox_release" -eq 1 ]; then
	tag="v${mihomox_version}"
else
	tag="v${mihomox_version}.$((mihomox_release - 1))"
fi

printf '%s\n' "$tag" | grep -Eq '^v[0-9]{4}\.[0-9]{1,2}\.[0-9]{1,2}(\.[0-9]+)?$' || \
	fail "derived tag is malformed: $tag"

if [ "$CHECK_REMOTE" -eq 1 ]; then
	# A tag that already exists would make action-gh-release append to the
	# previous release instead of publishing this build, so treat it as an
	# error and let the operator bump PKG_RELEASE.
	if ! existing=$(git -C "$ROOT_DIR" ls-remote --tags origin "refs/tags/$tag" 2>&1); then
		fail "could not query origin for tag $tag: $existing"
	fi
	if [ -n "$existing" ]; then
		# Name both remedies: a new date bumps PKG_VERSION, another release of the
		# same date bumps PKG_RELEASE.
		fail "release tag $tag already exists on origin; bump PKG_VERSION for a new date, or PKG_RELEASE for another revision of the same version"
	fi
fi

printf '%s\n' "$tag"

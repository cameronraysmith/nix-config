#!/usr/bin/env nix-shell
#!nix-shell --pure -i bash -p curl jq cacert git nix-prefetch-github gnused coreutils
# shellcheck shell=bash
#
# Bumps pkgs/by-name/buzz/relay-source to the newest relay-v tag: rewrites the
# version, the src hash and the recorded rev in package.nix, and blanks the
# vendor hash.
# Invoked via `nix run .#update-buzz-relay-source` (passthru.updateScript).
#
# This deliberately reads the *tag refs* API rather than the releases API that
# the sibling source/update.sh uses. Upstream publishes GitHub Release objects
# for desktop-v*, mobile-v* and chart-v*, but not for relay-v*: as of
# relay-v0.2.1, `GET /releases/tags/relay-v0.2.1` returns 404 and no relay-v
# entry appears anywhere in `GET /releases?per_page=100`. A releases-based
# filter would therefore always take the empty-set failure path and could never
# bump this pin. git/matching-refs/tags/relay-v returns all relay tags and
# resolves each to a commit sha in one call.
#
# The draft/prerelease filtering that source/update.sh performs has no analogue
# here, since a bare tag carries no such flags. Release-candidate tags are
# excluded lexically instead: sort -V would order relay-v0.3.0-rc.1 after
# relay-v0.2.1 and pin a prerelease.
#
# No lockfile is generated: upstream ships Cargo.lock, and the vendored
# dependency set is derived from it by rustPlatform.fetchCargoVendor.

set -euo pipefail

owner="block"
repo="buzz"
fake_sri="sha256-0000000000000000000000000000000000000000000="

repo_root="$(git rev-parse --show-toplevel)"
pkg_dir="${repo_root}/pkgs/by-name/buzz/relay-source"
pkg_nix="${pkg_dir}/package.nix"

current_version="$(sed -n 's/^  version = "\(.*\)";$/\1/p' "$pkg_nix" | head -1)"
if [[ -z "$current_version" ]]; then
  echo "error: could not read the current version from ${pkg_nix}" >&2
  exit 1
fi

refs_json="$(curl -fsSL \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${owner}/${repo}/git/matching-refs/tags/relay-v")"

mapfile -t relay_versions < <(
  printf '%s' "$refs_json" \
    | jq -r '.[].ref' \
    | sed -n 's|^refs/tags/relay-v||p' \
    | grep -v -- '-' \
    | sort -V
)

# The relay-v namespace is young and the buzz tag namespace has already been
# renamed twice, so an empty filtered set means the naming moved rather than
# that no release exists. Fail loudly with the evidence instead of silently
# reporting no-op.
if [[ ${#relay_versions[@]} -eq 0 ]]; then
  echo "error: no tag matching relay-v* was found" >&2
  echo "observed tag refs:" >&2
  printf '%s' "$refs_json" | jq -r '.[].ref' | sed 's/^/  /' >&2
  exit 1
fi

latest_version="${relay_versions[-1]}"
latest_tag="relay-v${latest_version}"

if [[ "$current_version" == "$latest_version" ]]; then
  echo "buzz relay source is already at version ${current_version}"
  exit 0
fi

echo "Updating buzz relay source: ${current_version} -> ${latest_version}"

echo "Computing source hash for tag ${latest_tag}..."
new_sri="$(nix-prefetch-github "$owner" "$repo" --rev "$latest_tag" | jq -r '.hash')"
if [[ -z "$new_sri" || "$new_sri" == "null" ]]; then
  echo "error: nix-prefetch-github did not return a hash" >&2
  exit 1
fi

# Resolved from the same payload the tag list came from. A tag object rather
# than a direct commit ref would report type "tag" and a sha that is not the
# commit, so the type is asserted rather than assumed.
new_rev="$(printf '%s' "$refs_json" \
  | jq -r --arg ref "refs/tags/${latest_tag}" \
    '.[] | select(.ref == $ref) | select(.object.type == "commit") | .object.sha')"
if [[ -z "$new_rev" || "$new_rev" == "null" ]]; then
  echo "error: could not resolve ${latest_tag} to a commit sha" >&2
  echo "note: an annotated tag needs one further dereference through git/tags/<sha>" >&2
  exit 1
fi

# package.nix carries two `hash =` lines. Scope each rewrite to one side of the
# passthru block so the src hash and the vendor hash cannot be confused.
passthru_line="$(grep -n '^    passthru = {$' "$pkg_nix" | head -1 | cut -d: -f1)"
if [[ -z "$passthru_line" ]]; then
  echo "error: could not locate the passthru block in ${pkg_nix}" >&2
  exit 1
fi

sed -i'' -e "s|^  version = \"${current_version}\";\$|  version = \"${latest_version}\";|" "$pkg_nix"
sed -i'' -e "1,${passthru_line}s|hash = \"sha256-[^\"]*\"|hash = \"${new_sri}\"|" "$pkg_nix"
sed -i'' -e "${passthru_line},\$s|hash = \"sha256-[^\"]*\"|hash = \"${fake_sri}\"|" "$pkg_nix"
sed -i'' -e "s|rev = \"[0-9a-f]\{40\}\"|rev = \"${new_rev}\"|" "$pkg_nix"

# Fail loudly if any rewrite did not take, rather than reporting success on a no-op.
grep -q "version = \"${latest_version}\"" "$pkg_nix" \
  || { echo "error: version was not updated in package.nix" >&2; exit 1; }
grep -q "hash = \"${new_sri}\"" "$pkg_nix" \
  || { echo "error: src hash was not updated in package.nix" >&2; exit 1; }
grep -q "hash = \"${fake_sri}\"" "$pkg_nix" \
  || { echo "error: vendor hash was not reset in package.nix" >&2; exit 1; }
grep -q "rev = \"${new_rev}\"" "$pkg_nix" \
  || { echo "error: rev was not updated in package.nix" >&2; exit 1; }

echo "Updated buzz relay source to ${latest_version}"
echo "  tag:      ${latest_tag}"
echo "  rev:      ${new_rev}"
echo "  src hash: ${new_sri}"
echo
echo "The vendor hash was reset to the placeholder and must be recomputed:"
echo "  nix build .#buzz-relay-source.cargoDeps.vendorStaging"
echo "then copy the reported got: hash into passthru.cargoDeps.hash."

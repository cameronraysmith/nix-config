# buzz-relay - source tree and vendored cargo dependencies for the relay.
#
# This is a second, independent pin of the same upstream repository as the
# sibling `source` derivation. It exists because the relay releases on its own
# tag line. `source` tracks desktop-v* and feeds the desktop/home-side CLI and
# git helpers; this tracks relay-v* and feeds the server.
#
# The separation is deliberate rather than incidental. A single shared pin
# would couple a server upgrade to a client upgrade: bumping the relay to pick
# up a server fix would simultaneously move the CLI and the credential helper
# that the desktop configuration installs, and bumping the desktop train would
# silently redeploy the relay. The cost is a second fetchCargoVendor of the
# same ~1000-package workspace lockfile; the benefit is that the two upgrade
# decisions stay independent.
#
# Unlike `source`, `version` here is a real crate version rather than a release
# train number. crates/buzz-relay/Cargo.toml declares `version = "0.2.1"` with
# an explicit comment that it does NOT inherit the workspace version (which is
# frozen at 0.1.0), because the relay ships as a pinnable artifact released on
# its own cadence. So the tag, this attribute, and what the binary reports all
# agree.
#
# Upstream publishes no GitHub Release object for relay-v* tags — only the
# annotated-less git tags themselves. update.sh therefore reads the tag refs
# API rather than the releases API; see the comment there.
#
# passthru.cargoDeps is the vendored dependency set for this pin. A consumer
# inherits it and must never also set cargoHash: the precedence chain in
# build-rust-package/default.nix:104-113 tests cargoVendorDir, then cargoDeps,
# then cargoLock, then cargoHash, so a non-null cargoDeps short-circuits before
# cargoHash is read and a stale or fabricated hash sitting beside it would
# never produce an error.
#
# Source: https://github.com/block/buzz
{
  fetchFromGitHub,
  rustPlatform,
}:
let
  version = "0.2.1";

  # Self-reference is safe because `passthru` never becomes a derivation input:
  # fetchFromGitHub forwards it to the fetcher (fetchgithub/default.nix:210-213)
  # and mkDerivation excludes it from the derivation proper, so forcing
  # `self.passthru.cargoDeps` does not force a cycle through `self`.
  self = fetchFromGitHub {
    name = "buzz-relay-source-${version}";
    owner = "block";
    repo = "buzz";
    tag = "relay-v${version}";
    hash = "sha256-vc9vMTQzL1NCJTIYasoGq+KCu2Lbdu8Wz7scsyyoiJ8=";

    passthru = {
      inherit version;
      rev = "6e5c462ac524de60d7edb46c66130fd779cc9006";

      cargoDeps = rustPlatform.fetchCargoVendor {
        src = self;
        hash = "sha256-XWKN73l+tPw5p7uEg192wu5kndqXPVhDiGqM9N9bJnk=";
      };

      updateScript = ./update.sh;
    };
  };
in
self

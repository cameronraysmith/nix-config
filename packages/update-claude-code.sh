#!/usr/bin/env nix-shell
#!nix-shell -i bash -p curl jq nix

set -euo pipefail

cd "$(dirname "$BASH_SOURCE")"

gcsBucket="https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases"
version="$(curl -fsSL "$gcsBucket/stable")"

echo "Latest stable version: $version"
echo ""
echo "Fetching hashes for all platforms..."
echo ""

declare -A hashes

for platform in "darwin-x64" "darwin-arm64" "linux-x64" "linux-arm64"; do
  url="$gcsBucket/$version/$platform/claude"
  echo "Fetching $platform..."
  hash=$(nix-prefetch-url "$url" 2>/dev/null)
  sri_hash=$(nix hash convert --to sri --hash-algo sha256 "$hash")
  hashes[$platform]=$sri_hash
  echo "  ✓ $platform: $sri_hash"
done

echo ""
echo "Update claude-code-bin.nix with these values:"
echo ""
cat <<EOF
  version = "$version";

  hashes = {
    x86_64-linux = "${hashes[linux-x64]}";
    aarch64-linux = "${hashes[linux-arm64]}";
    x86_64-darwin = "${hashes[darwin-x64]}";
    aarch64-darwin = "${hashes[darwin-arm64]}";
  };
EOF

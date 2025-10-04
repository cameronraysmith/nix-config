#!/usr/bin/env bash
set -euo pipefail

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                      Flake outputs                            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Parse arguments
SYSTEM_ARG="${1:-}"

# Auto-detect system if not specified
if [ -z "$SYSTEM_ARG" ]; then
    SYSTEM=$(nix eval --impure --raw --expr 'builtins.currentSystem')
else
    SYSTEM="$SYSTEM_ARG"
fi

echo "🔍 nix eval"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PACKAGES=$(nix eval ".#packages.$SYSTEM" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo "none")
CHECKS=$(nix eval ".#checks.$SYSTEM" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo "none")
DEVSHELLS=$(nix eval ".#devShells.$SYSTEM" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo "none")
NIXOS_CONFIGS=$(nix eval ".#nixosConfigurations" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo "none")
DARWIN_CONFIGS=$(nix eval ".#darwinConfigurations" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo "none")
HOME_CONFIGS=$(nix eval ".#legacyPackages.$SYSTEM.homeConfigurations" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo "none")

echo "📦 Packages ($SYSTEM):"
if [ "$PACKAGES" = "none" ]; then
    echo "  (none found)"
else
    while IFS= read -r pkg; do
        echo "  - packages.$SYSTEM.$pkg"
    done <<< "$PACKAGES"
fi
echo ""

echo "✅ Checks ($SYSTEM):"
if [ "$CHECKS" = "none" ]; then
    echo "  (none found)"
else
    while IFS= read -r check; do
        echo "  - checks.$SYSTEM.$check"
    done <<< "$CHECKS"
fi
echo ""

echo "🐚 DevShells ($SYSTEM):"
if [ "$DEVSHELLS" = "none" ]; then
    echo "  (none found)"
else
    while IFS= read -r shell; do
        echo "  - devShells.$SYSTEM.$shell"
    done <<< "$DEVSHELLS"
fi
echo ""

echo "🐧 NixOS Configurations:"
if [ "$NIXOS_CONFIGS" = "none" ]; then
    echo "  (none found)"
else
    echo "$NIXOS_CONFIGS" | while read -r config; do
        CONFIG_SYSTEM=$(nix eval ".#nixosConfigurations.$config.config.nixpkgs.system" --raw 2>/dev/null || echo "unknown")
        echo "  - nixosConfigurations.$config (system: $CONFIG_SYSTEM)"
    done
fi
echo ""

echo "🍎 Darwin Configurations:"
if [ "$DARWIN_CONFIGS" = "none" ]; then
    echo "  (none found)"
else
    echo "$DARWIN_CONFIGS" | while read -r config; do
        CONFIG_SYSTEM=$(nix eval ".#darwinConfigurations.$config.pkgs.stdenv.hostPlatform.system" --raw 2>/dev/null || echo "unknown")
        echo "  - darwinConfigurations.$config (system: $CONFIG_SYSTEM)"
    done
fi
echo ""

echo "🏠 Home Configurations ($SYSTEM):"
if [ "$HOME_CONFIGS" = "none" ]; then
    echo "  (none found)"
else
    while IFS= read -r config; do
        echo "  - legacyPackages.$SYSTEM.homeConfigurations.$config"
    done <<< "$HOME_CONFIGS"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Note: These outputs will be built by 'just ci-build-local'"
echo ""

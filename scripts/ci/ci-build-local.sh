#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Helper Functions
# ============================================================================

get_target_system() {
    if [ -z "$1" ]; then
        nix eval --impure --raw --expr 'builtins.currentSystem'
    else
        echo "$1"
    fi
}

discover_items() {
    local category="$1"
    local target_system="$2"

    case "$category" in
        packages)
            nix eval ".#packages.$target_system" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo ""
            ;;
        checks)
            nix eval ".#checks.$target_system" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo ""
            ;;
        devshells)
            nix eval ".#devShells.$target_system" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo ""
            ;;
        nixos)
            nix eval ".#nixosConfigurations" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo ""
            ;;
        darwin)
            nix eval ".#darwinConfigurations" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo ""
            ;;
        home)
            nix eval ".#legacyPackages.$target_system.homeConfigurations" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo ""
            ;;
        *)
            echo ""
            ;;
    esac
}

get_build_path() {
    local category="$1"
    local item="$2"
    local target_system="$3"

    case "$category" in
        packages)
            echo ".#packages.$target_system.$item"
            ;;
        checks)
            echo ".#checks.$target_system.$item"
            ;;
        devshells)
            echo ".#devShells.$target_system.$item"
            ;;
        nixos)
            echo ".#nixosConfigurations.$item.config.system.build.toplevel"
            ;;
        darwin)
            echo ".#darwinConfigurations.$item.system"
            ;;
        home)
            echo ".#legacyPackages.$target_system.homeConfigurations.\"$item\".activationPackage"
            ;;
    esac
}

get_config_system() {
    local category="$1"
    local item="$2"

    case "$category" in
        nixos)
            nix eval ".#nixosConfigurations.$item.config.nixpkgs.system" --raw 2>/dev/null || echo "unknown"
            ;;
        darwin)
            nix eval ".#darwinConfigurations.$item.pkgs.stdenv.hostPlatform.system" --raw 2>/dev/null || echo "unknown"
            ;;
        *)
            echo ""
            ;;
    esac
}

should_build_config() {
    local category="$1"
    local config_system="$2"
    local target_system="$3"

    case "$category" in
        nixos)
            [ "$config_system" = "$target_system" ] || [ "$target_system" = "x86_64-linux" ]
            ;;
        darwin)
            [ "$config_system" = "$target_system" ] || [ "$target_system" = "aarch64-darwin" ]
            ;;
        *)
            return 0
            ;;
    esac
}

get_category_emoji() {
    case "$1" in
        packages) echo "📦" ;;
        checks) echo "✅" ;;
        devshells) echo "🐚" ;;
        nixos) echo "🐧" ;;
        darwin) echo "🍎" ;;
        home) echo "🏠" ;;
        *) echo "🔨" ;;
    esac
}

get_category_display() {
    case "$1" in
        packages) echo "packages" ;;
        checks) echo "checks" ;;
        devshells) echo "devShells" ;;
        nixos) echo "NixOS configurations" ;;
        darwin) echo "Darwin configurations" ;;
        home) echo "home configurations" ;;
        *) echo "$1" ;;
    esac
}

build_category_simple() {
    local category="$1"
    local target_system="$2"

    local items
    items=$(discover_items "$category" "$target_system")

    if [ -z "$items" ]; then
        echo "No $(get_category_display "$category") found"
        exit 0
    fi

    echo "$(get_category_emoji "$category") Building $(get_category_display "$category") for $target_system..."
    echo ""

    echo "$items" | while read -r item; do
        if [ -n "$item" ]; then
            # Check system compatibility for configs
            if [ "$category" = "nixos" ] || [ "$category" = "darwin" ]; then
                local config_system
                config_system=$(get_config_system "$category" "$item")

                if ! should_build_config "$category" "$config_system" "$target_system"; then
                    echo "Skipping $item (system: $config_system)"
                    continue
                fi
            fi

            local build_path
            build_path=$(get_build_path "$category" "$item" "$target_system")
            nom build "$build_path" --print-build-logs
        fi
    done

    echo ""
    echo "✅ Done building $(get_category_display "$category")"
}

build_all_categories() {
    local target_system="$1"

    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║          Building All Flake Outputs (nom mode)                ║"
    echo "║                                                               ║"
    echo "║  This mimics 'om ci run' but uses direct nix commands         ║"
    echo "║  with nom for interpretable build status monitoring.          ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "🎯 Target system: $target_system"
    echo "📍 Flake: $(pwd)"
    echo ""

    # Initialize tracking
    local build_log failed_log
    build_log=$(mktemp)
    failed_log=$(mktemp)

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 Phase 1: Discovery"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "🔍 Discovering flake outputs for $target_system..."

    # Discover all categories
    local packages checks devshells nixos_configs darwin_configs home_configs
    packages=$(discover_items "packages" "$target_system")
    checks=$(discover_items "checks" "$target_system")
    devshells=$(discover_items "devshells" "$target_system")
    nixos_configs=$(discover_items "nixos" "$target_system")
    darwin_configs=$(discover_items "darwin" "$target_system")
    home_configs=$(discover_items "home" "$target_system")

    local pkg_count check_count devshell_count nixos_count darwin_count home_count total_count
    pkg_count=$(echo "$packages" | grep -c . || echo "0")
    check_count=$(echo "$checks" | grep -c . || echo "0")
    devshell_count=$(echo "$devshells" | grep -c . || echo "0")
    nixos_count=$(echo "$nixos_configs" | grep -c . || echo "0")
    darwin_count=$(echo "$darwin_configs" | grep -c . || echo "0")
    home_count=$(echo "$home_configs" | grep -c . || echo "0")
    total_count=$((pkg_count + check_count + devshell_count + nixos_count + darwin_count + home_count))

    echo ""
    echo "📊 Discovery summary:"
    echo "   • Packages:           $pkg_count"
    echo "   • Checks:             $check_count"
    echo "   • DevShells:          $devshell_count"
    echo "   • NixOS configs:      $nixos_count"
    echo "   • Darwin configs:     $darwin_count"
    echo "   • Home configs:       $home_count"
    echo "   ─────────────────────────"
    echo "   • Total outputs:      $total_count"
    echo ""

    if [ "$total_count" -eq 0 ]; then
        echo "⚠️  No outputs found to build"
        exit 0
    fi

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔨 Phase 2: Building"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    # Build each category
    for category in packages checks devshells nixos darwin home; do
        local items count
        case "$category" in
            packages) items="$packages"; count="$pkg_count" ;;
            checks) items="$checks"; count="$check_count" ;;
            devshells) items="$devshells"; count="$devshell_count" ;;
            nixos) items="$nixos_configs"; count="$nixos_count" ;;
            darwin) items="$darwin_configs"; count="$darwin_count" ;;
            home) items="$home_configs"; count="$home_count" ;;
        esac

        if [ "$count" -gt 0 ]; then
            echo "$(get_category_emoji "$category") Building $(get_category_display "$category") ($count)..."
            echo "$items" | while read -r item; do
                if [ -n "$item" ]; then
                    # Check system compatibility for configs
                    if [ "$category" = "nixos" ] || [ "$category" = "darwin" ]; then
                        local config_system
                        config_system=$(get_config_system "$category" "$item")

                        if should_build_config "$category" "$config_system" "$target_system"; then
                            echo ""
                            echo "  → ${category}Configurations.$item (system: $config_system)"
                        else
                            echo ""
                            echo "  ⊘ Skipping ${category}Configurations.$item (system: $config_system, target: $target_system)"
                            continue
                        fi
                    else
                        echo ""
                        case "$category" in
                            packages|checks) echo "  → $category.$target_system.$item" ;;
                            devshells) echo "  → devShells.$target_system.$item" ;;
                            home) echo "  → legacyPackages.$target_system.homeConfigurations.\"$item\"" ;;
                        esac
                    fi

                    local build_path
                    build_path=$(get_build_path "$category" "$item" "$target_system")

                    if nom build "$build_path" --print-build-logs 2>&1; then
                        echo "    ✅ Success"
                        echo "$category.$item" >> "$build_log"
                    else
                        echo "    ❌ Failed"
                        echo "$category.$item" >> "$failed_log"
                    fi
                fi
            done
            echo ""
        fi
    done

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📈 Phase 3: Summary"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    local built_count failed_count
    built_count=$(wc -l < "$build_log" | tr -d ' ' || echo "0")
    failed_count=$(wc -l < "$failed_log" | tr -d ' ' || echo "0")

    echo "📊 Build results:"
    echo "   • Total outputs:      $total_count"
    echo "   • Successfully built: $built_count"
    echo "   • Failed:             $failed_count"
    echo ""

    if [ "$built_count" -gt 0 ]; then
        echo "✅ Successfully built:"
        sed 's/^/   • /' < "$build_log"
        echo ""
    fi

    if [ "$failed_count" -gt 0 ]; then
        echo "❌ Failed builds:"
        sed 's/^/   • /' < "$failed_log"
        echo ""
        echo "💡 Tip: Rebuild individually with:"
        sed 's/^/   nom build .#/' < "$failed_log"
        echo ""
    fi

    rm -f "$build_log" "$failed_log"

    if [ "$failed_count" -gt 0 ]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "❌ Build completed with failures"
        exit 1
    else
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "✅ All outputs built successfully!"
        echo ""
        echo "🎉 This is equivalent to: om ci run --systems $target_system"
        echo ""
    fi
}

# ============================================================================
# Main Logic
# ============================================================================

# Parse arguments
CATEGORY="${1:-}"
SYSTEM="${2:-}"

TARGET_SYSTEM=$(get_target_system "$SYSTEM")

# Check for nom
if ! command -v nom &> /dev/null; then
    echo "❌ Error: 'nom' not found in PATH"
    echo "   Install with: nix profile install nixpkgs#nix-output-monitor"
    exit 1
fi

# Validate category if specified
if [ -n "$CATEGORY" ]; then
    case "$CATEGORY" in
        packages|checks|devshells|nixos|darwin|home)
            build_category_simple "$CATEGORY" "$TARGET_SYSTEM"
            ;;
        *)
            echo "❌ Unknown category: $CATEGORY"
            echo "Valid categories: packages, checks, devshells, nixos, darwin, home"
            exit 1
            ;;
    esac
else
    build_all_categories "$TARGET_SYSTEM"
fi

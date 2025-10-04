# This is a jusfile for the nix-config.
# Sections are separated by ## and recipes are documented with a single #
# on lines preceding the recipe.

## nix
## secrets
## CI/CD

# Default command when 'just' is run without arguments
# Run 'just <command>' to execute a command.
default: help

# Display help
help:
  @printf "\nRun 'just -n <command>' to print what would be executed...\n\n"
  @just --list --unsorted
  @printf "\n...by running 'just <command>'.\n"
  @printf "This message is printed by 'just help' and just 'just'.\n"

## nix

# Activate the appropriate configuration for current user and host
[group('nix')]
activate target="":
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -n "{{target}}" ]; then
        echo "activating {{target}} ..."
        nix run . {{target}}
    elif [ -f ./configurations/home/$USER@$(hostname).nix ]; then
        echo "activating home configuration $USER@$(hostname) ..."
        nix run . $USER@$(hostname)
    else
        echo "activating system configuration $(hostname) ..."
        nix run . $(hostname)
    fi

# Print nix flake inputs and outputs
[group('nix')]
io:
  nix flake metadata
  nix flake show --legacy --all-systems
  om show .

# Lint nix files
[group('nix')]
lint:
  pre-commit run --all-files

# Manually enter dev shell
[group('nix')]
dev:
  nix develop

# Remove build output link (no garbage collection)
[group('nix')]
clean:
  rm -f ./result

# Build nix flake
[group('nix')]
build profile: lint check
  nix build --json --no-link --print-build-logs ".#{{ profile }}"

# Check nix flake
[group('nix')]
check:
  nix flake check

# Run nix flake to execute `nix run .#activate` for the current host.
[group('nix')]
switch:
  nix run

# Run nix flake to execute `nix run .#activate-home` for the current user.
[group('nix')]
switch-home:
  nix run .#activate-home

# https://discourse.nixos.org/t/sudo-run-current-system-sw-bin-sudo-must-be-owned-by-uid-0-and-have-the-setuid-bit-set-and-cannot-chdir-var-cron-bailing-out-var-cron-permission-denied/20463
# sudo: /run/current-system/sw/bin/sudo must be owned by uid 0 and have the setuid bit set
# Run nix flake with explicit use of the sudo in `/run/wrappers`
[group('nix')]
switch-wrapper:
  /run/wrappers/bin/sudo nix run

# Shell with bootstrap dependencies
[group('nix')]
bootstrap-shell:
  nix \
  --extra-experimental-features "nix-command flakes" \
  shell \
  "nixpkgs#git" \
  "nixpkgs#just"

# nix run home-manager -- build --flake ".#{{ profile }}"
# Bootstrap build home-manager with flake
[group('nix-home-manager')]
home-manager-bootstrap-build profile="aarch64-linux":
  nix \
  --extra-experimental-features "nix-command flakes" \
  run home-manager -- build \
  --extra-experimental-features "nix-command flakes" \
  --flake ".#{{ profile }}" \
  --show-trace \
  --print-build-logs

# nix run home-manager -- switch --flake ".#{{ profile }}"
# Bootstrap switch home-manager with flake
[group('nix-home-manager')]
home-manager-bootstrap-switch profile="aarch64-linux":
  nix \
  --extra-experimental-features "nix-command flakes" \
  run home-manager -- switch \
  --extra-experimental-features "nix-command flakes" \
  --flake ".#{{ profile }}" \
  --show-trace \
  --print-build-logs

# Build home-manager with flake
[group('nix-home-manager')]
home-manager-build profile="aarch64-linux":
  home-manager build --flake ".#{{ profile }}"

# Switch home-manager with flake
[group('nix-home-manager')]
home-manager-switch profile="aarch64-linux":
  home-manager switch --flake ".#{{ profile }}"

# Bootstrap nix-darwin with flake
[group('nix-darwin')]
darwin-bootstrap profile="aarch64":
  nix run nix-darwin -- switch --flake ".#{{ profile }}"

# Build darwin from flake
[group('nix-darwin')]
darwin-build profile="aarch64":
  just build "darwinConfigurations.{{ profile }}.config.system.build.toplevel"

# Switch darwin from flake
[group('nix-darwin')]
darwin-switch profile="aarch64":
  darwin-rebuild switch --flake ".#{{ profile }}"

# Test darwin from flake
[group('nix-darwin')]
darwin-test profile="aarch64":
  darwin-rebuild check --flake ".#{{ profile }}"

# Bootstrap nixos
[group('nixos')]
nixos-bootstrap destination username publickey:
  ssh \
  -o PubkeyAuthentication=no \
  -o UserKnownHostsFile=/dev/null \
  -o StrictHostKeyChecking=no \
  {{destination}} " \
      parted /dev/nvme0n1 -- mklabel gpt; \
      parted /dev/nvme0n1 -- mkpart primary 512MiB -8GiB; \
      parted /dev/nvme0n1 -- mkpart primary linux-swap -8GiB 100\%; \
      parted /dev/nvme0n1 -- mkpart ESP fat32 1MiB 512MiB; \
      parted /dev/nvme0n1 -- set 3 esp on; \
      sleep 1; \
      mkfs.ext4 -L nixos /dev/nvme0n1p1; \
      mkswap -L swap /dev/nvme0n1p2; \
      mkfs.fat -F 32 -n boot /dev/nvme0n1p3; \
      sleep 1; \
      mount /dev/disk/by-label/nixos /mnt; \
      mkdir -p /mnt/boot; \
      mount /dev/disk/by-label/boot /mnt/boot; \
      nixos-generate-config --root /mnt; \
      sed --in-place '/system\.stateVersion = .*/a \
          nix.extraOptions = \"experimental-features = nix-command flakes\";\n \
          security.sudo.enable = true;\n \
          security.sudo.wheelNeedsPassword = false;\n \
          services.openssh.enable = true;\n \
          services.openssh.settings.PasswordAuthentication = false;\n \
          services.openssh.settings.PermitRootLogin = \"no\";\n \
          users.mutableUsers = false;\n \
          users.users.{{username}}.extraGroups = [ \"wheel\" ];\n \
          users.users.{{username}}.initialPassword = \"{{username}}\";\n \
          users.users.{{username}}.home = \"/home/{{username}}\";\n \
          users.users.{{username}}.isNormalUser = true;\n \
          users.users.{{username}}.openssh.authorizedKeys.keys = [ \"{{publickey}}\" ];\n \
      ' /mnt/etc/nixos/configuration.nix; \
      nixos-install --no-root-passwd; \
      reboot;"

# Copy flake to VM
[group('nixos')]
nixos-vm-sync user destination:
  rsync -avz \
  --exclude='.direnv' \
  --exclude='result' \
  . \
  {{ user }}@{{ destination }}:~/nix-config

# Build nixos from flake
[group('nixos')]
nixos-build profile="aarch64":
  just build "nixosConfigurations.{{ profile }}.config.system.build.toplevel"

# Test nixos from flake
[group('nixos')]
nixos-test profile="aarch64":
  nixos-rebuild test --flake ".#{{ profile }}"

# Switch nixos from flake
[group('nixos')]
nixos-switch profile="aarch64":
  nixos-rebuild switch --flake ".#{{ profile }}"

# Update nix flake
[group('nix')]
update:
  nix flake update

# Update primary nix flake inputs (see flake.nix)
[group('nix')]
update-primary-inputs:
  nix run .#update

# Update a package using its updateScript
[group('nix')]
update-package package="claude-code-bin":
  #!/usr/bin/env bash
  set -euo pipefail
  UPDATE_SCRIPT=$(nix build .#{{ package }}.updateScript --no-link --print-out-paths)
  echo "Running updateScript for {{ package }}..."
  $UPDATE_SCRIPT
  echo "Update complete. Review changes with: git diff packages/{{ package }}/manifest.json"

## secrets

# Define the project variable
gcp_project_id := env_var_or_default('GCP_PROJECT_ID', 'development')

# Show existing secrets using sops
[group('secrets')]
show:
  @echo "=== Shared secrets (secrets/shared.yaml) ==="
  @sops -d secrets/shared.yaml
  @echo
  @echo "=== Test secrets (secrets/test.yaml) ==="
  @sops -d secrets/test.yaml

# Create a secret with the given name
[group('secrets')]
create-secret name:
  @gcloud secrets create {{name}} --replication-policy="automatic" --project {{gcp_project_id}}

# Populate a single secret with the contents of a dotenv-formatted file
[group('secrets')]
populate-single-secret name path:
  @gcloud secrets versions add {{name}} --data-file={{path}} --project {{gcp_project_id}}

# Populate each line of a dotenv-formatted file as a separate secret
[group('secrets')]
populate-separate-secrets path:
  @while IFS= read -r line; do \
     KEY=$(echo $line | cut -d '=' -f 1); \
     VALUE=$(echo $line | cut -d '=' -f 2); \
     gcloud secrets create $KEY --replication-policy="automatic" --project {{gcp_project_id}} 2>/dev/null; \
     printf "$VALUE" | gcloud secrets versions add $KEY --data-file=- --project {{gcp_project_id}}; \
   done < {{path}}

# Complete process: Create a secret and populate it with the entire contents of a dotenv file
[group('secrets')]
create-and-populate-single-secret name path:
  @just create-secret {{name}}
  @just populate-single-secret {{name}} {{path}}

# Complete process: Create and populate separate secrets for each line in the dotenv file
[group('secrets')]
create-and-populate-separate-secrets path:
  @just populate-separate-secrets {{path}}

# Retrieve the contents of a given secret
[group('secrets')]
get-secret name:
  @gcloud secrets versions access latest --secret={{name}} --project={{gcp_project_id}}

# Create empty dotenv from template
[group('secrets')]
seed-dotenv:
  @cp .template.env .env

# Export unique secrets to dotenv format using sops
[group('secrets')]
export:
  @echo "# Exported from sops secrets" > .secrets.env
  @sops exec-env secrets/shared.yaml 'env | grep -E "CACHIX_AUTH_TOKEN|GITHUB_TOKEN"' >> .secrets.env
  @sort -u .secrets.env -o .secrets.env

# Check secrets are available in sops environment.
[group('secrets')]
check-secrets:
  @printf "Check sops environment for secrets\n\n"
  @sops exec-env secrets/shared.yaml 'env | grep -E "GITHUB|CACHIX" | sed "s/=.*$/=***REDACTED***/"'

# Save KUBECONFIG to file (using sops - requires KUBECONFIG secret to be added)
[group('secrets')]
get-kubeconfig:
  @sops exec-env secrets/shared.yaml 'echo "$KUBECONFIG"' > kubeconfig.yaml || echo "KUBECONFIG not found in secrets/shared.yaml"

# Hash-encrypt a file: copy to secrets directory with content-based name and encrypt with sops
[group('secrets')]
hash-encrypt source_file user="crs58":
  #!/usr/bin/env bash
  set -euo pipefail

  # Generate content-based hash for filename
  HASH=$(nix hash file --type sha256 --base64 "{{source_file}}" | cut -d'-' -f2 | head -c 32)

  # Extract base filename without extension
  BASE_NAME=$(basename "{{source_file}}" .yaml)
  BASE_NAME=$(basename "$BASE_NAME" .yml)

  # Create target path
  TARGET_DIR="secrets/users/{{user}}"
  TARGET_FILE="${TARGET_DIR}/${HASH}-${BASE_NAME}.yaml"

  # Ensure target directory exists
  mkdir -p "$TARGET_DIR"

  # Copy file with hash-based name
  cp "{{source_file}}" "$TARGET_FILE"
  echo "Copied {{source_file}} → $TARGET_FILE"

  # Encrypt in place with sops
  sops encrypt --in-place "$TARGET_FILE"
  echo "Encrypted $TARGET_FILE with sops"

  # Display verification info
  echo "Hash: $HASH"
  echo "Final path: $TARGET_FILE"

# Verify hash integrity: decrypt secret file and compare hash with original file
[group('secrets')]
verify-hash original_file secret_file:
  #!/usr/bin/env bash
  set -euo pipefail

  # Extract hash from secret filename
  SECRET_BASENAME=$(basename "{{secret_file}}")
  EXPECTED_HASH=$(echo "$SECRET_BASENAME" | cut -d'-' -f1)

  # Generate hash of original file
  ACTUAL_HASH=$(nix hash file --type sha256 --base64 "{{original_file}}" | cut -d'-' -f2 | head -c 32)

  # Create temporary file for decrypted content
  TEMP_FILE=$(mktemp)
  trap "rm -f $TEMP_FILE" EXIT

  # Decrypt secret file to temp location
  sops decrypt "{{secret_file}}" > "$TEMP_FILE"

  # Generate hash of decrypted content
  DECRYPTED_HASH=$(nix hash file --type sha256 --base64 "$TEMP_FILE" | cut -d'-' -f2 | head -c 32)

  echo "Original file: {{original_file}}"
  echo "Secret file: {{secret_file}}"
  echo "Expected hash (from filename): $EXPECTED_HASH"
  echo "Actual hash (from original): $ACTUAL_HASH"
  echo "Decrypted hash: $DECRYPTED_HASH"
  echo

  # Verify original matches filename hash
  if [ "$ACTUAL_HASH" = "$EXPECTED_HASH" ]; then
    echo "Original file hash matches secret filename hash"
  else
    echo "Original file hash does NOT match secret filename hash"
    exit 1
  fi

  # Verify decrypted content matches original
  if [ "$DECRYPTED_HASH" = "$ACTUAL_HASH" ]; then
    echo "Decrypted content matches original file"
  else
    echo "Decrypted content does NOT match original file"
    exit 1
  fi

  echo "All verification checks passed!"

# Edit a sops encrypted file
[group('secrets')]
edit-secret file:
  @sops {{ file }}

# Create a new sops encrypted file
[group('secrets')]
new-secret file:
  @sops {{ file }}

# Show specific secret value from shared secrets
[group('secrets')]
get-shared-secret key:
  @sops -d --extract '["{{ key }}"]' secrets/shared.yaml

# Run command with all shared secrets as environment variables
[group('secrets')]
run-with-secrets +command:
  @sops exec-env secrets/shared.yaml '{{ command }}'

# Validate all sops encrypted files can be decrypted
[group('secrets')]
validate-secrets:
  @echo "Validating sops encrypted files..."
  @for file in $(find secrets -name "*.yaml" -not -name ".sops.yaml"); do \
    echo "Testing: $file"; \
    sops -d "$file" > /dev/null && echo "  ✅ Valid" || echo "  ❌ Failed"; \
  done

## CI/CD

# Trigger CI workflow and wait for result (blocking)
[group('CI/CD')]
test-ci-blocking workflow="ci.yaml":
    #!/usr/bin/env bash
    set -euo pipefail

    echo "triggering workflow: {{workflow}} on branch: $(git branch --show-current)"
    gh workflow run {{workflow}} --ref $(git branch --show-current)

    # wait a moment for run to start
    sleep 5

    # get the latest run ID
    RUN_ID=$(gh run list --workflow={{workflow}} --limit 1 --json databaseId --jq '.[0].databaseId')

    echo "watching run: $RUN_ID"
    gh run watch "$RUN_ID" --exit-status

# View latest CI run status and details
[group('CI/CD')]
ci-status workflow="ci.yaml":
    @gh run list --workflow={{workflow}} --limit 1

# View latest CI run logs
[group('CI/CD')]
ci-logs workflow="ci.yaml":
    @RUN_ID=$(gh run list --workflow={{workflow}} --limit 1 --json databaseId --jq '.[0].databaseId'); \
    gh run view "$RUN_ID" --log

# View only failed logs from latest CI run
[group('CI/CD')]
ci-logs-failed workflow="ci.yaml":
    @RUN_ID=$(gh run list --workflow={{workflow}} --limit 1 --json databaseId --jq '.[0].databaseId'); \
    gh run view "$RUN_ID" --log-failed

# List categorized flake outputs using nix eval
[group('CI/CD')]
ci-show-outputs system="":
    #!/usr/bin/env bash
    set -euo pipefail

    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                      Flake outputs                            ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""

    # Auto-detect system if not specified
    if [ -z "{{system}}" ]; then
        SYSTEM=$(nix eval --impure --raw --expr 'builtins.currentSystem')
    else
        SYSTEM="{{system}}"
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
        echo "$PACKAGES" | sed 's/^/  - packages.'"$SYSTEM"'./'
    fi
    echo ""

    echo "✅ Checks ($SYSTEM):"
    if [ "$CHECKS" = "none" ]; then
        echo "  (none found)"
    else
        echo "$CHECKS" | sed 's/^/  - checks.'"$SYSTEM"'./'
    fi
    echo ""

    echo "🐚 DevShells ($SYSTEM):"
    if [ "$DEVSHELLS" = "none" ]; then
        echo "  (none found)"
    else
        echo "$DEVSHELLS" | sed 's/^/  - devShells.'"$SYSTEM"'./'
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
        echo "$HOME_CONFIGS" | sed 's/^/  - legacyPackages.'"$SYSTEM"'.homeConfigurations./'
    fi
    echo ""

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Note: These outputs will be built by 'just ci-build-local'"
    echo ""

# Build all flake outputs locally with nom (inefficient manual version of om ci for debugging builds)
[group('CI/CD')]
ci-build-local category="" system="":
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
            cat "$build_log" | sed 's/^/   • /'
            echo ""
        fi

        if [ "$failed_count" -gt 0 ]; then
            echo "❌ Failed builds:"
            cat "$failed_log" | sed 's/^/   • /'
            echo ""
            echo "💡 Tip: Rebuild individually with:"
            cat "$failed_log" | sed 's/^/   nom build .#/'
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

    TARGET_SYSTEM=$(get_target_system "{{system}}")

    # Check for nom
    if ! command -v nom &> /dev/null; then
        echo "❌ Error: 'nom' not found in PATH"
        echo "   Install with: nix profile install nixpkgs#nix-output-monitor"
        exit 1
    fi

    # Validate category if specified
    if [ -n "{{category}}" ]; then
        case "{{category}}" in
            packages|checks|devshells|nixos|darwin|home)
                build_category_simple "{{category}}" "$TARGET_SYSTEM"
                ;;
            *)
                echo "❌ Unknown category: {{category}}"
                echo "Valid categories: packages, checks, devshells, nixos, darwin, home"
                exit 1
                ;;
        esac
    else
        build_all_categories "$TARGET_SYSTEM"
    fi

# Build specific output category with nom (packages, checks, devshells, nixos, home)
[group('CI/CD')]
ci-build-category category system="":
    #!/usr/bin/env bash
    set -euo pipefail

    # Auto-detect system if not specified
    if [ -z "{{system}}" ]; then
        TARGET_SYSTEM=$(nix eval --impure --raw --expr 'builtins.currentSystem')
    else
        TARGET_SYSTEM="{{system}}"
    fi

    echo "🔨 Building {{category}} for $TARGET_SYSTEM..."
    echo ""

    case "{{category}}" in
        packages)
            ITEMS=$(nix eval ".#packages.$TARGET_SYSTEM" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo "")
            if [ -z "$ITEMS" ]; then
                echo "No packages found"
                exit 0
            fi
            echo "$ITEMS" | while read -r item; do
                [ -n "$item" ] && nom build ".#packages.$TARGET_SYSTEM.$item" --print-build-logs
            done
            ;;
        checks)
            ITEMS=$(nix eval ".#checks.$TARGET_SYSTEM" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo "")
            if [ -z "$ITEMS" ]; then
                echo "No checks found"
                exit 0
            fi
            echo "$ITEMS" | while read -r item; do
                [ -n "$item" ] && nom build ".#checks.$TARGET_SYSTEM.$item" --print-build-logs
            done
            ;;
        devshells)
            ITEMS=$(nix eval ".#devShells.$TARGET_SYSTEM" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo "")
            if [ -z "$ITEMS" ]; then
                echo "No devShells found"
                exit 0
            fi
            echo "$ITEMS" | while read -r item; do
                [ -n "$item" ] && nom build ".#devShells.$TARGET_SYSTEM.$item" --print-build-logs
            done
            ;;
        nixos)
            ITEMS=$(nix eval ".#nixosConfigurations" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo "")
            if [ -z "$ITEMS" ]; then
                echo "No NixOS configurations found"
                exit 0
            fi
            echo "$ITEMS" | while read -r item; do
                if [ -n "$item" ]; then
                    CONFIG_SYSTEM=$(nix eval ".#nixosConfigurations.$item.config.nixpkgs.system" --raw 2>/dev/null || echo "unknown")
                    if [ "$CONFIG_SYSTEM" = "$TARGET_SYSTEM" ] || [ "$TARGET_SYSTEM" = "x86_64-linux" ]; then
                        nom build ".#nixosConfigurations.$item.config.system.build.toplevel" --print-build-logs
                    else
                        echo "Skipping $item (system: $CONFIG_SYSTEM)"
                    fi
                fi
            done
            ;;
        darwin)
            ITEMS=$(nix eval ".#darwinConfigurations" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo "")
            if [ -z "$ITEMS" ]; then
                echo "No Darwin configurations found"
                exit 0
            fi
            echo "$ITEMS" | while read -r item; do
                if [ -n "$item" ]; then
                    CONFIG_SYSTEM=$(nix eval ".#darwinConfigurations.$item.pkgs.stdenv.hostPlatform.system" --raw 2>/dev/null || echo "unknown")
                    if [ "$CONFIG_SYSTEM" = "$TARGET_SYSTEM" ] || [ "$TARGET_SYSTEM" = "aarch64-darwin" ]; then
                        nom build ".#darwinConfigurations.$item.system" --print-build-logs
                    else
                        echo "Skipping $item (system: $CONFIG_SYSTEM)"
                    fi
                fi
            done
            ;;
        home)
            ITEMS=$(nix eval ".#legacyPackages.$TARGET_SYSTEM.homeConfigurations" --apply 'x: builtins.attrNames x' --json 2>/dev/null | jq -r '.[]' || echo "")
            if [ -z "$ITEMS" ]; then
                echo "No home configurations found"
                exit 0
            fi
            echo "$ITEMS" | while read -r item; do
                [ -n "$item" ] && nom build ".#legacyPackages.$TARGET_SYSTEM.homeConfigurations.\"$item\".activationPackage" --print-build-logs
            done
            ;;
        *)
            echo "❌ Unknown category: {{category}}"
            echo "Valid categories: packages, checks, devshells, nixos, darwin, home"
            exit 1
            ;;
    esac

    echo ""
    echo "✅ Done building {{category}}"

# Validate latest CI run comprehensively
[group('CI/CD')]
ci-validate workflow="ci.yaml":
    @./scripts/ci/validate-run.sh $(gh run list --workflow={{workflow}} --limit 1 --json databaseId --jq '.[0].databaseId')

# Debug specific failed job from latest CI run
[group('CI/CD')]
ci-debug-job workflow="ci.yaml" job_name="build-matrix":
    @RUN_ID=$(gh run list --workflow={{workflow}} --limit 1 --json databaseId --jq '.[0].databaseId'); \
    JOB_ID=$(gh run view "$RUN_ID" --json jobs --jq ".jobs[] | select(.name == \"{{job_name}}\") | .databaseId"); \
    gh run view --job "$JOB_ID" --log

# Update github secrets for repo from environment variables
[group('CI/CD')]
ghsecrets repo="cameronraysmith/nix-config":
  @echo "secrets before updates:"
  @echo
  PAGER=cat gh secret list --repo={{ repo }}
  @echo
  sops exec-env secrets/shared.yaml 'gh secret set CACHIX_AUTH_TOKEN --repo={{ repo }} --body="$CACHIX_AUTH_TOKEN"'
  @echo
  @echo secrets after updates:
  @echo
  PAGER=cat gh secret list --repo={{ repo }}

# List available workflows and associated jobs.
[group('CI/CD')]
list-workflows:
  @act -l

# Execute flake.yaml workflow.
[group('CI/CD')]
test-flake-workflow:
  @sops exec-env secrets/shared.yaml 'act workflow_dispatch \
  -W ".github/workflows/ci.yaml" \
  -j nixci \
  -s GITHUB_TOKEN -s CACHIX_AUTH_TOKEN \
  --matrix os:ubuntu-latest \
  --container-architecture linux/amd64'

# Command to run sethvargo/ratchet to pin GitHub Actions workflows version tags to commit hashes
# If not installed, you can use docker to run the command
# ratchet_base := "docker run -it --rm -v \"${PWD}:${PWD}\" -w \"${PWD}\" ghcr.io/sethvargo/ratchet:0.9.2"
ratchet_base := "ratchet"

# List of GitHub Actions workflows
gha_workflows := "./.github/workflows/flake.yaml"

# Pin all workflow versions to hash values (requires Docker)
[group('CI/CD')]
ratchet-pin:
  @for workflow in {{gha_workflows}}; do \
    eval "{{ratchet_base}} pin $workflow"; \
  done

# Unpin hashed workflow versions to semantic values (requires Docker)
[group('CI/CD')]
ratchet-unpin:
  @for workflow in {{gha_workflows}}; do \
    eval "{{ratchet_base}} unpin $workflow"; \
  done

# Update GitHub Actions workflows to the latest version (requires Docker)
[group('CI/CD')]
ratchet-update:
  @for workflow in {{gha_workflows}}; do \
    eval "{{ratchet_base}} update $workflow"; \
  done

# Test cachix push/pull with a simple derivation
[group('CI/CD')]
test-cachix:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Testing cachix push/pull..."
    
    # Build a simple derivation
    STORE_PATH=$(nix build nixpkgs#hello --no-link --print-out-paths)
    echo "Built: $STORE_PATH"
    
    # Push to cachix
    echo "Pushing to cachix..."
    sops exec-env secrets/shared.yaml "cachix push cameronraysmith $STORE_PATH"
    
    # Verify it's in the cache by trying to pull it from another location
    echo "✅ Push completed. Verify at: https://app.cachix.org/cache/cameronraysmith"
    echo "Store path: $STORE_PATH"

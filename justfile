# justfile for vanixiets. Sections separated by ##; recipes documented with single # on the preceding line.

nix_cmd := "nix --accept-flake-config"

# Default command when 'just' is run without arguments
default: help

# Display help
help:
  @printf "\nRun 'just -n <command>' to print what would be executed...\n\n"
  @just --list --unsorted
  @printf "\n...by running 'just <command>'.\n"
  @printf "This message is printed by 'just help' and just 'just'.\n"

## nix

# Check if a package is cached (substitutable) on the current locked nixpkgs rev
[group('nix')]
check-cached package:
    #!/usr/bin/env bash
    set -euo pipefail
    output=$(nix build "path:$(nix eval --raw .#inputs.nixpkgs)#{{package}}" --dry-run 2>&1)
    if [ -z "$output" ]; then
        echo "{{package}}: cached"
    else
        echo "$output"
    fi

# Preview uncached derivations for a machine (auto-detects darwin vs nixos)
[group('nix')]
check-uncached-machine hostname:
    #!/usr/bin/env bash
    set -euo pipefail
    darwin_hosts=(argentum blackphos rosegold stibnite)
    nixos_hosts=(cinnabar electrum galena scheelite)
    for h in "${darwin_hosts[@]}"; do
        if [[ "$h" == "{{hostname}}" ]]; then
            exec just check-uncached "darwinConfigurations.{{hostname}}.system"
        fi
    done
    for h in "${nixos_hosts[@]}"; do
        if [[ "$h" == "{{hostname}}" ]]; then
            exec just check-uncached "nixosConfigurations.{{hostname}}.config.system.build.toplevel"
        fi
    done
    echo "unknown hostname: {{hostname}}" >&2
    echo "darwin: ${darwin_hosts[*]}" >&2
    echo "nixos: ${nixos_hosts[*]}" >&2
    exit 1

# List derivations that would be built (not cached) for a system configuration
[group('nix')]
check-uncached config:
    #!/usr/bin/env bash
    set -euo pipefail
    output=$(nix build ".#{{config}}" --dry-run 2>&1)
    if ! echo "$output" | grep -q 'will be built'; then
        echo "all derivations cached"
    else
        echo "$output" | grep 'will be built'
        echo "$output" | grep '\.drv$' | sed 's|.*/[a-z0-9]*-||; s|\.drv$||'
    fi
    if echo "$output" | grep -q 'will be fetched'; then
        echo ""
        echo "$output" | grep 'will be fetched'
        echo "$output" | grep -A9999 'will be fetched' | tail -n+2 | sed 's|.*/[a-z0-9]*-||'
    fi

## activation
# Unified activation commands using nh via flake apps
# All recipes accept nh flags: --dry (preview), --ask (confirm), --verbose

# Auto-detect platform and activate current machine
[group('activation')]
activate *FLAGS:
    #!/usr/bin/env bash
    set -euo pipefail
    if [[ "$(uname -s)" == "Darwin" ]]; then
        exec just activate-darwin "$(hostname -s)" {{FLAGS}}
    elif [ -f /etc/NIXOS ]; then
        exec just activate-os "$(hostname)" {{FLAGS}}
    else
        exec just activate-home "$USER" {{FLAGS}}
    fi

# Activate darwin configuration
[group('activation')]
activate-darwin hostname *FLAGS:
    @echo "Activating darwin configuration for {{hostname}}..."
    @if [ -x /opt/homebrew/bin/brew ]; then /opt/homebrew/bin/brew update; fi
    {{nix_cmd}} run .#darwin -- {{hostname}} . {{FLAGS}}

# Activate NixOS configuration
[group('activation')]
activate-os hostname *FLAGS:
    @echo "Activating NixOS configuration for {{hostname}}..."
    {{nix_cmd}} run .#os -- {{hostname}} . {{FLAGS}}

# Activate home-manager configuration
[group('activation')]
activate-home username *FLAGS:
    @echo "Activating home-manager configuration for {{username}}..."
    {{nix_cmd}} run .#home -- {{username}} . {{FLAGS}}

# Print nix flake inputs and outputs
[group('nix')]
flake-info:
  {{nix_cmd}} flake metadata
  {{nix_cmd}} flake show --legacy --all-systems

# system="": which system the per-system attrsets (checks, packages, devShells, apps, formatter)
#   are listed for; defaults to builtins.currentSystem. Answering "what checks exist on
#   x86_64-linux" from a darwin machine otherwise requires hand-writing the eval. The `systems`
#   array below is separate and stays fixed: nixidyEnvs and legacyPackages are reported across
#   all three regardless.
# Enumerate flake output surface by category (all 20 top-level outputs)
[group('nix')]
nix-flake-io system="":
  #!/usr/bin/env bash
  set -euo pipefail
  sys="{{system}}"
  [ -n "$sys" ] || sys=$(nix eval --impure --raw --expr 'builtins.currentSystem')
  systems=(aarch64-darwin aarch64-linux x86_64-linux)

  # Per-system attrsets (members listed for the selected system)
  printf "## checks\n"
  nix eval ".#checks.${sys}" --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]' || echo "(empty)"
  printf "\n## packages\n"
  nix eval ".#packages.${sys}" --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]' || echo "(empty)"
  printf "\n## devShells\n"
  nix eval ".#devShells.${sys}" --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]' || echo "(empty)"
  printf "\n## apps\n"
  nix eval ".#apps.${sys}" --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]' || echo "(empty)"
  printf "\n## formatter\n"
  nix eval ".#formatter.${sys}.name" 2>/dev/null || echo "(empty)"

  # Top-level attrsets
  printf "\n## overlays\n"
  overlays_type=$(nix eval --raw .#overlays --apply 'x: builtins.typeOf x' 2>/dev/null || echo "missing")
  if [ "$overlays_type" = "set" ]; then
    nix eval .#overlays --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]' || echo "(empty)"
  elif [ "$overlays_type" = "list" ]; then
    overlays_len=$(nix eval --raw .#overlays --apply 'x: toString (builtins.length x)' 2>/dev/null || echo "?")
    echo "(list of ${overlays_len} items)"
  else
    echo "(empty)"
  fi

  printf "\n## nixpkgsOverlays\n"
  npo_type=$(nix eval --raw .#nixpkgsOverlays --apply 'x: builtins.typeOf x' 2>/dev/null || echo "missing")
  if [ "$npo_type" = "list" ]; then
    npo_len=$(nix eval --raw .#nixpkgsOverlays --apply 'x: toString (builtins.length x)' 2>/dev/null || echo "?")
    echo "(list of ${npo_len} items)"
  elif [ "$npo_type" = "set" ]; then
    nix eval .#nixpkgsOverlays --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]' || echo "(empty)"
  else
    echo "(empty)"
  fi

  printf "\n## nixosModules\n"
  nix eval .#nixosModules --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]' || echo "(empty)"
  printf "\n## darwinModules\n"
  nix eval .#darwinModules --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]' || echo "(empty)"
  printf "\n## nixosConfigurations\n"
  nix eval .#nixosConfigurations --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]' || echo "(empty)"
  printf "\n## darwinConfigurations\n"
  nix eval .#darwinConfigurations --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]' || echo "(empty)"

  # modules: deferred-module-composition namespace (one level of sub-namespaces)
  printf "\n## modules\n"
  if nix eval .#modules --apply builtins.attrNames --json 2>/dev/null >/tmp/.nix-flake-io-modules.$$; then
    for ns in $(jq -r '.[]' /tmp/.nix-flake-io-modules.$$); do
      printf "### modules.%s\n" "$ns"
      nix eval ".#modules.${ns}" --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]' || echo "(empty)"
    done
    rm -f /tmp/.nix-flake-io-modules.$$
  else
    echo "(empty)"
  fi

  # homeConfigurations: flat <user>@<system> (vanixiets flat-tuple shape)
  printf "\n## homeConfigurations\n"
  if entries=$(nix eval ".#homeConfigurations" --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]'); then
    if [ -n "$entries" ]; then
      while IFS= read -r e; do
        printf "%s\n" "$e"
      done <<< "$entries"
    fi
  fi

  # nixidyEnvs: per-system × env
  printf "\n## nixidyEnvs\n"
  for s in "${systems[@]}"; do
    if envs=$(nix eval ".#nixidyEnvs.${s}" --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]'); then
      if [ -n "$envs" ]; then
        while IFS= read -r e; do
          printf "%s.%s\n" "$s" "$e"
        done <<< "$envs"
      fi
    fi
  done

  # containerMatrix: top-level keys only (members are derivations/lists, not attrsets)
  printf "\n## containerMatrix\n"
  nix eval .#containerMatrix --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]' || echo "(empty)"

  # clan / clanInternals: clan-core composition attrsets; enumerate top-level keys
  printf "\n## clan\n"
  nix eval .#clan --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]' || echo "(empty)"
  printf "\n## clanInternals\n"
  nix eval .#clanInternals --apply builtins.attrNames --json 2>/dev/null | jq -r '.[]' || echo "(empty)"

  # Large re-exports: emit count only (enumerating members pollutes output)
  printf "\n## lib\n"
  lib_count=$(nix eval --raw .#lib --apply 'x: toString (builtins.length (builtins.attrNames x))' 2>/dev/null || echo "0")
  echo "(nixpkgs.lib re-export, ${lib_count} top-level attrs)"

  printf "\n## legacyPackages\n"
  for s in "${systems[@]}"; do
    if count=$(nix eval --raw ".#legacyPackages.${s}" --apply 'x: toString (builtins.length (builtins.attrNames x))' 2>/dev/null); then
      printf "%s: (nixpkgs re-export, %s top-level attrs)\n" "$s" "$count"
    fi
  done

  printf "\n## tests\n"
  tests_count=$(nix eval --raw .#tests --apply 'x: toString (builtins.length (builtins.attrNames x))' 2>/dev/null || echo "0")
  echo "(${tests_count} top-level test attrs)"

  printf "\n## inputs\n"
  nix flake metadata --json 2>/dev/null | jq -r '.locks.nodes | keys[] | select(. != "root")'

# Lint nix files
[group('nix')]
lint:
  prek run --all-files

# Manually enter dev shell
[group('nix')]
dev:
  {{nix_cmd}} develop

# Remove build output link (no garbage collection)
[group('nix')]
clean:
  rm -f ./result

# Preview nix store garbage collection (dry run)
[group('nix')]
gc-dry keep="5" keep_since="7d":
  #!/usr/bin/env bash
  set -euo pipefail
  nh clean all -n -k {{keep}} -K {{keep_since}}
  echo ""
  echo "This was a dry run. To execute garbage collection:"
  echo "  just gc {{keep}} {{keep_since}}"
  echo "  nh clean all -k {{keep}} -K {{keep_since}}"

# Execute nix store garbage collection
[group('nix')]
gc keep="5" keep_since="7d":
  nh clean all -k {{keep}} -K {{keep_since}}

# Build nix flake
[group('nix')]
build profile: lint check
  {{nix_cmd}} build --json --no-link --print-build-logs ".#{{ profile }}"

# Build an experimental debug package with nom (isolated from nixpkgs/CI builds)
[group('nix')]
debug-build package:
  nom build '.#debug.{{ package }}'

# List all available debug packages
[group('nix')]
debug-list:
  @echo "Available debug packages:"
  @{{nix_cmd}} eval .#debug --apply 'builtins.attrNames' --json | jq -r '.[]' | sort

# Check nix flake
[group('nix')]
check:
  #!/usr/bin/env bash
  set -euo pipefail
  echo "Running nix flake check..."
  {{nix_cmd}} flake check -L --show-trace

# Print the sorted package names of every home configuration for the current system (or SYSTEM's, given a builder that can realise them); diff two runs to review a relocation
[group('nix')]
home-package-names system="":
  #!/usr/bin/env bash
  set -euo pipefail
  system="{{system}}"
  [ -n "$system" ] || system=$(nix eval --impure --raw --expr builtins.currentSystem)
  {{nix_cmd}} eval --json .#lib.homePackageNames --apply "f: f \"$system\"" | jq --sort-keys .

# Validate flake checks via nix-fast-build (failure isolation, parallel eval+build, nom output)
# --eval-workers 4: reduces SQLite eval-cache contention (harmless but noisy at default=ncpus)
# --skip-cached: derivations already present in the binary cache are not rebuilt
# nom=auto|on|off: auto disables nom when stdout is not a TTY (e.g., piped to tee)
# push=off|on: on uploads built paths to the niks3 PUSH server (auth token resolved by the
#   niks3 client from ~/.config/niks3/auth-token); the PULL substituter cache.scientistexperience.net
#   is configured separately. push stays opt-in on every lane, including the remote one: pushing
#   every build would churn the cache with paths no other machine will consume, and whether a given
#   build is worth publishing is a human judgement. Forgetting to opt in is cheap to recover from --
#   the outputs stay in the store, so re-running with push=on pays only the upload.
# system="": defaults to builtins.currentSystem. When system is the native system the build runs
#   locally and results land in the local store; for any other system the build is routed with
#   --remote magnetite.zt --no-download, so the remote store is populated and the local store does
#   not become a staging area for another platform's closure. The remote lane also gets
#   --retries 2, because --remote opens one ssh connection per build and a dropped handshake
#   exits 255 and reds a check that names a package which is not at fault. Retries are scoped to
#   that lane on purpose: retrying local builds would hide a genuinely flaky check instead of
#   surfacing it. The underlying limit is magnetite's sshd MaxStartups, raised in its machine
#   config; these retries absorb the residue rather than substituting for that fix.
# Params are positional, so usage is: just check-fast auto on x86_64-linux
[group('nix')]
check-fast nom="auto" push="off" system="":
  #!/usr/bin/env bash
  set -euo pipefail
  case "{{nom}}" in
    auto) [ -t 1 ] && flag="" || flag="--no-nom" ;;
    on)   flag="" ;;
    off)  flag="--no-nom" ;;
    *) echo "nom must be auto|on|off" >&2; exit 1 ;;
  esac
  pushflag=""; [ "{{push}}" = "on" ] && pushflag="--niks3-server https://niks3.scientistexperience.net"
  native=$(nix eval --impure --raw --expr 'builtins.currentSystem')
  system="{{system}}"
  [ -n "$system" ] || system="$native"
  remoteflags=""
  [ "$system" = "$native" ] || remoteflags="--remote magnetite.zt --no-download --retries 2"
  nix-fast-build $flag $pushflag $remoteflags \
    --no-link \
    --option accept-flake-config true \
    --eval-workers 4 \
    --skip-cached \
    --flake ".#checks.$system"

# Verify system configuration builds after updates (run before activate)
[group('nix')]
verify:
  @./scripts/verify-system.sh

# Bisect nixpkgs commits to find which one broke the build (automatic mode)
[group('nix')]
bisect-nixpkgs:
  @./scripts/bisect-nixpkgs.sh auto

# Bisect nixpkgs commits (manual mode: start, step, status, reset)
[group('nix')]
bisect-nixpkgs-manual command="status":
  @./scripts/bisect-nixpkgs.sh {{ command }}

# Shell with bootstrap dependencies
[group('nix')]
bootstrap-shell:
  nix \
  --extra-experimental-features "nix-command flakes" \
  shell \
  "nixpkgs#git" \
  "nixpkgs#just"

# Idempotent post-nix bootstrap: install direnv if missing, report status
# Body lives in modules/apps/bootstrap/bootstrap.{nix,sh}.
# Chicken-and-egg: for first-contact nix install, use `make bootstrap`.
[group('bootstrap')]
bootstrap *ARGS:
  {{nix_cmd}} run --no-warn-dirty .#bootstrap -- {{ARGS}}

# Verify host nix/flakes/direnv/flake-metadata (mirror of `make verify`)
# Body lives in modules/apps/bootstrap/verify.{nix,sh}.
[group('bootstrap')]
bootstrap-verify *ARGS:
  {{nix_cmd}} run --no-warn-dirty .#verify -- {{ARGS}}

# Generate ~/.config/sops/age/keys.txt (mirror of `make setup-user`)
# Body lives in modules/apps/bootstrap/setup-user.{nix,sh}.
# Idempotent: re-print public key and exit 0 if the key already exists.
[group('bootstrap')]
bootstrap-setup-user *ARGS:
  {{nix_cmd}} run --no-warn-dirty .#setup-user -- {{ARGS}}

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
  {{nix_cmd}} run nix-darwin -- switch --flake ".#{{ profile }}"

# Build darwin from flake
[group('nix-darwin')]
darwin-build profile="aarch64":
  just build "darwinConfigurations.{{ profile }}.config.system.build.toplevel"

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
  {{ user }}@{{ destination }}:~/vanixiets

# Build nixos from flake
[group('nixos')]
nixos-build profile="aarch64":
  just build "nixosConfigurations.{{ profile }}.config.system.build.toplevel"

# Test nixos from flake
[group('nixos')]
nixos-test profile="aarch64":
  nixos-rebuild test --flake ".#{{ profile }}"

# Update nix flake
[group('nix')]
update:
  {{nix_cmd}} flake update

# Update a package using its updateScript
# Note: claude-code-bin and ccstatusline are now from llm-agents and update via flake update
[group('nix')]
update-package package="atuin-format":
  #!/usr/bin/env bash
  set -euo pipefail
  UPDATE_SCRIPT=$({{nix_cmd}} build .#{{ package }}.updateScript --no-link --print-out-paths)
  echo "Running updateScript for {{ package }}..."
  $UPDATE_SCRIPT
  echo "Update complete. Review changes with: git diff"

## bun

# Regenerate bun.nix from bun.lock using the pinned bun2nix CLI
# Assumes the devshell (bun2nix + treefmt on PATH); for a non-devshell
# invocation use `nix run .#regenerate-bun-nix` instead.
[group('bun')]
regenerate-bun-nix:
  bun2nix --lock-file bun.lock --output-file bun.nix
  treefmt bun.nix

# Fail if the npm playwright version drifts from the flake-provided playwright version.
# Run standalone as a sanity check or let the composite gate on it.
[group('bun')]
bun-drift-check:
  #!/usr/bin/env bash
  set -euo pipefail
  FLAKE_PW=$(nix eval --raw --inputs-from . "playwright-web-flake#packages.$(nix eval --impure --raw --expr builtins.currentSystem).playwright-driver.version")
  NPM_PW=$(jq -r '.devDependencies."playwright"' packages/docs/package.json)
  NPM_PWT=$(jq -r '.devDependencies."@playwright/test"' packages/docs/package.json)
  if [[ "$NPM_PW" != "$FLAKE_PW" || "$NPM_PWT" != "$FLAKE_PW" ]]; then
    echo "ERROR: playwright drift detected." >&2
    echo "  flake playwright-web-flake: $FLAKE_PW" >&2
    echo "  npm playwright:             $NPM_PW" >&2
    echo "  npm @playwright/test:       $NPM_PWT" >&2
    exit 1
  fi
  echo "playwright in sync at $FLAKE_PW"

# Bulk-bump every dep in every workspace to latest stable (playwright included;
# reverted by bun-repin-playwright in the composite flow). Hits the npm registry.
[group('bun')]
bun-bump-all:
  #!/usr/bin/env bash
  set -euo pipefail
  echo "Bumping workspace root..."
  bun update --latest
  echo "Bumping packages/docs..."
  (cd packages/docs && bun update --latest)

# Overwrite playwright + @playwright/test in packages/docs/package.json to the
# exact version pinned by the playwright-web-flake flake input. Preserves the
# rangeStrategy=pin invariant that Renovate enforces.
[group('bun')]
bun-repin-playwright:
  #!/usr/bin/env bash
  set -euo pipefail
  FLAKE_PW=$(nix eval --raw --inputs-from . "playwright-web-flake#packages.$(nix eval --impure --raw --expr builtins.currentSystem).playwright-driver.version")
  pkg=packages/docs/package.json
  tmp=$(mktemp)
  jq --arg v "$FLAKE_PW" '
    .devDependencies["playwright"] = $v |
    .devDependencies["@playwright/test"] = $v
  ' "$pkg" > "$tmp"
  mv "$tmp" "$pkg"
  echo "Re-pinned playwright + @playwright/test to $FLAKE_PW in $pkg"

# Reconcile bun.lock with the current package.json(s) without touching node_modules.
# Re-resolves any dep whose locked version no longer satisfies its package.json range.
[group('bun')]
bun-lockfile-reconcile:
  bun install --lockfile-only

# Preview outdated deps across all workspaces that bun-update-latest-stable
# would bump. Excludes playwright per the flake-is-version-ceiling invariant.
# The "Latest" column maps to what --latest bumps; "Update" to plain bun update.
[group('bun')]
bun-outdated:
  bun outdated --recursive '!playwright' '!@playwright/test'

# Bump all non-playwright deps to latest stable, then reconcile bun.lock and
# regenerate bun.nix. Playwright stays pinned to the playwright-web-flake version
# per the flake-is-version-ceiling invariant.
[group('bun')]
bun-update-latest-stable:
  #!/usr/bin/env bash
  set -euo pipefail

  echo "=== Phase 1: Playwright drift check ==="
  just bun-drift-check

  echo "=== Phase 2: Bump all deps to latest stable ==="
  just bun-bump-all

  echo "=== Phase 3: Re-pin playwright to flake version ==="
  just bun-repin-playwright

  echo "=== Phase 4: Reconcile bun.lock ==="
  just bun-lockfile-reconcile

  echo "=== Phase 5: Regenerate bun.nix ==="
  just regenerate-bun-nix

  echo "=== Done ==="
  git diff --stat -- package.json packages/docs/package.json bun.lock bun.nix
  echo ""
  echo "Verify playwright pin preserved:"
  grep -E '"(playwright|@playwright/test)":' packages/docs/package.json

## agents

# Regenerate the vendored openspec claude assets from the pinned llm-agents input.
# Runs openspec init in a sandboxed temp dir; rerun after an llm-agents bump.
[group('agents')]
openspec-regen:
  {{nix_cmd}} run .#openspec-refresh-vendored-artifacts

# Materialize this repo's own apm skill packages from the committed lockfile.
[group('agents')]
agents-install:
  {{nix_cmd}} run .#apm-skills-install

# Re-resolve apm skill packages' `#main` pins and rewrite the committed lockfile.
[group('agents')]
agents-relock:
  {{nix_cmd}} run .#apm-skills-install -- --relock

# Compose this repo's agent-context-* apm packages into the repo-root AGENTS.md (vanixiets tier only).
[group('agents')]
agents-context:
  {{nix_cmd}} run .#apm-context-compile

# Compose every agent-context-* tier (core + vcs + vcs-jj + vanixiets) into the repo-root AGENTS.md.
[group('agents')]
agents-context-full:
  {{nix_cmd}} run .#apm-context-compile -- --full

# Refresh the generated openwiki wiki against the current tree via the openwiki CLI; metered against the configured model provider.
[group('agents')]
openwiki-refresh:
  OPENWIKI_PROVIDER=openai-chatgpt \
  OPENWIKI_MODEL_ID=gpt-5.6-sol \
  OPENWIKI_REASONING_EFFORT=xhigh \
  OPENWIKI_TELEMETRY_DISABLED=1 \
  bunx -p openwiki@0.5.0 openwiki code --update --print

## terraform/terranix

# Run terraform via terranix flake app (init + apply, arguments not supported)
[group('terraform')]
terraform:
  rosetta-manage --stop
  rm -f terraform/.terraform.lock.hcl
  {{nix_cmd}} run .#terraform

# Initialize terraform
[group('terraform')]
terraform-init:
  rosetta-manage --stop
  rm -f terraform/.terraform.lock.hcl
  {{nix_cmd}} run .#terraform.terraform -- init -input=false

# Save terraform plan for review (writes terraform/tfplan)
[group('terraform')]
terraform-plan *ARGS: terraform-init
  {{nix_cmd}} run .#terraform.terraform -- plan -out=tfplan {{ARGS}}

# Apply a saved terraform plan (reads terraform/tfplan)
[group('terraform')]
terraform-apply *ARGS: terraform-init
  {{nix_cmd}} run .#terraform.terraform -- apply tfplan {{ARGS}}

# Run terraform destroy
[group('terraform')]
terraform-destroy *ARGS: terraform-init
  {{nix_cmd}} run .#terraform.terraform -- destroy {{ARGS}}

## clan
# Commands for clan-based machine management (deferred module composition+clan architecture)

# Run all tests (nix flake check)
[group('clan')]
test:
  {{nix_cmd}} flake check

# Run fast tests only (nix-unit + validation tests)
[group('clan')]
test-quick:
  @echo "Running fast validation tests..."
  @echo "TC-017: Naming conventions"
  {{nix_cmd}} build .#checks.aarch64-darwin.naming-conventions --print-build-logs
  @echo ""
  @echo "TC-007: Secrets generation"
  {{nix_cmd}} build .#checks.aarch64-darwin.secrets-generation --print-build-logs
  @echo ""
  @echo "TC-006: Deployment safety"
  {{nix_cmd}} build .#checks.aarch64-darwin.deployment-safety --print-build-logs
  @echo ""
  @echo "TC-012: Terraform validation"
  {{nix_cmd}} build .#checks.aarch64-darwin.terraform-validate --print-build-logs
  @echo ""
  @echo "✓ All validation tests passed"

# Run the QEMU/KVM NixOS VM tests (checks named vm-*; requires /dev/kvm on a Linux builder)
[group('clan')]
test-integration:
  #!/usr/bin/env bash
  set -euo pipefail
  system="$(nix eval --impure --raw --expr 'builtins.currentSystem')"
  for name in $({{nix_cmd}} eval ".#checks.$system" --apply 'cs: builtins.filter (n: builtins.match "vm-.*" n != null) (builtins.attrNames cs)' --json | jq -r '.[]'); do
    echo "==> $name"
    {{nix_cmd}} build ".#checks.$system.$name" --no-link --print-build-logs
  done

# Build all machine configurations using nom
[group('clan')]
build-all:
  @echo "Building all machine configurations..."
  nom build .#nixosConfigurations.cinnabar.config.system.build.toplevel
  nom build .#nixosConfigurations.electrum.config.system.build.toplevel
  nom build .#darwinConfigurations.blackphos.system
  nom build .#darwinConfigurations.stibnite.system
  @echo "All machines built successfully"

# Build a specific machine configuration
[group('clan')]
build-machine machine:
  nom build .#nixosConfigurations.{{machine}}.config.system.build.toplevel || \
  nom build .#darwinConfigurations.{{machine}}.system

# Show flake outputs
[group('clan')]
clan-show:
  {{nix_cmd}} flake show

# Show flake metadata
[group('clan')]
clan-metadata:
  {{nix_cmd}} flake metadata

## docs

# Install workspace dependencies
[group('docs')]
install:
  bun install {{ if env("CI", "") != "" { "--frozen-lockfile" } else { "" } }}

# Start documentation development server
[group('docs')]
docs-dev:
  cd packages/docs && bun run dev

# Build the documentation site
[group('docs')]
docs-build: diagrams-build
  cd packages/docs && bun run build

# Preview the built documentation site
[group('docs')]
docs-preview:
  cd packages/docs && bun run preview

# Format documentation code with Biome
[group('docs')]
docs-format:
  cd packages/docs && bun run format

# Lint documentation code with Biome
[group('docs')]
docs-lint:
  cd packages/docs && bun run lint

# Check and fix documentation code with Biome
[group('docs')]
docs-check:
  cd packages/docs && bun run check:fix

# Validate internal and external links in documentation
[group('docs')]
docs-linkcheck:
  nix build --accept-flake-config .#checks.$(nix eval --raw --impure --expr builtins.currentSystem).package-vanixiets-docs-test-linkcheck

## diagrams

# Compile all typst diagrams to SVG and optimize for web
[group('diagrams')]
diagrams-build:
  #!/usr/bin/env bash
  set -euo pipefail
  echo "Compiling typst diagrams to SVG..."
  cd packages/docs/diagrams
  for typ in *.typ; do
    [ -f "$typ" ] || continue
    name="${typ%.typ}"
    echo "  $typ -> $name.svg"
    typst compile --format svg "$typ" "../public/diagrams/$name.svg"
  done
  echo "Optimizing SVGs with svgo..."
  cd ..
  for svg in public/diagrams/*.svg; do
    [ -f "$svg" ] || continue
    echo "  Optimizing $(basename "$svg")"
    svgo --quiet "$svg" -o "$svg"
  done
  echo "Done. Diagrams in packages/docs/public/diagrams/"

# Compile a single typst diagram (without optimization)
[group('diagrams')]
diagrams-compile name:
  cd packages/docs/diagrams && typst compile --format svg "{{name}}.typ" "../public/diagrams/{{name}}.svg"

# Watch typst diagrams for changes and recompile
[group('diagrams')]
diagrams-watch:
  cd packages/docs/diagrams && typst watch --format svg reading-paths.typ ../public/diagrams/reading-paths.svg

# Run all documentation tests
[group('docs')]
docs-test:
  cd packages/docs && bun run test

# Run documentation unit tests
[group('docs')]
docs-test-unit:
  cd packages/docs && bun run test:unit

# Run documentation E2E tests
[group('docs')]
docs-test-e2e:
  cd packages/docs && bun run test:e2e

# Open Playwright HTML report from last E2E test run
[group('docs')]
docs-test-e2e-report:
  cd packages/docs && bunx playwright show-report

# Generate documentation test coverage report
[group('docs')]
docs-test-coverage:
  cd packages/docs && bun run test:coverage

# Deploy documentation to Cloudflare Workers (preview).
# Wraps with `sops exec-env secrets/shared.yaml '<cmd>'` so
# CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are exported per the
# deploy-docs env-var contract (ADR-002 / env-var-contract-design.md
# §2.1.3 Call site A). Devs with a local `.env` already exporting the
# vars can skip the wrap; the sops prefix is idempotent and keeps fresh
# clones without `.env` working. `sops exec-env` requires exactly two
# positional args (file + single shell-command string), so the nix-run
# invocation is quoted as one arg.
[group('docs')]
docs-deploy-preview branch=`git branch --show-current`:
  sops exec-env secrets/shared.yaml \
    'nix run --accept-flake-config .#deploy-docs -- preview "{{branch}}"'

# Deploy documentation to Cloudflare Workers (production).
# See docs-deploy-preview header for the sops wrap rationale.
[group('docs')]
docs-deploy-production:
  sops exec-env secrets/shared.yaml \
    'nix run --accept-flake-config .#deploy-docs -- production'

# List recent Cloudflare deployments
[group('docs')]
docs-deployments:
  cd packages/docs && sops exec-env ../../secrets/shared.yaml "bunx wrangler deployments list"

# Tail live logs from Cloudflare Workers
[group('docs')]
docs-tail:
  cd packages/docs && sops exec-env ../../secrets/shared.yaml "bunx wrangler tail"

# List recent Cloudflare versions
[group('docs')]
docs-versions limit="10":
  cd packages/docs && sops exec-env ../../secrets/shared.yaml "bunx wrangler versions list --limit {{limit}}"

## containers
# Unified container builds using pkgsCross
# Works identically on x86_64-linux, aarch64-linux, and aarch64-darwin
# pkgsCross auto-optimizes: native when host == target, cross-compile otherwise

# Build a container for target architecture (x86_64 or aarch64)
[group('containers')]
container-build CONTAINER="fd" TARGET="aarch64":
  {{nix_cmd}} build '.#{{CONTAINER}}Container-{{TARGET}}'

# Build containers for both architectures
[group('containers')]
container-build-all CONTAINER="fd":
  @echo "Building x86_64-linux..."
  {{nix_cmd}} build '.#{{CONTAINER}}Container-x86_64' -o result-x86_64
  @echo "Building aarch64-linux..."
  {{nix_cmd}} build '.#{{CONTAINER}}Container-aarch64' -o result-aarch64
  @echo "✓ Both architectures built successfully"

# Push multi-arch manifest to registry (requires GITHUB_TOKEN)
# TAGS: comma-separated additional tags applied via crane (no re-upload)
[group('containers')]
container-push CONTAINER="fd" VERSION="1.0.0" TAGS="":
  VERSION={{VERSION}} TAGS={{TAGS}} {{nix_cmd}} run --impure '.#{{CONTAINER}}Manifest'

# Push single-arch manifest (x86_64 only)
[group('containers')]
container-push-x86 CONTAINER="fd" VERSION="1.0.0" TAGS="":
  VERSION={{VERSION}} TAGS={{TAGS}} {{nix_cmd}} run --impure '.#{{CONTAINER}}Manifest-x86_64'

# Push single-arch manifest (aarch64 only)
[group('containers')]
container-push-arm CONTAINER="fd" VERSION="1.0.0" TAGS="":
  VERSION={{VERSION}} TAGS={{TAGS}} {{nix_cmd}} run --impure '.#{{CONTAINER}}Manifest-aarch64'

# Load container image to Docker daemon via nix2container
[group('containers')]
container-load CONTAINER="fd" TARGET="aarch64":
  {{nix_cmd}} run '.#{{CONTAINER}}Container-{{TARGET}}.copyToDockerDaemon'

# Test container by running with --help
[group('containers')]
container-test BINARY="fd":
  docker run --rm {{BINARY}}:latest --help

# Complete workflow: build, load, and test a container
[group('containers')]
container-all CONTAINER="fd" BINARY="" TARGET="aarch64":
  #!/usr/bin/env bash
  set -euo pipefail
  BINARY="${BINARY:-$CONTAINER}"
  just container-build {{CONTAINER}} {{TARGET}}
  just container-load {{CONTAINER}} {{TARGET}}
  just container-test "$BINARY"

# Verify container architecture metadata
[group('containers')]
container-verify CONTAINER="fd" TARGET="aarch64":
  #!/usr/bin/env bash
  set -euo pipefail
  RESULT=$({{nix_cmd}} build '.#{{CONTAINER}}Container-{{TARGET}}' --no-link --print-out-paths)
  echo "Container: $RESULT"
  echo "Architecture: $(jq -r '.arch' "$RESULT")"
  echo "Layers: $(jq '.layers | length' "$RESULT")"

# Defined containers - keep in sync with containerDefs in modules/containers/default.nix
# CI uses `nix eval .#containerMatrix` for discovery; this is for local convenience
_containers := "fd rg"

# Show container matrix from Nix (same data CI uses)
[group('containers')]
container-matrix:
  @echo "=== Container Matrix (from Nix) ==="
  @{{nix_cmd}} eval .#containerMatrix --json | jq .

# Build all defined containers for all architectures
[group('containers')]
container-build-all-defs:
  #!/usr/bin/env bash
  set -euo pipefail
  for container in {{_containers}}; do
    echo "=== Building $container for all architectures ==="
    just container-build-all "$container"
  done
  echo "✓ All containers built successfully"

# Push all defined container manifests to registry
[group('containers')]
container-push-all VERSION="1.0.0" TAGS="":
  #!/usr/bin/env bash
  set -euo pipefail
  for container in {{_containers}}; do
    echo "=== Pushing $container manifest (version {{VERSION}}, tags: ${TAGS:-auto}) ==="
    just container-push "$container" "{{VERSION}}" "{{TAGS}}"
  done
  echo "✓ All manifests pushed successfully"

# Complete workflow: build and push all containers
[group('containers')]
container-release VERSION="1.0.0" TAGS="":
  #!/usr/bin/env bash
  set -euo pipefail
  echo "=== Building all containers ==="
  just container-build-all-defs
  echo ""
  echo "=== Pushing all manifests ==="
  just container-push-all "{{VERSION}}" "{{TAGS}}"
  echo ""
  echo "✓ Release complete: version {{VERSION}}"
  if [[ -n "{{TAGS}}" ]]; then
    echo "  Additional tags: {{TAGS}}"
  fi

## k3d

# Create local k3d cluster with OrbStack and bootstrap secrets
# Note: DNS configuration happens in k3d-deploy after Cilium CNI is ready
[group('k3d')]
k3d-up:
  # cluster.yaml volume-mounts this host path at /manifests; k3d only warns
  # when it is absent, leaving the mount unusable for the rest of the run.
  @mkdir -p /tmp/k3d-manifests
  ctlptl apply -f kubernetes/clusters/local-k3d/cluster.yaml
  @just k3d-bootstrap-secrets

# Bootstrap secrets required before first deployment (idempotent)
# Supports both CI (SOPS_AGE_KEY env var) and local dev (file-based) workflows
# Body lives in modules/apps/cluster/k3d-bootstrap-secrets.{nix,sh}.
[group('k3d')]
k3d-bootstrap-secrets *ARGS:
  {{nix_cmd}} run --no-warn-dirty .#k3d-bootstrap-secrets -- {{ARGS}}

# Configure CoreDNS to forward sslip.io queries to public DNS resolvers
# Required because OrbStack's DNS (192.168.107.1) cannot resolve sslip.io wildcards
# Body lives in modules/apps/cluster/k3d-configure-dns.{nix,sh}.
[group('k3d')]
k3d-configure-dns *ARGS:
  {{nix_cmd}} run --no-warn-dirty .#k3d-configure-dns -- {{ARGS}}

# Delete local k3d cluster
[group('k3d')]
k3d-down:
  ctlptl delete -f kubernetes/clusters/local-k3d/cluster.yaml

# Show k3d cluster status
[group('k3d')]
k3d-status:
  k3d cluster list

# Deploy to k3d cluster using staged deployment (foundation then infrastructure)
# This mirrors the kargo pattern of sequential helm --wait installs but declaratively.
# Foundation (CNI) must be ready before infrastructure pods can schedule.
[group('k3d')]
k3d-deploy:
  #!/usr/bin/env bash
  set -euo pipefail

  echo "=== Stage 1: Foundation (CNI) ==="
  {{nix_cmd}} run .#k8s-deploy-local-k3d-foundation -- --yes

  echo ""
  echo "Waiting for Cilium pods to be created..."
  sleep 5  # Brief delay for pods to be scheduled

  echo "Waiting for Cilium Agent to be ready..."
  kubectl wait --for=condition=Ready pods -l app.kubernetes.io/name=cilium-agent -n kube-system --timeout=300s

  echo "Waiting for Cilium Operator to be ready..."
  kubectl wait --for=condition=Ready pods -l app.kubernetes.io/name=cilium-operator -n kube-system --timeout=300s

  echo ""
  echo "=== Configure CoreDNS (requires CNI) ==="
  just k3d-configure-dns

  echo ""
  echo "=== Stage 2: Infrastructure (CRDs) ==="
  # First pass: applies CRDs in prio-10, CRs may fail (CRDs not yet registered)
  {{nix_cmd}} run .#k8s-deploy-local-k3d-infrastructure -- --yes || true

  echo ""
  echo "Waiting for CRDs to be established..."
  kubectl wait --for=condition=Established crd/sopssecrets.isindir.github.com --timeout=60s
  kubectl wait --for=condition=Established crd/appprojects.argoproj.io --timeout=60s
  kubectl wait --for=condition=Established crd/applications.argoproj.io --timeout=60s
  kubectl wait --for=condition=Established crd/applicationsets.argoproj.io --timeout=60s

  echo ""
  echo "=== Stage 2: Infrastructure (CRs) ==="
  # Second pass: CRDs are now registered, CRs will succeed
  {{nix_cmd}} run .#k8s-deploy-local-k3d-infrastructure -- --yes

  echo ""
  echo "=== Deployment complete ==="
  kubectl get pods -A

# Deploy only foundation layer (Cilium CNI) - use for debugging or manual staging
[group('k3d')]
k3d-deploy-foundation:
  {{nix_cmd}} run .#k8s-deploy-local-k3d-foundation -- --yes

# Deploy only infrastructure layer - use after foundation is ready
[group('k3d')]
k3d-deploy-infrastructure:
  {{nix_cmd}} run .#k8s-deploy-local-k3d-infrastructure -- --yes

# Full k3d workflow: create cluster, bootstrap secrets, deploy all layers
# Body lives in modules/apps/cluster/k3d-full.{nix,sh}; delegates back to
# the k3d-down, k3d-up, and k3d-deploy recipes above.
[group('k3d')]
k3d-full *ARGS:
  {{nix_cmd}} run --no-warn-dirty .#k3d-full -- {{ARGS}}

# Run all kubernetes tests (foundation + infrastructure)
[group('k3d')]
k3d-test:
  chainsaw test kubernetes/tests/local-k3d/

# Run only foundation tests
[group('k3d')]
k3d-test-foundation:
  chainsaw test kubernetes/tests/local-k3d/foundation/

# Run only infrastructure tests
[group('k3d')]
k3d-test-infrastructure:
  chainsaw test kubernetes/tests/local-k3d/infrastructure/

# Run tests with coverage report showing tested vs deployed resources
# Respects NO_COLOR env var and auto-detects CI environments
# Body lives in modules/apps/cluster/k3d-test-coverage.{nix,sh};
# scripts/k3d-test-coverage.sh retained as a thin backward-compat shim.
[group('k3d')]
k3d-test-coverage *ARGS:
  {{nix_cmd}} run --no-warn-dirty .#k3d-test-coverage -- {{ARGS}}

# Wait for kluctl-deployed foundation and infrastructure pods to be ready
# Body lives in modules/apps/cluster/k3d-wait-ready.{nix,sh}.
[group('k3d')]
k3d-wait-ready *ARGS:
  {{nix_cmd}} run --no-warn-dirty .#k3d-wait-ready -- {{ARGS}}

# Wait for all ArgoCD Applications to reach Synced + Healthy status
# Body lives in modules/apps/cluster/k3d-wait-argocd-sync.{nix,sh}.
[group('k3d')]
k3d-wait-argocd-sync *ARGS:
  {{nix_cmd}} run --no-warn-dirty .#k3d-wait-argocd-sync -- {{ARGS}}

# Full integration test: cluster creation, deployment, GitOps sync, and validation
# Alias for k3d-integration-ci so local and CI runs exercise one code path.
# Integration testing deliberately does not go through the ADR-006 private repo:
# it needs no clone, no PAT, and no network. Use nixidy-full for the deploy path.
[group('k3d')]
k3d-integration *ARGS:
  @just k3d-integration-ci {{ARGS}}

# Full CI integration test: local manifests, cluster, GitOps sync, tests
# Uses file:///manifests instead of remote repo - no GitHub credentials needed
# The /tmp/k3d-manifests directory is volume-mounted into the cluster at /manifests
# Body lives in modules/apps/cluster/k3d-integration-ci.{nix,sh}.
[group('k3d')]
k3d-integration-ci *ARGS:
  {{nix_cmd}} run --no-warn-dirty .#k3d-integration-ci -- {{ARGS}}

## nixidy (Phase 4 GitOps)
# Per ADR-006: Rendered manifests are pushed to separate private repos per cluster.
# local-k3d manifests → github.com/cameronraysmith/local-k3d, checked out as a
# sibling of this worktree. nixidy-push clones it if it is not there yet.

# Path to local-k3d manifest repository; keep in sync with nixidy-push.sh
local_k3d_repo := env("LOCAL_K3D_REPO", parent_directory(justfile_directory()) / "local-k3d")

# Build nixidy manifests for local-k3d environment (renders to ./result)
# Body lives in modules/apps/cluster/nixidy-build.{nix,sh}.
[group('nixidy')]
nixidy-build *ARGS:
  {{nix_cmd}} run --no-warn-dirty .#nixidy-build -- {{ARGS}}

# Show nixidy environment info
[group('nixidy')]
nixidy-info:
  {{nix_cmd}} run .#nixidy -- info .#local-k3d

# Push rendered manifests to local-k3d private repository
# Prerequisites: nixidy-build must be run first, local-k3d repo must exist
# Body lives in modules/apps/cluster/nixidy-push.{nix,sh}.
# LOCAL_K3D_REPO env var overrides the default target path; justfile-
# level local_k3d_repo is preserved as a convenience for scripted callers.
[group('nixidy')]
nixidy-push *ARGS:
  LOCAL_K3D_REPO="{{ local_k3d_repo }}" {{nix_cmd}} run --no-warn-dirty .#nixidy-push -- {{ARGS}}

# Build and push manifests in one step
# Body lives in modules/apps/cluster/nixidy-sync.{nix,sh}.
[group('nixidy')]
nixidy-sync *ARGS:
  LOCAL_K3D_REPO="{{ local_k3d_repo }}" {{nix_cmd}} run --no-warn-dirty .#nixidy-sync -- {{ARGS}}

# Bootstrap ArgoCD app-of-apps (transition from Phase 3 to Phase 4)
# Prerequisites: k3d-full must complete, manifests must be pushed to local-k3d repo
# Note: ArgoCD needs credentials to access private repo (configure via argocd CLI or UI)
# Body lives in modules/apps/cluster/nixidy-bootstrap.{nix,sh}.
[group('nixidy')]
nixidy-bootstrap *ARGS:
  {{nix_cmd}} run --no-warn-dirty .#nixidy-bootstrap -- {{ARGS}}

# Full GitOps workflow: Phase 3 bootstrap + Phase 4 ArgoCD takeover
# Note: Requires local-k3d repo to exist and ArgoCD to have access credentials
[group('nixidy')]
nixidy-full:
  #!/usr/bin/env bash
  set -euo pipefail

  echo "=== Phase 3: Bootstrap (easykubenix/kluctl) ==="
  just k3d-full

  echo ""
  echo "=== Phase 4: Render and push manifests ==="
  just nixidy-sync

  echo ""
  echo "=== Phase 4: GitOps (nixidy/ArgoCD) ==="
  echo "Waiting for ArgoCD to be fully ready..."
  kubectl wait --for=condition=Available deployment/argocd-server -n argocd --timeout=120s

  echo ""
  echo "Applying app-of-apps bootstrap Application..."
  {{nix_cmd}} run .#nixidy -- bootstrap .#local-k3d | kubectl apply -f -

  echo ""
  echo "=== GitOps transition complete ==="
  echo "ArgoCD will now manage all applications via sync waves."
  echo "Access ArgoCD UI: kubectl port-forward svc/argocd-server -n argocd 8080:80"
  echo ""
  echo "NOTE: ArgoCD needs credentials to access the private local-k3d repo."
  echo "Configure via: argocd repo add https://github.com/cameronraysmith/local-k3d.git --username <user> --password <token>"

## secrets

# Scan repository for hardcoded secrets (full history)
[group('secrets')]
scan-secrets:
  gitleaks detect --verbose --redact

# Scan staged changes for secrets (pre-commit)
[group('secrets')]
scan-staged:
  gitleaks protect --staged --verbose --redact

# Show existing secrets using sops
[group('secrets')]
show:
  @echo "=== Shared secrets (secrets/shared.yaml) ==="
  @sops -d secrets/shared.yaml
  @echo
  @echo "=== Test secrets (secrets/test.yaml) ==="
  @sops -d secrets/test.yaml

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

  HASH=$(nix hash file --type sha256 --base64 "{{source_file}}" | cut -d'-' -f2 | head -c 32)

  BASE_NAME=$(basename "{{source_file}}" .yaml)
  BASE_NAME=$(basename "$BASE_NAME" .yml)

  TARGET_DIR="secrets/users/{{user}}"
  TARGET_FILE="${TARGET_DIR}/${HASH}-${BASE_NAME}.yaml"

  mkdir -p "$TARGET_DIR"

  cp "{{source_file}}" "$TARGET_FILE"
  echo "Copied {{source_file}} → $TARGET_FILE"

  sops encrypt --in-place "$TARGET_FILE"
  echo "Encrypted $TARGET_FILE with sops"

  echo "Hash: $HASH"
  echo "Final path: $TARGET_FILE"

# Verify hash integrity: decrypt secret file and compare hash with original file
[group('secrets')]
verify-hash original_file secret_file:
  #!/usr/bin/env bash
  set -euo pipefail

  SECRET_BASENAME=$(basename "{{secret_file}}")
  EXPECTED_HASH=$(echo "$SECRET_BASENAME" | cut -d'-' -f1)

  ACTUAL_HASH=$(nix hash file --type sha256 --base64 "{{original_file}}" | cut -d'-' -f2 | head -c 32)

  TEMP_FILE=$(mktemp)
  trap "rm -f $TEMP_FILE" EXIT

  sops decrypt "{{secret_file}}" > "$TEMP_FILE"

  DECRYPTED_HASH=$(nix hash file --type sha256 --base64 "$TEMP_FILE" | cut -d'-' -f2 | head -c 32)

  echo "Original file: {{original_file}}"
  echo "Secret file: {{secret_file}}"
  echo "Expected hash (from filename): $EXPECTED_HASH"
  echo "Actual hash (from original): $ACTUAL_HASH"
  echo "Decrypted hash: $DECRYPTED_HASH"
  echo

  if [ "$ACTUAL_HASH" = "$EXPECTED_HASH" ]; then
    echo "Original file hash matches secret filename hash"
  else
    echo "Original file hash does NOT match secret filename hash"
    exit 1
  fi

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
    sops -d "$file" > /dev/null && echo "  ● Valid" || echo "  ⊘ Failed"; \
  done

## CI/CD

# Trigger CI workflow and wait for result (blocking)
[group('CI/CD')]
ci-run-watch workflow="ci.yaml":
    #!/usr/bin/env bash
    set -euo pipefail

    echo "triggering workflow: {{workflow}} on branch: $(git branch --show-current)"
    gh workflow run {{workflow}} --ref $(git branch --show-current)

    sleep 5

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

# Validate latest CI run comprehensively
[group('CI/CD')]
ci-validate workflow="ci.yaml" run_id="":
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "{{run_id}}" ]; then
        RUN_ID=$(gh run list --workflow={{workflow}} --limit 1 --json databaseId --jq '.[0].databaseId')
    else
        RUN_ID="{{run_id}}"
    fi
    ./scripts/ci/validate-run.sh "$RUN_ID"

# Debug specific failed job from latest CI run
[group('CI/CD')]
ci-debug-job workflow="ci.yaml" job_name="nix (aarch64-darwin)":
    @RUN_ID=$(gh run list --workflow={{workflow}} --limit 1 --json databaseId --jq '.[0].databaseId'); \
    JOB_ID=$(gh run view "$RUN_ID" --json jobs --jq ".jobs[] | select(.name == \"{{job_name}}\") | .databaseId"); \
    gh run view --job "$JOB_ID" --log

# Trigger ad hoc flake input update on main
[group('CI/CD')]
update-flake-inputs:
    gh workflow run update-flake-inputs.yaml --ref main

# Update github secrets for repo from environment variables
[group('CI/CD')]
ghsecrets repo="cameronraysmith/vanixiets": # gitleaks:allow
  @echo "secrets before updates:"
  @echo
  PAGER=cat gh secret list --repo={{ repo }}
  @echo
  sops exec-env secrets/shared.yaml 'unset GITHUB_TOKEN && gh secret set CACHIX_AUTH_TOKEN --repo={{ repo }} --body="$CACHIX_AUTH_TOKEN"'
  sops exec-env secrets/shared.yaml 'unset GITHUB_TOKEN && gh secret set FAST_FORWARD_PAT --repo={{ repo }} --body="$FAST_FORWARD_PAT"'
  sops exec-env secrets/shared.yaml 'unset GITHUB_TOKEN && gh secret set FLAKE_UPDATER_APP_ID --repo={{ repo }} --body="$FLAKE_UPDATER_APP_ID"'
  sops exec-env secrets/shared.yaml 'unset GITHUB_TOKEN && gh secret set FLAKE_UPDATER_PRIVATE_KEY --repo={{ repo }} --body="$FLAKE_UPDATER_PRIVATE_KEY"'
  @echo
  @echo secrets after updates:
  @echo
  PAGER=cat gh secret list --repo={{ repo }}

# List available workflows and associated jobs.
[group('CI/CD')]
list-workflows:
  @act -l

# Execute ci.yaml workflow locally via act.
[group('CI/CD')]
test-flake-workflow:
  @sops exec-env secrets/shared.yaml 'act workflow_dispatch \
  -W ".github/workflows/ci.yaml" \
  -j nixci \
  -s GITHUB_TOKEN -s CACHIX_AUTH_TOKEN \
  --matrix os:ubuntu-latest \
  --container-architecture linux/amd64'

ratchet_base := "ratchet"

# List of GitHub Actions workflows
gha_workflows := "./.github/workflows/flake.yaml"

# Pin GitHub Actions workflow versions to commit SHAs
[group('CI/CD')]
ratchet-pin:
    @RATCHET_BASE="{{ratchet_base}}" GHA_WORKFLOWS="{{gha_workflows}}" ./scripts/ci/ratchet-workflow.sh pin

# Unpin GitHub Actions workflow versions to semantic versions
[group('CI/CD')]
ratchet-unpin:
    @RATCHET_BASE="{{ratchet_base}}" GHA_WORKFLOWS="{{gha_workflows}}" ./scripts/ci/ratchet-workflow.sh unpin

# Update GitHub Actions workflow versions to latest
[group('CI/CD')]
ratchet-update:
    @RATCHET_BASE="{{ratchet_base}}" GHA_WORKFLOWS="{{gha_workflows}}" ./scripts/ci/ratchet-workflow.sh update

# Upgrade GitHub Actions workflow versions across major versions
[group('CI/CD')]
ratchet-upgrade:
    @RATCHET_BASE="{{ratchet_base}}" GHA_WORKFLOWS="{{gha_workflows}}" ./scripts/ci/ratchet-workflow.sh upgrade

# Push nix-rosetta-builder VM image to Cachix and pin it (run after system updates)
[group('CI/CD')]
cache-rosetta-builder:
    #!/usr/bin/env bash
    set -euo pipefail

    echo "Finding nix-rosetta-builder VM image in current system..."

    YAML_PATH=$(nix-store --query --requisites /run/current-system | grep 'rosetta-builder.yaml$' || true)

    if [ -z "$YAML_PATH" ]; then
        echo "⊘ nix-rosetta-builder not found in current system"
        echo "   Is nix-rosetta-builder.enable = true in your configuration?"
        exit 1
    fi

    echo "Found config: $YAML_PATH"

    # Extract VM image path from YAML (format: "- location: /path/to/image")
    IMAGE_PATH=$(grep -A1 "images:" "$YAML_PATH" | grep "location:" | awk '{print $3}')

    if [ -z "$IMAGE_PATH" ]; then
        echo "⊘ Could not extract image path from $YAML_PATH"
        exit 1
    fi

    echo "VM image: $IMAGE_PATH"
    IMAGE_SIZE=$(du -h "$IMAGE_PATH" | cut -f1)
    echo "Size: $IMAGE_SIZE"

    echo ""
    echo "Pushing to Cachix (this may take a few minutes for ~2GB image)..."
    sops exec-env secrets/shared.yaml "cachix push \$CACHIX_CACHE_NAME $IMAGE_PATH"

    # Pin the image to prevent garbage collection
    echo ""
    echo "Pinning image to prevent garbage collection..."
    SHORT_HASH=$(echo "$IMAGE_PATH" | cut -d'/' -f4 | cut -d'-' -f1 | head -c8)
    PIN_NAME="nix-rosetta-builder-$SHORT_HASH"
    sops exec-env secrets/shared.yaml "cachix pin \$CACHIX_CACHE_NAME $PIN_NAME $IMAGE_PATH --keep-forever"

    echo ""
    echo "● Successfully pushed and pinned nix-rosetta-builder to Cachix"
    CACHE_NAME=$(sops exec-env secrets/shared.yaml 'echo $CACHIX_CACHE_NAME')
    echo "   View at: https://app.cachix.org/cache/$CACHE_NAME"
    echo "   Image: $IMAGE_PATH"
    echo "   Pin: $PIN_NAME"

# Check if nix-rosetta-builder image is in Cachix
[group('CI/CD')]
check-rosetta-cache:
    #!/usr/bin/env bash
    set -euo pipefail

    echo "Checking if nix-rosetta-builder image is cached..."

    YAML_PATH=$(nix-store --query --requisites /run/current-system | grep 'rosetta-builder.yaml$' || true)

    if [ -z "$YAML_PATH" ]; then
        echo "⚠️  nix-rosetta-builder not enabled in current system"
        exit 0
    fi

    echo "Found config: $YAML_PATH"

    IMAGE_PATH=$(grep -A1 "images:" "$YAML_PATH" | grep "location:" | awk '{print $3}')

    if [ -z "$IMAGE_PATH" ]; then
        echo "⊘ Could not extract image path"
        exit 1
    fi

    echo "Checking cache for: $IMAGE_PATH"

    CACHE_NAME=$(sops exec-env secrets/shared.yaml 'echo $CACHIX_CACHE_NAME')

    if {{nix_cmd}} path-info --store "https://$CACHE_NAME.cachix.org" "$IMAGE_PATH" &>/dev/null; then
        echo "● Image is cached"
        echo "   Cache: https://$CACHE_NAME.cachix.org"
        echo "   Path: $IMAGE_PATH"
    else
        echo "⊘ Image NOT in cache"
        echo "   Path: $IMAGE_PATH"
        echo "   Run: just cache-rosetta-builder"
        exit 1
    fi

# Test cachix push/pull with a simple derivation
[group('CI/CD')]
test-cachix:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Testing cachix push/pull..."

    STORE_PATH=$({{nix_cmd}} build nixpkgs#hello --no-link --print-out-paths)
    echo "Built: $STORE_PATH"

    echo "Pushing to cachix..."
    sops exec-env secrets/shared.yaml "cachix push \$CACHIX_CACHE_NAME $STORE_PATH"

    CACHE_NAME=$(sops exec-env secrets/shared.yaml 'echo $CACHIX_CACHE_NAME')
    echo "● Push completed. Verify at: https://app.cachix.org/cache/$CACHE_NAME"
    echo "Store path: $STORE_PATH"

# Build darwin system and push to cachix (run after just verify or just activate)
[group('CI/CD')]
cache-darwin-system:
    #!/usr/bin/env bash
    set -euo pipefail

    HOSTNAME=$(hostname)
    echo "Building darwin system for $HOSTNAME..."
    CACHE_NAME=$(sops exec-env secrets/shared.yaml 'echo $CACHIX_CACHE_NAME')
    echo "Cache: https://app.cachix.org/cache/$CACHE_NAME"
    echo ""

    FLAKE_OUTPUT=".#darwinConfigurations.$HOSTNAME.system"
    echo "Checking if system is already cached..."
    if {{nix_cmd}} path-info --store "https://$CACHE_NAME.cachix.org" "$FLAKE_OUTPUT" &>/dev/null; then
        CACHED_PATH=$({{nix_cmd}} path-info --store "https://$CACHE_NAME.cachix.org" "$FLAKE_OUTPUT")
        echo "✓ System already cached: $CACHED_PATH"
        echo ""
        read -p "Push again anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Skipping. System is already in cachix."
            exit 0
        fi
    fi

    echo "Building system configuration..."
    SYSTEM_PATH=$(nom build "$FLAKE_OUTPUT" --no-link --print-out-paths 2>&1 | tail -1)

    if [ -z "$SYSTEM_PATH" ] || [ ! -e "$SYSTEM_PATH" ]; then
        echo "⊘ Failed to build system or get store path"
        exit 1
    fi

    echo "Built: $SYSTEM_PATH"
    echo ""

    echo "Pushing system and all dependencies to cachix..."
    echo "(This may take several minutes depending on what's not already cached)"
    nix-store --query --requisites --include-outputs "$SYSTEM_PATH" | \
        sops exec-env secrets/shared.yaml "cachix push \$CACHIX_CACHE_NAME"

    echo ""
    echo "● Successfully pushed darwin system to cachix"
    echo "   Cache: https://app.cachix.org/cache/$CACHE_NAME"
    echo "   System: $SYSTEM_PATH"
    echo ""
    echo "Other machines can now pull from cachix instead of rebuilding."

# List all packages in packages/ directory
[group('CI/CD')]
list-packages:
  @ls -1 packages/

# List packages in JSON format for CI matrix
# Body lives in modules/apps/cluster/list-packages-json.{nix,sh}.
[group('CI/CD')]
list-packages-json *ARGS:
  @{{nix_cmd}} run --no-warn-dirty .#list-packages-json -- {{ARGS}}

# Validate package structure
[group('CI/CD')]
validate-package package:
  @echo "Validating package: {{ package }}"
  @test -d "packages/{{ package }}" || (echo "Package directory not found" && exit 1)
  @test -f "packages/{{ package }}/package.json" || (echo "package.json not found" && exit 1)
  @echo "✓ Package {{ package }} is valid"

# Test a package (install, unit tests, coverage, build, e2e)
[group('CI/CD')]
test-package package:
  cd packages/{{ package }} && bun install && bun run test:unit && bun run test:coverage && bun run build && bun run test:e2e

# Preview semantic-release version after merging current branch to target
[group('CI/CD')]
preview-version target="main" package="":
  nix run --accept-flake-config .#preview-version -- "{{target}}" "{{package}}"

# Run the release flake app with passthrough args (see modules/apps/release/release.{nix,sh})
# Examples:
#   just release --help
#   just release info packages/docs
#   just release packages/docs --dry-run
[group('CI/CD')]
release *args:
  {{nix_cmd}} run --no-warn-dirty .#release -- {{args}}

# Release a package using semantic-release
[group('CI/CD')]
release-package package dry_run="false":
  nix run --accept-flake-config .#release -- packages/{{package}} {{ if dry_run == "true" { "--dry-run" } else { "" } }}

## sops

# Extract key details from Bitwarden (all sops-* keys or specific key)
[group('sops')]
sops-extract-keys key="":
  #!/usr/bin/env bash
  if [ -n "{{key}}" ]; then
    scripts/sops/extract-key-details.sh "{{key}}"
  else
    scripts/sops/extract-key-details.sh
  fi

# Update .sops.yaml with keys from Bitwarden
[group('sops')]
sops-update-yaml:
  @scripts/sops/update-sops-yaml.sh

# Deploy host key from Bitwarden to /etc/ssh/ (requires sudo)
[group('sops')]
sops-deploy-host-key host:
  @scripts/sops/deploy-host-key.sh {{host}}

# Validate all SOPS key correspondences (config.nix ↔ Bitwarden ↔ .sops.yaml)
[group('sops')]
sops-validate-correspondences:
  @scripts/sops/validate-correspondences.sh

# Regenerate ~/.config/sops/age/keys.txt from Bitwarden
[group('sops')]
sops-sync-keys *FLAGS:
  @scripts/sops/sync-age-keys.sh {{FLAGS}}

# Full key rotation workflow (interactive)
[group('sops')]
sops-rotate:
  @echo "=== SOPS Key Rotation Workflow ==="
  @echo ""
  @echo "Prerequisites:"
  @echo "  1. Generate new SSH keys in Bitwarden Web UI:"
  @echo "     - sops-dev-ssh, sops-ci-ssh (repository keys)"
  @echo "     - sops-admin-user-ssh, sops-raquel-user-ssh (user identity keys)"
  @echo "     - sops-{hostname}-ssh for each host (host keys)"
  @echo "  2. Ensure Bitwarden CLI is unlocked: export BW_SESSION=\$(bw unlock --raw)"
  @echo ""
  @echo "Press Enter to continue or Ctrl-C to abort..."
  @read
  @echo ""
  @echo "Step 1: Extracting and validating keys from Bitwarden..."
  @just sops-extract-keys
  @echo ""
  @echo "Step 2: Updating .sops.yaml..."
  @just sops-update-yaml
  @echo ""
  @echo "Step 3: Re-encrypting secrets..."
  @find secrets/ -name "*.yaml" -type f -exec sops updatekeys {} \;
  @echo ""
  @echo "Step 4: Validating correspondences..."
  @just sops-validate-correspondences
  @echo ""
  @echo "=== Manual steps remaining ==="
  @echo "1. Deploy host keys: just sops-deploy-host-key <hostname>"
  @echo "2. Update GitHub CI secret: gh secret set SOPS_AGE_KEY --repo=\$(gh repo view --json nameWithOwner -q .nameWithOwner)"
  @echo "3. Test decryption: sops -d secrets/shared.yaml"
  @echo "4. Commit and push changes"
  @echo "5. Verify CI pipeline passes"

# Update keys for all encrypted files in secrets directory
[group('sops')]
update-all-keys:
  fd -e yaml -e json -e enc . secrets/ -x sops updatekeys -y {}

# Provision a bridge secret for NixOS HM key delivery
# Usage: just provision-bridge-key <sops-identity> [bw-item-name]
# Examples:
#   just provision-bridge-key raquel              -> looks up sops-raquel-user-ssh
#   just provision-bridge-key crs58 sops-admin-user-ssh  -> uses explicit item name
[group('sops')]
provision-bridge-key identity bw_item=("sops-" + identity + "-user-ssh"):
  #!/usr/bin/env bash
  set -euo pipefail

  if ! command -v bw &>/dev/null; then
    echo "Error: bw (Bitwarden CLI) not found in PATH" >&2
    exit 1
  fi

  if [ -z "${BW_SESSION:-}" ]; then
    echo "Error: BW_SESSION not set. Run:" >&2
    echo "  bw login          # if not logged in" >&2
    echo "  export BW_SESSION=\$(bw unlock --raw)" >&2
    exit 1
  fi

  mkdir -p secrets/bridge
  target="secrets/bridge/{{identity}}-age-key.enc"

  echo "Extracting age private key from Bitwarden item: {{bw_item}}"
  bw get item "{{bw_item}}" 2>/dev/null \
    | jq -r '.sshKey.privateKey' \
    | ssh-to-age -private-key \
    > "$target"

  echo "Encrypting bridge secret to NixOS machine keys..."
  sops encrypt --input-type binary --output-type binary --in-place "$target"

  echo "Verifying..."
  if [ ! -s "$target" ]; then
    echo "Error: bridge secret is empty" >&2
    exit 1
  fi

  echo "Bridge secret written to: $target"
  echo ""
  echo "Corresponding age public key:"
  bw get item "{{bw_item}}" 2>/dev/null \
    | jq -r '.sshKey.publicKey' \
    | ssh-to-age

# Load SOPS launchd agent for standalone home-manager (darwin only, one-time setup)
[group('sops')]
sops-load-agent:
  #!/usr/bin/env bash
  set -euo pipefail

  if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "⚠️  This command is only needed on macOS (darwin)"
    echo "   Linux uses systemd instead of launchd"
    exit 0
  fi

  PLIST="$HOME/Library/LaunchAgents/org.nix-community.home.sops-nix.plist"

  if [ ! -f "$PLIST" ]; then
    echo "⊘ SOPS plist not found: $PLIST"
    echo "   Run 'just activate' first to create the plist"
    exit 1
  fi

  if launchctl list | grep -q "org.nix-community.home.sops-nix"; then
    echo "✓ SOPS agent already loaded"
    echo "  Secrets directory: ~/.config/sops-nix/secrets/"
    exit 0
  fi

  echo "Loading SOPS launchd agent..."
  launchctl load "$PLIST"

  sleep 1

  if launchctl list | grep -q "org.nix-community.home.sops-nix"; then
    echo "✓ SOPS agent loaded successfully"
    echo "  Secrets directory: ~/.config/sops-nix/secrets/"
    echo ""
    echo "  The agent will:"
    echo "  • Persist across reboots (plist in ~/Library/LaunchAgents)"
    echo "  • Automatically decrypt and deploy secrets"
    echo "  • Create symlinks from module paths to secrets directory"
  else
    echo "⊘ Failed to load SOPS agent"
    exit 1
  fi

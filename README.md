# nix-config

This is my personal [nix](https://nix.dev/reference/nix-manual.html)-config. If
you'd like to experiment with nix in a containerized environment, consider
trying [nixpod](https://github.com/cameronraysmith/nixpod) before attempting to
use something like this repository or one of the credited examples below.

## quick start

### bootstrapping a new machine

Start on a clean macOS or NixOS system:

```bash
# bootstrap nix and essential tools
make bootstrap && exec $SHELL

# verify installation
make verify

# setup secrets (generate age keys for sops-nix)
make setup-user

# activate configuration
nix run . hostname       # admin user (darwin/nixos with integrated home-manager)
nix run . user@hostname  # non-admin user (standalone home-manager, no sudo required)
```

### multi-user architecture

This config supports two user patterns:

1. **admin users** (darwin/nixos): Integrated home-manager configuration
   - Define user in `config.nix` and `configurations/{darwin,nixos}/${hostname}.nix`
   - Activate with `nix run . hostname` (requires sudo for system changes)
   - Full system and home-manager configuration

2. **non-admin users**: Standalone home-manager configuration
   - Define user in `config.nix` and `configurations/home/${user}@${host}.nix`
   - Activate with `nix run . user@hostname` (no sudo required)
   - Home environment only, independent of system config

### example: two machines with shared and unique users

**machine 1: stibnite (darwin)**

```bash
# admin user (crs58) on stibnite
cd /path/to/nix-config

# define user in config.nix
# create configurations/darwin/stibnite.nix with:
#   home-manager.users.crs58 = { ... };

make setup-user  # generate age key
# update .sops.yaml with crs58's age public key

nix run . stibnite  # activate darwin + home-manager for crs58
```

**add non-admin user (runner) on stibnite**

```bash
# runner sets up their environment
make bootstrap && exec $SHELL
make setup-user  # generates ~/.config/sops/age/keys.txt

# admin (crs58) adds runner's configuration
# 1. add runner to config.nix
# 2. create configurations/home/runner@stibnite.nix
# 3. update .sops.yaml with runner's age public key
# 4. run: sops updatekeys secrets/*

# runner activates (no sudo required)
nix run . runner@stibnite
```

**machine 2: blackphos (darwin)**

```bash
# admin user (cameron) on blackphos
# similar process to stibnite/crs58
# create configurations/darwin/blackphos.nix

nix run . blackphos  # activate for cameron

# add runner on blackphos (same user, different machine)
# create configurations/home/runner@blackphos.nix
# runner can have different config than runner@stibnite

nix run . runner@blackphos

# add raquel (unique to blackphos)
# create configurations/home/raquel@blackphos.nix

nix run . raquel@blackphos
```

This demonstrates:
- Multiple admin users across machines (crs58, cameron)
- Same user on multiple machines (runner@stibnite, runner@blackphos)
- Machine-specific users (raquel@blackphos)
- Shared configuration via `modules/home/default.nix`
- Per-user, per-machine customization

### scaling to more machines

1. **add new darwin host:**
   - Create `configurations/darwin/${hostname}.nix`
   - Define admin user with integrated home-manager
   - Activate: `nix run . hostname`

2. **add new nixos host:**
   - Create `configurations/nixos/${hostname}.nix`
   - Define admin user with integrated home-manager
   - Activate: `nix run . hostname`

3. **add non-admin user to any host:**
   - Create `configurations/home/${user}@${host}.nix`
   - User runs `make bootstrap && make setup-user`
   - Admin updates `.sops.yaml` and runs `sops updatekeys`
   - User activates: `nix run . user@hostname`

### secrets management

All secrets use sops-nix with age encryption:

```bash
# verify secrets access
make check-secrets

# create content-addressed encrypted file
just hash-encrypt /path/to/file.txt

# edit existing secret
just edit-secret secrets/encrypted-file.yaml

# validate all secrets decrypt correctly
just validate-secrets
```

See [docs/sops-quick-reference.md](docs/sops-quick-reference.md) for comprehensive secrets workflow.

### documentation

- **architecture design:** [docs/nix-config-architecture-analysis.md](docs/nix-config-architecture-analysis.md)
- **detailed onboarding:** [docs/new-user-host.md](docs/new-user-host.md)
- **secrets workflow:** [docs/sops-quick-reference.md](docs/sops-quick-reference.md)
- **team collaboration:** [docs/sops-team-onboarding.md](docs/sops-team-onboarding.md)

<details>
<summary>organization</summary>

The configuration is structured using
[hercules-ci/flake-parts](https://github.com/hercules-ci/flake-parts)
based on [srid/nixos-unified](https://github.com/srid/nixos-unified).

Directory tree:
- `configurations/`: System-specific configurations
- `modules/`: Reusable nix modules
- `overlays/`: Package modifications
- `packages/`: Custom package definitions
- `secrets/`: Protected configuration data

This enables supporting shared configuration:

- Universal home-manager configurations for multiple users
- MacOS configurations via nix-darwin
- NixOS configurations for both local and remote VMs

```zsh
❯ om show .

 Packages (nix build .#<name>)
╭──────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────╮
│ name                 │ description                                                                                               │
├──────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ activate             │ Activate NixOS/nix-darwin/home-manager configurations                                                     │
│ starship-jj          │ starship plugin for jj                                                                                    │
│ markdown-tree-parser │ A powerful JavaScript library and CLI tool for parsing and manipulating markdown files as tree structures │
│ update               │ Update the primary flake inputs                                                                           │
│ holos                │ Holos CLI tool                                                                                            │
│ default              │ Activate NixOS/nix-darwin/home-manager configurations                                                     │
│ cc-statusline-rs     │ Claude Code statusline implementation in Rust                                                             │
│ quarto               │ Open-source scientific and technical publishing system built on Pandoc                                    │
│ teller               │ Cloud native secrets management for developers                                                            │
│ claude-code-bin      │ Agentic coding tool that lives in your terminal, understands your codebase, and helps you code faster     │
╰──────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────╯

🐚 Devshells (nix develop .#<name>)
╭─────────┬────────────────────────────────╮
│ name    │ description                    │
├─────────┼────────────────────────────────┤
│ default │ Dev environment for nix-config │
╰─────────┴────────────────────────────────╯

🔍 Checks (nix flake check)
╭────────────┬─────────────╮
│ name       │ description │
├────────────┼─────────────┤
│ pre-commit │ N/A         │
╰────────────┴─────────────╯

🐧 NixOS Configurations (nixos-rebuild switch --flake .#<name>)
╭─────────────────┬─────────────╮
│ name            │ description │
├─────────────────┼─────────────┤
│ stibnite-nixos  │ N/A         │
│ blackphos-nixos │ N/A         │
│ orb-nixos       │ N/A         │
╰─────────────────┴─────────────╯

🍏 Darwin Configurations (darwin-rebuild switch --flake .#<name>)
╭────────────────┬─────────────╮
│ name           │ description │
├────────────────┼─────────────┤
│ blackphos      │ N/A         │
│ macbook-darwin │ N/A         │
│ stibnite       │ N/A         │
╰────────────────┴─────────────╯

🔧 NixOS Modules
╭─────────┬─────────────╮
│ name    │ description │
├─────────┼─────────────┤
│ common  │ N/A         │
│ default │ N/A         │
╰─────────┴─────────────╯

🎨 Overlays
╭─────────┬─────────────╮
│ name    │ description │
├─────────┼─────────────┤
│ default │ N/A         │
╰─────────┴─────────────╯
```

</details>

## developing

Run `direnv allow` or `nix develop` and then `just` for a table of commands.

<details>
<summary>commands</summary>

```zsh
❯ just

Run 'just -n <command>' to print what would be executed...

Available recipes:
    default                                        # Run 'just <command>' to execute a command.
    help                                           # Display help

    [nix]
    activate target=""                             # Activate the appropriate configuration for current user and host
    io                                             # Print nix flake inputs and outputs
    lint                                           # Lint nix files
    dev                                            # Manually enter dev shell
    clean                                          # Remove build output link (no garbage collection)
    build profile                                  # Build nix flake
    check                                          # Check nix flake
    switch                                         # Run nix flake to execute `nix run .#activate` for the current host.
    switch-home                                    # Run nix flake to execute `nix run .#activate-home` for the current user.
    switch-wrapper                                 # Run nix flake with explicit use of the sudo in `/run/wrappers`
    bootstrap-shell                                # Shell with bootstrap dependencies
    update                                         # Update nix flake
    update-primary-inputs                          # Update primary nix flake inputs (see flake.nix)
    update-package package="claude-code-bin"       # Update a package using its updateScript

    [nix-home-manager]
    home-manager-bootstrap-build profile="aarch64-linux" # Bootstrap build home-manager with flake
    home-manager-bootstrap-switch profile="aarch64-linux" # Bootstrap switch home-manager with flake
    home-manager-build profile="aarch64-linux"     # Build home-manager with flake
    home-manager-switch profile="aarch64-linux"    # Switch home-manager with flake

    [nix-darwin]
    darwin-bootstrap profile="aarch64"             # Bootstrap nix-darwin with flake
    darwin-build profile="aarch64"                 # Build darwin from flake
    darwin-switch profile="aarch64"                # Switch darwin from flake
    darwin-test profile="aarch64"                  # Test darwin from flake

    [nixos]
    nixos-bootstrap destination username publickey # Bootstrap nixos
    nixos-vm-sync user destination                 # Copy flake to VM
    nixos-build profile="aarch64"                  # Build nixos from flake
    nixos-test profile="aarch64"                   # Test nixos from flake
    nixos-switch profile="aarch64"                 # Switch nixos from flake

    [secrets]
    show                                           # Show existing secrets using sops
    create-secret name                             # Create a secret with the given name
    populate-single-secret name path               # Populate a single secret with the contents of a dotenv-formatted file
    populate-separate-secrets path                 # Populate each line of a dotenv-formatted file as a separate secret
    create-and-populate-single-secret name path    # Complete process: Create a secret and populate it with the entire contents of a dotenv file
    create-and-populate-separate-secrets path      # Complete process: Create and populate separate secrets for each line in the dotenv file
    get-secret name                                # Retrieve the contents of a given secret
    seed-dotenv                                    # Create empty dotenv from template
    export                                         # Export unique secrets to dotenv format using sops
    check-secrets                                  # Check secrets are available in sops environment.
    get-kubeconfig                                 # Save KUBECONFIG to file (using sops - requires KUBECONFIG secret to be added)
    hash-encrypt source_file user="crs58"          # Hash-encrypt a file: copy to secrets directory with content-based name and encrypt with sops
    verify-hash original_file secret_file          # Verify hash integrity: decrypt secret file and compare hash with original file
    edit-secret file                               # Edit a sops encrypted file
    new-secret file                                # Create a new sops encrypted file
    get-shared-secret key                          # Show specific secret value from shared secrets
    run-with-secrets +command                      # Run command with all shared secrets as environment variables
    validate-secrets                               # Validate all sops encrypted files can be decrypted

    [CI/CD]
    test-ci-blocking workflow="ci.yaml"            # Trigger CI workflow and wait for result (blocking)
    ci-status workflow="ci.yaml"                   # View latest CI run status and details
    ci-logs workflow="ci.yaml"                     # View latest CI run logs
    ci-logs-failed workflow="ci.yaml"              # View only failed logs from latest CI run
    ci-show-outputs system=""                      # List categorized flake outputs using nix eval
    ci-build-local category="" system=""           # Build all flake outputs locally with nom (inefficient manual version of om ci for debugging builds)
    ci-validate workflow="ci.yaml" run_id=""       # Validate latest CI run comprehensively
    ci-debug-job workflow="ci.yaml" job_name="nix (aarch64-darwin)" # Debug specific failed job from latest CI run
    ghsecrets repo="cameronraysmith/nix-config"    # Update github secrets for repo from environment variables
    list-workflows                                 # List available workflows and associated jobs.
    test-flake-workflow                            # Execute ci.yaml workflow locally via act.
    ratchet-pin                                    # Pin all workflow versions to hash values (requires Docker)
    ratchet-unpin                                  # Unpin hashed workflow versions to semantic values (requires Docker)
    ratchet-update                                 # Update GitHub Actions workflows to the latest version (requires Docker)
    test-cachix                                    # Test cachix push/pull with a simple derivation

...by running 'just <command>'.
This message is printed by 'just help' and just 'just'.
```

</details>

## credits

### flake-parts

- [hercules-ci/flake-parts](https://github.com/hercules-ci/flake-parts)
- [srid/nixos-unified](https://github.com/srid/nixos-unified)
- [srid/nixos-config](https://github.com/srid/nixos-config)
- [mirkolenz/nixos](https://github.com/mirkolenz/nixos)
- [ehllie/dotfiles](https://github.com/ehllie/dotfiles)

### other

- [NickCao/flakes](https://github.com/NickCao/flakes)
- [EmergentMind/nix-config](https://github.com/EmergentMind/nix-config)
- [wegank/nixos-config](https://github.com/wegank/nixos-config)
- [MatthiasBenaets/nixos-config](https://github.com/MatthiasBenaets/nixos-config)
- [Misterio77/nix-config](https://github.com/Misterio77/nix-config)

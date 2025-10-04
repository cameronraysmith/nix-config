# nix-config

This is my personal [nix](https://nix.dev/reference/nix-manual.html)-config. If
you'd like to experiment with nix in a containerized environment, consider
trying [nixpod](https://github.com/cameronraysmith/nixpod) before attempting to
use something like this repository or one of the credited examples below.

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

## usage

<details>
<summary>bootstrapping a new machine</summary>

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

**What this does:**
- `make bootstrap`: Installs nix and direnv using Determinate Systems installer
- `make verify`: Checks nix installation, flakes support, and flake validity
- `make setup-user`: Generates age key at `~/.config/sops/age/keys.txt` for secrets
- Activation: Applies system and/or home-manager configuration

</details>

<details>
<summary>multi-user architecture</summary>

This config supports two user patterns:

**1. admin users** (darwin/nixos): Integrated home-manager configuration
- Define user in `config.nix` and `configurations/{darwin,nixos}/${hostname}.nix`
- Activate with `nix run . hostname` (requires sudo for system changes)
- Full system and home-manager configuration
- One admin per host

**2. non-admin users**: Standalone home-manager configuration
- Define user in `config.nix` and `configurations/home/${user}@${host}.nix`
- Activate with `nix run . user@hostname` (no sudo required)
- Home environment only, independent of system config
- Multiple users per host supported

**Directory structure:**
```
configurations/
├── darwin/          # darwin system configs (admin users)
│   ├── stibnite.nix
│   └── blackphos.nix
├── nixos/           # nixos system configs (admin users)
│   └── orb-nixos.nix
└── home/            # standalone home-manager (non-admin users)
    ├── runner@stibnite.nix
    └── raquel@blackphos.nix
```

</details>

<details>
<summary>adding a new host</summary>

**Step 1: Get host SSH key and convert to age**

On the new host:
```bash
# if host doesn't have ssh key, generate one
sudo ssh-keygen -t ed25519 -f /etc/ssh/ssh_host_ed25519_key -N ""

# convert to age public key
sudo cat /etc/ssh/ssh_host_ed25519_key.pub | ssh-to-age
# Output: age18rgyca7ptr6djqn5h7rhgu4yuv9258v5wflg7tefgvxr06nz7cgsw7qgmy
```

**Step 2: Add host key to `.sops.yaml`**

```yaml
keys:
  # existing keys...
  - &newhostname age18rgyca7ptr6djqn5h7rhgu4yuv9258v5wflg7tefgvxr06nz7cgsw7qgmy

creation_rules:
  - path_regex: hosts/newhostname/.*\.yaml$
    key_groups:
      - age:
        - *admin
        - *crs58  # or appropriate admin user
        - *newhostname
```

**Step 3: Create host configuration**

Darwin: `configurations/darwin/${hostname}.nix`
NixOS: `configurations/nixos/${hostname}.nix`

See [docs/new-user-host.md](docs/new-user-host.md) for complete examples.

**Step 4: Reencrypt secrets and activate**

```bash
# reencrypt secrets for new host
sops updatekeys secrets/shared.yaml

# activate configuration
nix run . hostname
```

</details>

<details>
<summary>adding a new user</summary>

**Step 1: User generates age key**

On the user's machine:
```bash
make bootstrap && exec $SHELL  # if nix not installed
make setup-user                 # generates ~/.config/sops/age/keys.txt

# display public key to send to admin
grep "public key:" ~/.config/sops/age/keys.txt
```

**Important:** Use `age-keygen` for user keys (not `ssh-to-age` from SSH keys).
SSH keys (in Bitwarden) are for authentication; age keys are for secrets encryption.

**Step 2: Admin adds user to config**

1. Add user to `config.nix`:
```nix
newuser = {
  username = "newuser";
  fullname = "New User";
  email = "newuser@example.com";
  sshKey = "ssh-ed25519 AAAAC3Nza...";
  isAdmin = false;
};
```

2. Create `configurations/home/newuser@${host}.nix`

3. Update `.sops.yaml` with user's age public key

4. Reencrypt secrets:
```bash
sops updatekeys secrets/shared.yaml
# repeat for any secrets the user needs access to
```

**Step 3: User activates**

```bash
nix run . newuser@hostname  # no sudo required
```

</details>

<details>
<summary>secrets management</summary>

All secrets use sops-nix with age encryption.

**Key generation:**
- **Users**: `age-keygen -o ~/.config/sops/age/keys.txt` (via `make setup-user`)
- **Hosts**: `ssh-to-age < /etc/ssh/ssh_host_ed25519_key.pub`

**Daily operations:**
```bash
# verify secrets access
make check-secrets

# create content-addressed encrypted file
just hash-encrypt /path/to/file.txt

# edit existing secret
just edit-secret secrets/encrypted-file.yaml

# validate all secrets decrypt correctly
just validate-secrets

# reencrypt secrets after adding new keys to .sops.yaml
sops updatekeys secrets/shared.yaml
```

**See also:**
- [docs/sops-quick-reference.md](docs/sops-quick-reference.md) - Commands and troubleshooting
- [docs/sops-team-onboarding.md](docs/sops-team-onboarding.md) - Team collaboration workflow
- [docs/new-user-host.md](docs/new-user-host.md) - Comprehensive onboarding guide

</details>

<details>
<summary>example: multi-machine multi-user setup</summary>

**machine 1: stibnite (darwin, admin: crs58)**

```bash
cd /path/to/nix-config
make bootstrap && exec $SHELL
make setup-user  # generate age key
# send public age key to repo admin

# admin creates:
# - config.nix entry for crs58
# - configurations/darwin/stibnite.nix
# - updates .sops.yaml with crs58's age key and host key

nix run . stibnite  # activate darwin + home-manager
```

**add non-admin user (runner) on stibnite**

```bash
# runner generates their key
make bootstrap && exec $SHELL
make setup-user
# send public age key to admin

# admin creates:
# - config.nix entry for runner
# - configurations/home/runner@stibnite.nix
# - updates .sops.yaml with runner's age key
# - runs: sops updatekeys secrets/*

# runner activates (no sudo)
nix run . runner@stibnite
```

**machine 2: blackphos (darwin, admin: cameron)**

```bash
# similar bootstrap process
# admin creates configurations/darwin/blackphos.nix
nix run . blackphos

# add runner on blackphos (same user, different machine config)
# create configurations/home/runner@blackphos.nix
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

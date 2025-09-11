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

📦 Packages (nix build .#<name>)
╭──────────┬───────────────────────────────────────────────────────╮
│ name     │ description                                           │
├──────────┼───────────────────────────────────────────────────────┤
│ activate │ Activate NixOS/nix-darwin/home-manager configurations │
│ default  │ Activate NixOS/nix-darwin/home-manager configurations │
│ update   │ Update the primary flake inputs                       │
╰──────────┴───────────────────────────────────────────────────────╯

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

🐧 NixOS Configurations 
(nixos-rebuild build --flake .#<name> to test; 
 change `build` --> `switch` or
 nix run .#activate on named host to instantiate)
╭───────────┬─────────────╮
│ name      │ description │
├───────────┼─────────────┤
│ orb-nixos │ N/A         │
╰───────────┴─────────────╯

🍏 Darwin Configurations 
(darwin-rebuild build --flake .#<name> to test; 
 change `build` --> `switch` or
 nix run .#activate on named host to instantiate)
╭────────────────┬─────────────╮
│ name           │ description │
├────────────────┼─────────────┤
│ macbook-darwin │ N/A         │
│ MGB033059      │ N/A         │
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
    ghsecrets repo="cameronraysmith/nix-config"    # Update github secrets for repo from environment variables
    list-workflows                                 # List available workflows and associated jobs.
    test-flake-workflow                            # Execute flake.yaml workflow.
    ratchet-pin                                    # Pin all workflow versions to hash values (requires Docker)
    ratchet-unpin                                  # Unpin hashed workflow versions to semantic values (requires Docker)
    ratchet-update                                 # Update GitHub Actions workflows to the latest version (requires Docker)

...by running 'just <command>'.
This message is printed by 'just help' and just 'just'.
```

</details>

## credits

- [srid/nixos-unified](https://github.com/srid/nixos-unified)
- [srid/nixos-config](https://github.com/srid/nixos-config)
- [mirkolenz/nixos](https://github.com/mirkolenz/nixos)
- [wegank/nixos-config](https://github.com/wegank/nixos-config)
- [MatthiasBenaets/nixos-config](https://github.com/MatthiasBenaets/nixos-config)
- [ehllie/dotfiles](https://github.com/ehllie/dotfiles)
- [Misterio77/nix-config](https://github.com/Misterio77/nix-config)
- [hercules-ci/flake-parts](https://github.com/hercules-ci/flake-parts)

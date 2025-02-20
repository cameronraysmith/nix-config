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


## credits

- [srid/nixos-unified](https://github.com/srid/nixos-unified)
- [srid/nixos-config](https://github.com/srid/nixos-config)
- [mirkolenz/nixos](https://github.com/mirkolenz/nixos)
- [wegank/nixos-config](https://github.com/wegank/nixos-config)
- [MatthiasBenaets/nixos-config](https://github.com/MatthiasBenaets/nixos-config)
- [ehllie/dotfiles](https://github.com/ehllie/dotfiles)
- [Misterio77/nix-config](https://github.com/Misterio77/nix-config)
- [ALT-F4-LLC/dotfiles.nix](https://github.com/ALT-F4-LLC/dotfiles.nix)

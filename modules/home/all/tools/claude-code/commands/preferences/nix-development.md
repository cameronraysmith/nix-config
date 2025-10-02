# Nix development

- Most projects should contain a nix flake in `flake.nix` to provide devshell development environments, package builds, and OCI container image builds
- Verify builds with `nix flake check` and `nix build`

## Flakes and modules
- Use flakes for all nix projects, not channels
- Use hercules-ci/flake-parts to structure flake.nix files modularly where relevant
  - package: nix/modules/{devshell,containers,packages,overrides}.nix
- Use nixos-unified for system configurations and autoWire for module discovery
  - system: modules/{home,darwin,nixos,flake-parts}/

## Best Practices
- Follow nixpkgs naming conventions and style
- Use `inputs.*.follows = "nixpkgs"` to minimize flake input duplication
- Place system-level config in modules/darwin/ or modules/nixos/
- Place user-level config in modules/home/all/ (cross-platform) or darwin-only.nix/linux-only.nix
- Use home-manager.sharedModules for platform-specific home configuration

## Nix Code Style
- Format with `nix fmt`
- Use explicit function arguments, not `with` statements
- Prefer `inherit (x) y z;` over `inherit y z;`
- Use `lib.mkIf`, `lib.mkMerge`, `lib.mkDefault` appropriately

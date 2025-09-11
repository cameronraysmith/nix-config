# Common configuration across NixOS and nix-darwin
{ flake, ... }:
{
  imports = [
    ./shared/caches.nix
    ./shared/nix.nix
    ./shared/primary-as-admin.nix
    ./shared/tailscale.nix
  ];
}

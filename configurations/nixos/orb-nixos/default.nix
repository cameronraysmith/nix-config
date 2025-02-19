{ flake, pkgs, lib, modulesPath, ... }:

let
  inherit (flake) inputs;
  inherit (inputs) self;
in
{
  imports = [
    self.nixosModules.default
    "${modulesPath}/virtualisation/lxc-container.nix"
    ./lxd.nix
    ./orbstack.nix
  ];

  documentation.enable = true;
  documentation.nixos.enable = true;
  # environment.noXlibs = false;
  i18n.defaultLocale = "en_US.UTF-8";
  networking.useDHCP = false;
  networking.interfaces.eth0.useDHCP = true;
  nixpkgs.hostPlatform = "aarch64-linux";
  system.stateVersion = "21.05";
}

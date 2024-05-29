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

  system.stateVersion = "21.05";
  nixpkgs.hostPlatform = "aarch64-linux";
  networking.useDHCP = false;
  networking.interfaces.eth0.useDHCP = true;


  documentation.enable = true;
  documentation.nixos.enable = true;
  environment.noXlibs = false;
}

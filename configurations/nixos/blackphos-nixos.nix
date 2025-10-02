{ flake, pkgs, ... }:

let
  inherit (flake) inputs;
  inherit (inputs) self;
in
{
  imports = [
    self.nixosModules.default
  ];

  nixpkgs.hostPlatform = "x86_64-linux";
  nixpkgs.config.allowUnfree = true;

  # mirror of configurations/darwin/blackphos.nix for CI testing on linux
  # this configuration validates the core nix expressions can evaluate on linux
  # excluded darwin-only features:
  # - custom.homebrew (nix-darwin only)
  # - security.pam.services.sudo_local.touchIdAuth (macOS-specific)
  # - system.stateVersion (nix-darwin versioning)
  # - system.primaryUser (nix-darwin option, not available in nixos)

  # nixos-specific required settings for CI
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  # minimal filesystem for CI validation
  fileSystems."/" = {
    device = "/dev/disk/by-label/nixos";
    fsType = "ext4";
  };

  fileSystems."/boot" = {
    device = "/dev/disk/by-label/boot";
    fsType = "vfat";
  };

  # networking
  networking.hostName = "blackphos-nixos";

  # Used for backwards compatibility, please read the changelog before changing.
  # $ nixos-rebuild changelog
  system.stateVersion = "23.11";
}

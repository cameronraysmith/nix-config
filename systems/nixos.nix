{ flake, pkgs, lib, ... }:

let
  inherit (flake) inputs;
  inherit (inputs) self;
in
{
  imports = [
    inputs.disko.nixosModules.disko
    self.nixosModules.default
    "${self}/nixos/disko/trivial.nix"
    "${self}/nixos/nix.nix"
    "${self}/nixos/self/primary-as-admin.nix"
    "${self}/nixos/docker.nix"
  ];

  system.stateVersion = "23.11";
  networking.hostName = "vm-nixos";
  nixpkgs.hostPlatform = "x86_64-linux";
  boot.loader.grub = {
    devices = [ "/dev/nvme0n1" ];
    efiSupport = true;
    efiInstallAsRemovable = true;
  };
  boot.initrd.availableKernelModules = [ "xhci_pci" "ahci" "nvme" "sd_mod" ];
  hardware.cpu.intel.updateMicrocode = true;
  hardware.enableRedistributableFirmware = true;
  i18n.defaultLocale = "en_US.UTF-8";

  services.openssh.enable = true;

  programs.nix-ld.enable = true; # for vscode server
}

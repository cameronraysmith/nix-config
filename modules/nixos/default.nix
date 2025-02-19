# Configuration common to all Linux systems
{ flake, ... }:

let
  inherit (flake) config inputs;
  inherit (inputs) self;
in
{
  imports = [
    {
      users.users.${config.me.username}.isNormalUser = true;
      home-manager.users.${config.me.username} = { };
      # home-manager.useGlobalPkgs = true;
      # home-manager.useUserPackages = true;
      home-manager.backupFileExtension = "before-home-manager";
      home-manager.sharedModules = [
        self.homeModules.default
        self.homeModules.linux-only
      ];
    }
    self.nixosModules.common
    inputs.agenix.nixosModules.default
    ./linux/current-location.nix
    ./linux/self-ide.nix
  ];

  boot.loader.grub.configurationLimit = 5;
}

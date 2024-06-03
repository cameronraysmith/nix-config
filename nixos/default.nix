{ self, config, ... }:

{
  # Configuration common to all Linux systems
  flake = {
    nixosModules = {
      # NixOS modules that are known to work on nix-darwin.
      common.imports = [
        ./nix.nix
        ./caches
        ./self/primary-as-admin.nix
      ];

      my-home = {
        users.users.${config.people.myself}.isNormalUser = true;
        home-manager.useGlobalPkgs = true;
        home-manager.useUserPackages = true;
        home-manager.backupFileExtension = "before-home-manager";
        home-manager.users.${config.people.myself} = {
          imports = [
            self.homeModules.common-linux
          ];
        };
      };

      default.imports = [
        self.nixosModules.home-manager
        self.nixosModules.my-home
        self.nixosModules.common
        # ./self/self-ide.nix
        ./current-location.nix
      ];
    };
  };
}

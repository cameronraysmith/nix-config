# Configuration common to all macOS systems
{ flake, ... }:
let
  inherit (flake) config inputs;
  inherit (inputs) self;
in
{
  imports = [
    {
      users.users.${flake.config.me.username} = {
        home = "/Users/${flake.config.me.username}";
      };
      home-manager.users.${config.me.username} = { };
      home-manager.backupFileExtension = "before-home-manager";
      home-manager.sharedModules = [
        self.homeModules.default
        self.homeModules.darwin-only
      ];
    }
    self.nixosModules.common
    inputs.agenix.darwinModules.default
    inputs.sops-nix.darwinModules.sops
    ./all/zsh-completion-fix.nix
    ./all/homebrew.nix
  ];
}

{ flake, pkgs, ... }:

let
  inherit (flake) inputs;
  inherit (inputs) self;
in
{
  imports = [
    self.darwinModules.default
  ];

  nixpkgs.hostPlatform = "aarch64-darwin";

  system.primaryUser = flake.config.me.username;

  custom.homebrew = {
    enable = true;
    additionalCasks = [
      # Host-specific GUI apps
      # "cleanshot"
      # "incus"
    ];
    additionalMasApps = {
      # Host-specific Mac App Store apps with IDs
      # pdf-expert = 1055273043;
      # raindrop-io-safari = 1549370672;
    };
  };

  environment.systemPackages = with pkgs; [
    # Globally installed CLI tools
    # Most GUI apps should probably be managed via homebrew module
  ];

  security.pam.services.sudo_local.touchIdAuth = true;

  # Used for backwards compatibility, please read the changelog before changing.
  # $ darwin-rebuild changelog
  system.stateVersion = 4;
}

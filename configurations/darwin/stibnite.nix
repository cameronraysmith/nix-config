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
  nixpkgs.config.allowUnfree = true;

  system.primaryUser = flake.config.me.username;

  custom.homebrew = {
    enable = true;
    additionalCasks = [
      "codelayer-nightly"
      "dbeaver-community"
      "docker-desktop"
      "gpg-suite"
      "inkscape"
      "keycastr"
      "meld"
      "postgres-unofficial"
      "zoom"
    ];
    additionalMasApps = {
      save-to-raindrop-io = 1549370672;
    };
    manageFonts = false;
  };

  security.pam.services.sudo_local.touchIdAuth = true;

  # Used for backwards compatibility, please read the changelog before changing.
  # $ darwin-rebuild changelog
  system.stateVersion = 4;
}

# standalone home-manager configuration for runner on stibnite
{
  flake,
  pkgs,
  lib,
  ...
}:
let
  inherit (flake) config inputs;
  inherit (inputs) self;
  user = config.runner;
in
{
  imports = [
    self.homeModules.default
    self.homeModules.darwin-only
    self.homeModules.standalone
  ];

  home.username = user.username;
  home.homeDirectory = "/Users/${user.username}";
  home.stateVersion = "23.11";

  # runner-specific home-manager configuration
  programs.bash.enable = true; # runner uses bash
  programs.git = {
    userName = lib.mkForce user.fullname;
    userEmail = lib.mkForce user.email;
  };

  # runner might want minimal dev tools
  home.packages = with pkgs; [
    git
    gh
    nixfmt-rfc-style
    just
  ];

  # disable heavy tools that crs58 might have
  programs.lazyvim.enable = lib.mkForce false;
}

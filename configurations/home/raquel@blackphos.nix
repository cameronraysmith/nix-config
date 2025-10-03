# standalone home-manager configuration for raquel on blackphos
{
  flake,
  pkgs,
  lib,
  ...
}:
let
  inherit (flake) config inputs;
  inherit (inputs) self;
  user = config.raquel;
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

  # raquel-specific home-manager configuration
  programs.git = {
    userName = user.fullname;
    userEmail = user.email;
  };

  # raquel's preferred shell setup
  programs.zsh.enable = true;
  programs.starship.enable = lib.mkDefault true;

  # raquel's preferred tools
  home.packages = with pkgs; [
    git
    gh
    just
    ripgrep
    fd
    bat
    eza
  ];

  # disable heavy tools
  programs.lazyvim.enable = lib.mkForce false;
}

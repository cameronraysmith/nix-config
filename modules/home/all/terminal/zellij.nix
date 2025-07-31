{ pkgs, ... }:

{
  programs.zellij = {
    enable = true;
    settings = {
      # https://github.com/nix-community/home-manager/issues/3854
      theme = "catppuccin-mocha";
    };
  };
}

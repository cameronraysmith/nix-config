{ pkgs, ... }:

{
  programs.zellij = {
    enable = false;
    settings = {
      # https://github.com/nix-community/home-manager/issues/3854
    };
  };
}

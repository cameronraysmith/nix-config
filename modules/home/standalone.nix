# augmentation for standalone home-manager configs
# these run without nix-darwin or nixos integration
{ pkgs, lib, ... }:
{
  # standalone HM needs to set these explicitly
  home.sessionVariables = {
    NIX_PATH = "nixpkgs=${pkgs.path}";
  };

  # enable nix-index for standalone users
  programs.nix-index.enable = lib.mkDefault true;

  # standalone users may need explicit XDG paths
  xdg.enable = true;
}

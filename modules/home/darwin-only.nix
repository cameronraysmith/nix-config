# darwin-specific home-manager configuration
# imported by darwin-integrated and darwin-standalone configs
{
  pkgs,
  lib,
  osConfig ? null,
  ...
}:
{
  imports = [
    ./all/shell/zsh.nix
  ];

  # darwin-specific home-manager settings
  programs.zsh.enable = lib.mkDefault true; # darwin default shell

  # darwin-specific packages can go here
  # home.packages = with pkgs; lib.optionals pkgs.stdenv.isDarwin [ ];
}

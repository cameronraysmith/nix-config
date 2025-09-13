{ config, pkgs, ... }:
{
  # Enable XDG base directories for cross-platform compatibility
  xdg.enable = false;
  # xdg.configHome = "${config.home.homeDirectory}/.config";

  # This will set:
  # https://github.com/nix-community/home-manager/blob/master/modules/misc/xdg.nix
  # - Linux: ~/.config, ~/.cache, ~/.local/share, ~/.local/state
  # - macOS: ~/Library/Application Support, ~/Library/Caches, etc.
  # Following the XDG Base Directory Specification
}

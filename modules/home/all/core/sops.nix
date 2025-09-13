{
  config,
  pkgs,
  lib,
  self,
  ...
}:
{
  # Configure sops age key location using XDG paths
  # This provides cross-platform support:
  # - Linux: ~/.config/sops/age/keys.txt
  # - macOS with xdg.enable: ~/.config/sops/age/keys.txt
  # - macOS without xdg: ~/Library/Application Support/sops/age/keys.txt
  sops.age.keyFile = "${config.xdg.configHome}/sops/age/keys.txt";

  # Set the default sops file location
  sops.defaultSopsFile = "${self}/secrets/shared.yaml";
}

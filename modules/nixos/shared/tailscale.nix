# Tailscale configuration for both NixOS and Darwin
{
  flake,
  pkgs,
  lib,
  ...
}:

let
  inherit (flake) config;
  isDarwin = pkgs.stdenv.isDarwin;
  isLinux = pkgs.stdenv.isLinux;
in
{
  services.tailscale = {
    enable = true;

    # Platform-specific configurations
  }
  // lib.optionalAttrs isLinux {
    # NixOS-specific options
    extraSetFlags = [
      # "--advertise-exit-node"  # Uncomment to advertise as exit node
    ];
    # useRoutingFeatures = "server";  # Enable for exit node functionality
  }
  // lib.optionalAttrs isDarwin {
    # Darwin-specific options
    # overrideLocalDns = false;  # Set to true if you want Tailscale to handle DNS
  };
}

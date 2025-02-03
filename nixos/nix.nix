{ flake, pkgs, lib, ... }:

{
  nixpkgs = {
    config = {
      allowBroken = true;
      allowUnsupportedSystem = true;
      allowUnfree = true;
    };
    overlays = [
      (import ../packages/overlay.nix { inherit flake; inherit (pkgs) system; })
    ];
  };

  nix = {
    nixPath = [ "nixpkgs=${flake.inputs.nixpkgs}" ]; # Enables use of `nix-shell -p ...` etc
    registry.nixpkgs.flake = flake.inputs.nixpkgs; # Make `nix shell` etc use pinned nixpkgs
    settings = {
      auto-optimise-store = false;
      experimental-features = "nix-command flakes auto-allocate-uids";
      extra-platforms = lib.mkIf pkgs.stdenv.isDarwin "aarch64-darwin x86_64-darwin";
      flake-registry = builtins.toFile "empty-flake-registry.json" ''{"flakes":[],"version":2}'';
      max-jobs = "auto";
      trusted-users = [ "root" (if pkgs.stdenv.isDarwin then flake.config.people.myself else "@wheel") ];
    };
  };
}

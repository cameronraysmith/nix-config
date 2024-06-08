{ flake, pkgs, lib, ... }:

{
  nix = {
    package = lib.mkDefault (pkgs.nix);
    registry.nixpkgs.flake = flake.inputs.nixpkgs; # Make `nix shell` etc use pinned nixpkgs
    settings = {
      build-users-group = lib.mkDefault "nixbld";
      experimental-features = "nix-command flakes repl-flake auto-allocate-uids";
      extra-platforms = lib.mkIf pkgs.stdenv.isDarwin "aarch64-darwin x86_64-darwin";
      extra-nix-path = lib.mkDefault "nixpkgs=flake:nixpkgs";
      flake-registry = builtins.toFile "empty-flake-registry.json" ''{"flakes":[],"version":2}'';
      max-jobs = "auto";
      trusted-users = [ "root" (if pkgs.stdenv.isDarwin then flake.config.people.myself else "@wheel") ];
    };
  };
}

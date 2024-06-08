{ flake, pkgs, lib, ... }:

{
  nix = {
    package = lib.mkDefault (pkgs.nix);
    registry.nixpkgs.flake = flake.inputs.nixpkgs; # Make `nix shell` etc use pinned nixpkgs
    settings = {
      max-jobs = "auto";
      experimental-features = "nix-command flakes repl-flake auto-allocate-uids";
      extra-platforms = lib.mkIf pkgs.stdenv.isDarwin "aarch64-darwin x86_64-darwin";
      flake-registry = builtins.toFile "empty-flake-registry.json" ''{"flakes":[],"version":2}'';
      trusted-users = [ "root" (if pkgs.stdenv.isDarwin then flake.config.people.myself else "@wheel") ];
    };
  };
}

{
  # NOTE: nixpkgs.config is removed because nixos-unified sets
  # home-manager.useGlobalPkgs = true,
  # so home-manager uses the system's nixpkgs configuration instead.
  # The system already has allowUnfree = true in flake.nix:58
  #
  # nixpkgs = {
  #   config = {
  #     allowUnfree = true;
  #   };
  # };
}

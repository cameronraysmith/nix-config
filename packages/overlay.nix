{ flake, system, ... }:

self: super: {
  nixci = flake.inputs.nixci.packages.${system}.default;
  # teller = self.callPackage ./teller.nix { };
}

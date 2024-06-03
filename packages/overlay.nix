{ flake, system, ... }:

self: super: {
  nixci = flake.inputs.nixci.packages.${system}.default;
  quarto = self.callPackage ./quarto.nix { };
  # teller = self.callPackage ./teller.nix { };
}

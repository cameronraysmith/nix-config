{ flake, system, ... }:

self: super: {
  # conda-lock = self.callPackage ./conda-lock.nix { };
  nixci = flake.inputs.nixci.packages.${system}.default;
  quarto = self.callPackage ./quarto.nix { };
  # teller = self.callPackage ./teller.nix { };
}

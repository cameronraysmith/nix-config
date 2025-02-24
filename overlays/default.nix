{ flake, ... }:

let
  inherit (flake) inputs;
  inherit (inputs) self;
  packages = self + /packages;
in
self: super: {
  # conda-lock = self.callPackage "${packages}/conda-lock.nix" { };
  # teller = self.callPackage "${packages}/teller.nix" { };
  omnix = inputs.omnix.packages.${self.system}.default;
  quarto = self.callPackage "${packages}/quarto.nix" { };
  holos = self.callPackage "${packages}/holos.nix" { };
}

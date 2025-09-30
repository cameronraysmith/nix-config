{ flake, ... }:

let
  inherit (flake) inputs;
  inherit (inputs) self;
  packages = self + /packages;
in
self: super: {
  # conda-lock = self.callPackage "${packages}/conda-lock.nix" { };
  # holos = self.callPackage "${packages}/holos.nix" { };
  claude-code-bin = self.callPackage "${packages}/claude-code-bin.nix" { };
  markdown-tree-parser = self.callPackage "${packages}/markdown-tree-parser.nix" { };
  omnix = inputs.omnix.packages.${self.system}.default;
  # quarto = self.callPackage "${packages}/quarto.nix" { };
  # star = self.callPackage "${packages}/star.nix" { };
  starship-jj = self.callPackage "${packages}/starship-jj.nix" { };
  # teller = self.callPackage "${packages}/teller.nix" { };
}

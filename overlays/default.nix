{ flake, ... }:

let
  inherit (flake) inputs;
  inherit (inputs) self;
  packages = self + /packages;
in
self: super: {
  # conda-lock = self.callPackage "${packages}/conda-lock.nix" { };
  # holos = self.callPackage "${packages}/holos.nix" { };
  markdown-tree-parser = self.callPackage "${packages}/markdown-tree-parser.nix" { };
  omnix = inputs.omnix.packages.${self.system}.default;
  # quarto = self.callPackage "${packages}/quarto.nix" { };
  # star = self.callPackage "${packages}/star.nix" { };
  starship-jj = self.callPackage "${packages}/starship-jj.nix" { };
  # teller = self.callPackage "${packages}/teller.nix" { };

  # Temporary fix for LazyVim catppuccin integration issue
  # https://github.com/LazyVim/LazyVim/issues/6355
  # Remove once LazyVim PR#6354 is merged and available in nixpkgs
  vimPlugins = super.vimPlugins // {
    LazyVim = super.vimPlugins.LazyVim.overrideAttrs (oldAttrs: {
      postPatch = (oldAttrs.postPatch or "") + ''
        # Fix catppuccin bufferline integration - replace get() with get_theme()
        substituteInPlace lua/lazyvim/plugins/colorscheme.lua \
          --replace-fail 'require("catppuccin.groups.integrations.bufferline").get()' \
                         'require("catppuccin.groups.integrations.bufferline").get_theme()'
      '';
    });
  };
}

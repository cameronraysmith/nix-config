{ self, inputs, ... }:
{
  flake = {
    homeModules = {
      common = {
        # See https://home-manager-options.extranix.com/ for home-manager
        # options used inside these imported modules.
        home.stateVersion = "23.11";
        imports = [
          inputs.catppuccin.homeManagerModules.catppuccin
          inputs.nixvim.homeManagerModules.nixvim
          inputs.nix-index-database.hmModules.nix-index
          ./atuin.nix
          ./awscli.nix
          ./bash.nix
          ./bat.nix
          ./git.nix
          ./helix.nix
          ./k9s.nix
          ./nix.nix
          ../nixos/caches
          ./nixpkgs.nix
          ./nixvim.nix
          ./pandoc.nix
          ./poetry.nix
          ./starship.nix
          ./terminal.nix
          ./texlive.nix
          ./zellij.nix
          ./zsh.nix
        ];
      };
      common-linux = {
        imports = [
          self.homeModules.common
        ];
      };
      common-darwin = {
        imports = [
          self.homeModules.common
        ];
      };
    };
  };
}

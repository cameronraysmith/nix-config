{ flake, ... }:

let
  inherit (flake) inputs;
in
{
  imports = [
    # Core home-manager modules from flake inputs
    inputs.catppuccin.homeModules.catppuccin
    inputs.lazyvim.homeManagerModules.default
    inputs.nixvim.homeModules.nixvim
    inputs.nix-index-database.homeModules.nix-index
    inputs.sops-nix.homeManagerModules.sops

    # Our local modules
    ./all/development
    ./all/terminal
    ./all/tools
    ./all/shell/nushell
  ];

  home.stateVersion = "23.11";
}

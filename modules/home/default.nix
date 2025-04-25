{ flake, ... }:

let
  inherit (flake) inputs;
in
{
  imports = [
    # Core home-manager modules from flake inputs
    inputs.catppuccin.homeModules.catppuccin
    inputs.lazyvim.homeManagerModules.default
    inputs.nixvim.homeManagerModules.nixvim
    inputs.nix-index-database.hmModules.nix-index

    # Our local modules
    ./all/development
    ./all/terminal
    ./all/tools
    ./all/shell/nushell
  ];

  home.stateVersion = "23.11";
}

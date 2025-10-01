{ flake, lib, ... }:

let
  inherit (flake) inputs;

  # get mdFormat type for agents-md module
  lib' = {
    self = import "${inputs.mirkolenz-nixos}/lib" lib;
  };
in
{
  # pass lib' to submodules to be used by agents-md
  _module.args = { inherit lib'; };

  imports = [
    # core home-manager modules from flake inputs
    inputs.catppuccin.homeModules.catppuccin
    inputs.lazyvim.homeManagerModules.default
    # inputs.nixvim.homeModules.nixvim  # defer to LazyVim-module
    inputs.nix-index-database.homeModules.nix-index
    inputs.sops-nix.homeManagerModules.sops

    # mirkolenz agents-md module for config propagation
    "${inputs.mirkolenz-nixos}/home/options/agents-md.nix"

    # local modules
    ./all/core
    ./all/development
    ./all/terminal
    ./all/tools
    ./all/shell/nushell
  ];

  home.stateVersion = "23.11";
}

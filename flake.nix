{
  description = "Nix configuration";

  inputs = {
    systems.url = "github:nix-systems/default";
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    home-manager.url = "github:nix-community/home-manager";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";
    nix-darwin.url = "github:LnL7/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
    nixos-unified.url = "github:srid/nixos-unified";
    omnix.url = "github:juspay/omnix";
    # TODO: error: darwin.apple_sdk_11_0 has been removed
    # <https://nixos.org/manual/nixpkgs/stable/#sec-darwin-legacy-frameworks>
    # omnix.inputs.nixpkgs.follows = "nixpkgs";
    # omnix.inputs.flake-parts.follows = "flake-parts";
    # omnix.inputs.git-hooks.follows = "git-hooks";
    omnix.inputs.systems.follows = "systems";

    agenix.url = "github:ryantm/agenix";
    agenix.inputs.nixpkgs.follows = "nixpkgs";
    agenix.inputs.home-manager.follows = "home-manager";
    agenix.inputs.systems.follows = "systems";
    sops-nix.url = "github:mic92/sops-nix";
    sops-nix.inputs.nixpkgs.follows = "nixpkgs";

    nix-index-database.url = "github:nix-community/nix-index-database";
    nix-index-database.inputs.nixpkgs.follows = "nixpkgs";

    lazyvim.url = "github:cameronraysmith/LazyVim-module/35-venv";
    lazyvim.inputs.nixpkgs.follows = "nixpkgs";
    lazyvim.inputs.systems.follows = "systems";
    catppuccin.url = "github:catppuccin/nix";
    catppuccin.inputs.nixpkgs.follows = "nixpkgs";

    # mirkolenz's nixos config for agents-md module
    mirkolenz-nixos.url = "github:mirkolenz/nixos";
    mirkolenz-nixos.inputs.nixpkgs.follows = "nixpkgs";
    mirkolenz-nixos.inputs.flake-parts.follows = "flake-parts";
    mirkolenz-nixos.inputs.home-manager.follows = "home-manager";
    mirkolenz-nixos.inputs.nix-darwin.follows = "nix-darwin";
    mirkolenz-nixos.inputs.nix-index-database.follows = "nix-index-database";
    mirkolenz-nixos.inputs.systems.follows = "systems";

    git-hooks.url = "github:cachix/git-hooks.nix";
    git-hooks.flake = false;
    nuenv.url = "github:hallettj/nuenv/writeShellApplication";
    nuenv.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    inputs@{ self, ... }:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      systems = builtins.filter (s: builtins.elem s (import inputs.systems)) [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      imports =
        with builtins;
        map (fn: ./modules/flake-parts/${fn}) (attrNames (readDir ./modules/flake-parts));

      perSystem =
        { lib, system, ... }:
        {
          _module.args.pkgs = import inputs.nixpkgs {
            inherit system;
            overlays = lib.attrValues self.overlays;
            config.allowUnfree = true;
          };
        };

      flake.om.ci.default.ROOT = {
        dir = ".";
        steps.flake-check.enable = false;
        steps.custom = { };
      };
    };
}

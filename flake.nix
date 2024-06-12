{
  description = "Nix configuration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    nixos-flake.url = "github:srid/nixos-flake";

    home-manager = {
      url = "github:nix-community/home-manager";
      inputs = {
        nixpkgs.follows = "nixpkgs";
      };
    };
    nix-darwin = {
      url = "github:LnL7/nix-darwin";
      inputs = {
        nixpkgs.follows = "nixpkgs";
      };
    };

    disko = {
      url = "github:nix-community/disko";
      inputs = {
        nixpkgs.follows = "nixpkgs";
      };
    };
    systems.url = "github:nix-systems/default";

    nixci = {
      url = "github:srid/nixci";
      inputs = {
        flake-parts.follows = "flake-parts";
        systems.follows = "systems";
      };
    };
    nix-index-database = {
      url = "github:nix-community/nix-index-database";
      inputs = {
        nixpkgs.follows = "nixpkgs";
      };
    };
    nixvim = {
      url = "github:nix-community/nixvim";
      inputs = {
        flake-parts.follows = "flake-parts";
        home-manager.follows = "home-manager";
        nix-darwin.follows = "nix-darwin";
        nixpkgs.follows = "nixpkgs";
        treefmt-nix.follows = "treefmt-nix";
      };
    };
    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs = {
        nixpkgs.follows = "nixpkgs";
      };
    };
    catppuccin.url = "github:catppuccin/nix";
  };

  outputs =
    inputs @ { self
    , ...
    }:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      systems = import inputs.systems;
      imports = [
        inputs.treefmt-nix.flakeModule
        inputs.nixos-flake.flakeModule
        ./users
        ./home
        ./nixos
        ./nix-darwin
      ];

      flake = {
        darwinConfigurations.macbook-darwin =
          self.nixos-flake.lib.mkMacosSystem
            ./systems/darwin.nix;

        nixosConfigurations.vm-nixos =
          self.nixos-flake.lib.mkLinuxSystem
            ./systems/nixos.nix;

        nixosConfigurations.orb-nixos =
          self.nixos-flake.lib.mkLinuxSystem
            ./systems/orb;
      };

      perSystem = { self', pkgs, system, config, ... }:
        let
          users = [ "crs58" "jovyan" "runner" ];
        in
        {
          legacyPackages.homeConfigurations = builtins.listToAttrs (map
            (user: {
              name = user;
              value = self.nixos-flake.lib.mkHomeConfiguration
                pkgs
                ({ pkgs, ... }: {
                  imports = [ self.homeModules.common ];
                  home.username = user;
                  home.homeDirectory =
                    if user == "root"
                    then "/root"
                    else "/${
                    if pkgs.stdenv.isDarwin
                    then "Users"
                    else "home"
                    }/${user}";
                });
            })
            users);

          devShells = {
            default = pkgs.mkShell {
              inputsFrom = [ config.treefmt.build.devShell ];
              packages = with pkgs; [
                act
                just
                nixd
                ratchet
                teller
              ];
            };
          };
          _module.args.pkgs = import inputs.nixpkgs {
            inherit system;
            overlays = [
              (import ./packages/overlay.nix { inherit system; flake = { inherit inputs; }; })
            ];
          };

          packages = {
            default = self'.packages.activate;
          };

          treefmt.config = {
            projectRootFile = "flake.nix";
            programs.nixpkgs-fmt.enable = true;
          };
          formatter = config.treefmt.build.wrapper;

        };
    };
}

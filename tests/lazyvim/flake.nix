{
  description = "LazyVim test configuration";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    lazyvim.url = "github:cameronraysmith/LazyVim-module/dev";
    lazyvim.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = inputs @ { flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];

      perSystem = { config, pkgs, system, ... }:
        let
          homeBase = if pkgs.stdenv.isDarwin then "/Users" else "/home";
          username = "test";

          # Set temporary directory as the test user's fake home
          testHome = "/tmp/home-manager-test/${username}";

          hmConfig = inputs.home-manager.lib.homeManagerConfiguration {
            inherit pkgs;
            modules = [
              ./home.nix
              {
                home = {
                  inherit username;
                  homeDirectory = testHome;
                  stateVersion = "23.11";
                };
              }
            ];
            extraSpecialArgs = {
              inherit inputs homeBase;
            };
          };
        in
        {
          # Make the configuration available as a package
          packages.test-config = hmConfig.activationPackage;

          devShells.default = pkgs.mkShell {
            name = "lazyvim-test-shell";
            packages = with pkgs; [
              home-manager
            ];
            shellHook = ''
              # Create isolated environment using /tmp
              export TEMP_HOME="${testHome}"
              export HOME="$TEMP_HOME"
              export USER="${username}"
              export XDG_CONFIG_HOME="$HOME/.config"
              export XDG_DATA_HOME="$HOME/.local/share"
              export XDG_STATE_HOME="$HOME/.local/state"
              export XDG_CACHE_HOME="$HOME/.cache"
              
              # Create required directories
              mkdir -p $TEMP_HOME
              mkdir -p $XDG_CONFIG_HOME
              mkdir -p $XDG_DATA_HOME
              mkdir -p $XDG_STATE_HOME
              mkdir -p $XDG_CACHE_HOME
              
              # Build and activate the configuration
              echo "Building and activating home-manager configuration..."
              ${config.packages.test-config}/activate
              
              echo "Test environment ready at $TEMP_HOME"
              echo "Run 'nvim' to test LazyVim"
              
              # Cleanup on exit
              cleanup() {
                echo "Cleaning up temporary home directory..."
                rm -rf "$TEMP_HOME"
              }
              trap cleanup EXIT
            '';
          };
        };
    };
}

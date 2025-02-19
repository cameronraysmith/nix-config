{ inputs, ... }:
{
  imports = [
    (inputs.git-hooks + /flake-module.nix)
  ];
  perSystem = { inputs', config, pkgs, ... }: {
    devShells.default = pkgs.mkShell {
      name = "nix-config-shell";
      meta.description = "Dev environment for nix-config";
      inputsFrom = [ config.pre-commit.devShell ];
      packages = with pkgs; [
        just
        nixd
        nix-output-monitor
        omnix
        ratchet
        teller
        inputs'.agenix.packages.default
      ];
    };

    pre-commit.settings = {
      hooks.nixpkgs-fmt.enable = true;
    };
  };
} 

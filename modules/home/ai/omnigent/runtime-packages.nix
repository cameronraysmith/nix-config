{ inputs, lib, ... }:
{
  flake.lib.omnigentRuntimePackages =
    pkgs:
    let
      system = pkgs.stdenv.hostPlatform.system;
    in
    [
      inputs.self.packages.${system}.claude-code
      inputs.self.packages.${system}.atomic
      inputs.llm-agents.packages.${system}.codex
      inputs.llm-agents.packages.${system}.pi
      inputs.llm-agents.packages.${system}.omp
      pkgs.bun
      pkgs.nodejs_22
      pkgs.python3
      pkgs.tmux
      pkgs.git
      pkgs.uv
      pkgs.bash
      pkgs.which
      pkgs.direnv
      pkgs.nix
    ]
    ++ lib.optionals pkgs.stdenv.hostPlatform.isLinux [ pkgs.bubblewrap ];
}

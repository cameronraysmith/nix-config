{
  programs.bash = {
    enable = true;
    initExtra = ''
      # Ensure all nix and home-manager installed files are available in PATH.
      # export PROTO_HOME="$HOME/.proto"
      # export PATH="$PROTO_HOME/shims:$PROTO_HOME/bin:$PATH"
      export PATH="/run/wrappers/bin:/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin:$PATH"
      export PATH="$PATH:$HOME/.nix-profile/bin:/etc/profiles/per-user/$USER/bin"
      export PATH="$PATH:$HOME/.krew/bin:/opt/homebrew/bin"
      # export PATH="$PATH:$HOME/.local/bin"
    '';
  };
}

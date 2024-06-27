{
  programs.bash = {
    enable = true;
    initExtra = ''
      # Ensure all nix and home-manager installed files are available in PATH.
      export PATH=/run/wrappers/bin:/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin:$PATH:$HOME/.nix-profile/bin:/etc/profiles/per-user/$USER/bin:/opt/homebrew/bin
    '';
  };
}

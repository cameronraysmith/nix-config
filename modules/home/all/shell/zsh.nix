{ lib, pkgs, ... }:
{
  programs.zsh = {
    enable = true;
    autosuggestion.enable = true;
    enableCompletion = true;

    envExtra = ''
      # Ensure all nix and home-manager installed files are available in PATH.
      # export PROTO_HOME="$HOME/.proto"
      # export PATH="$PROTO_HOME/shims:$PROTO_HOME/bin:$PATH"
      export PATH="/run/wrappers/bin:/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin:$PATH"
      export PATH="$PATH:$HOME/.nix-profile/bin:/etc/profiles/per-user/$USER/bin"
      export PATH="$PATH:$HOME/.krew/bin:/opt/homebrew/bin"
      # export PATH="$PATH:$HOME/.local/bin"
    '';

    initContent = ''
      # Initialize micromamba for zsh
      eval "$(micromamba shell hook --shell zsh)"

      # Special handling for nnn's cd-on-quit functionality
      # This needs to be a shell function to change the current shell's directory
      n() {
        # Block nesting of nnn
        if [ -n "$NNNLVL" ] && [ "$NNNLVL" -ge 1 ]; then
          echo "nnn is already running"
          return
        fi

        export NNN_TMPFILE="$HOME/.config/nnn/.lastd"

        nnn -adeHo "$@"

        if [ -f "$NNN_TMPFILE" ]; then
          . "$NNN_TMPFILE"
          rm -f "$NNN_TMPFILE" > /dev/null
        fi
      }
    '';

    oh-my-zsh = {
      enable = true;
      plugins = [
        "git"
        "rust"
        "vi-mode"
        "zoxide"
      ];
      theme = "robbyrussell";
    };

    syntaxHighlighting = {
      enable = true;
    };
  };
}

{ lib, pkgs, ... }:
{
  programs.zsh = {
    enable = true;
    autosuggestion.enable = true;
    enableCompletion = true;

    envExtra = ''
      # Ensure all nix and home-manager installed files are available in PATH.
      export PATH=/run/wrappers/bin:/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin:$HOME/.nix-profile/bin:/etc/profiles/per-user/$USER/bin:/opt/homebrew/bin:$PATH
    '';

    initExtra = ''
      # Initialize micromamba for zsh
      eval "$(micromamba shell hook --shell zsh)"

      # Shell function to create a kind cluster
      kindc () {
        cat <<EOF | kind create cluster --config=-
      kind: Cluster
      apiVersion: kind.x-k8s.io/v1alpha4
      nodes:
      - role: control-plane
        kubeadmConfigPatches:
        - |
          kind: InitConfiguration
          nodeRegistration:
            kubeletExtraArgs:
              node-labels: "ingress-ready=true"
        extraPortMappings:
        - containerPort: 80
          hostPort: 8080
          protocol: TCP
        - containerPort: 443
          hostPort: 8443
          protocol: TCP
      EOF
      }

      # Shell function to compute the sha256 nix hash of a file from a url.
      nix_hash_func() {
        url="$1";
        nix_hash=$(nix-prefetch-url "$url");
        nix hash to-sri --type sha256 "$nix_hash";
      }

      # Shell function to alias nnn to n
      n () {
        if [ -n $NNNLVL ] && [ "$NNNLVL" -ge 1 ]; then
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

      # Shell function to check differences between the current branch and the
      # upstream branch prior to merge.
      pmc() {
        export PAGER=cat
        branch=''${1:-upstream/main}
        echo 'Commit Summary:'
        git log HEAD..$branch --oneline
        echo
        echo 'Detailed Commit Logs:'
        git log HEAD..$branch
        echo
        echo 'Files Changed (Name Status):'
        git diff --name-status HEAD...$branch
        unset PAGER
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

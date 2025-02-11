{ lib, pkgs, ... }:
{
  programs.zsh = {
    enable = true;
    autosuggestion.enable = true;
    enableCompletion = true;

    envExtra = ''
      # Ensure all nix and home-manager installed files are available in PATH.
      export PROTO_HOME="$HOME/.proto"
      export PATH="$PROTO_HOME/shims:$PROTO_HOME/bin:$PATH"
      export PATH="/run/wrappers/bin:/run/current-system/sw/bin:/nix/var/nix/profiles/default/bin:$PATH"
      export PATH="$PATH:$HOME/.nix-profile/bin:/etc/profiles/per-user/$USER/bin"
      export PATH="$PATH:$HOME/.krew/bin:/opt/homebrew/bin"
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
      get_nix_hash() {
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

      # List the active scopes of a GitHub legacy PAT provided as argument.
      check_github_token_scopes() {
        if [ -z "$1" ]; then
          echo "Usage: check_github_token_scopes <your_github_token>"
          return 1
        fi

        token=$1
        curl -sS -f -I -H "Authorization: token $token" https://api.github.com | grep -i x-oauth-scopes
      }

      # GET the GitHub noreply email address for a given username.
      github_email() {
        local username=$1
        local user_id

        if ! command -v gh &> /dev/null; then
          echo "GitHub CLI (gh) is not installed. Please install it first."
          return 1
        fi

        user_id=$(gh api "users/''${username}" --jq ".id")

        if [ -z "$user_id" ]; then
          echo "Failed to retrieve user ID for username: ''${username}"
          return 1
        fi

        echo "''${user_id}+''${username}@users.noreply.github.com"
      }

      # Print the git log as a json object using nushell.
      gitjson() {
        nu -c "git log | jc --git-log | from json"
      }

      # Print specified number of lines of the git log as a json object using nushell.
      gitjsonl() {
        local lines="''${1:-1}"
        nu -c "git log | jc --git-log | from json | take $lines | transpose"
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

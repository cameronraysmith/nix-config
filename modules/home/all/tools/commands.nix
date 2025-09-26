{ pkgs, lib, ... }:
{
  home.packages = lib.mapAttrsToList (name: text: pkgs.writeShellApplication { inherit name text; }) {
    # kind cluster creation
    kindc = ''
      cat <<EOF | kind create cluster --config=-
      kind: Cluster
      apiVersion: kind.x-k8s.io/v1alpha4
      nodes:
      - role: control-plane
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
    '';

    # compute sha256 nix hash from URL
    get-nix-hash = ''
      if [ "$#" -ne 1 ]; then
        echo "Usage: $0 URL" >&2
        exit 1
      fi
      url="$1"
      nix_hash=$(nix-prefetch-url "$url")
      nix hash convert --to sri --hash-algo sha256 "$nix_hash"
    '';

    # nnn file manager launcher (without cd-on-quit)
    n-launcher = ''
      # shellcheck disable=SC2086
      if [ -n ''${NNNLVL:-} ] && [ "$NNNLVL" -ge 1 ]; then
        echo "nnn is already running"
        exit 0
      fi

      exec ${pkgs.nnn}/bin/nnn -adeHo "$@"
    '';

    # pre-merge check for git branches
    pmc = ''
      branch=''${1:-upstream/main}
      export PAGER=cat

      echo 'Commit Summary:'
      git log HEAD.."$branch" --oneline
      echo
      echo 'Detailed Commit Logs:'
      git log HEAD.."$branch"
      echo
      echo 'Files Changed (Name Status):'
      git diff --name-status HEAD..."$branch"
    '';

    # check GitHub token scopes
    check-github-token-scopes = ''
      if [ -z "$1" ]; then
        echo "Usage: $0 <your_github_token>"
        exit 1
      fi

      token=$1
      curl -sS -f -I -H "Authorization: token $token" https://api.github.com | grep -i x-oauth-scopes
    '';

    # get GitHub noreply email address
    github-email = ''
      if [ -z "$1" ]; then
        echo "Usage: $0 <username>"
        exit 1
      fi

      username=$1

      if ! command -v gh &> /dev/null; then
        echo "GitHub CLI (gh) is not installed. Please install it first."
        exit 1
      fi

      user_id=$(gh api "users/''${username}" --jq ".id")

      if [ -z "$user_id" ]; then
        echo "Failed to retrieve user ID for username: ''${username}"
        exit 1
      fi

      echo "''${user_id}+''${username}@users.noreply.github.com"
    '';

    # git log as JSON
    gitjson = ''
      exec ${pkgs.nushell}/bin/nu -c "git log | ${pkgs.jc}/bin/jc --git-log | from json"
    '';

    # git log lines as JSON
    gitjsonl = ''
      lines="''${1:-1}"
      exec ${pkgs.nushell}/bin/nu -c "git log | ${pkgs.jc}/bin/jc --git-log | from json | take $lines | transpose"
    '';

    # clean up filenames
    cleanfn = ''
      if [ -z "$1" ]; then
        echo "Usage: $0 <filename>"
        echo "Cleans up filenames by removing spaces, special characters, and standardizing format"
        exit 1
      fi

      ${pkgs.rename}/bin/rename -bf 's/(\.[^.]+)$//; s/\s+/-/g; s/\./-/g; s/[^a-zA-Z0-9\-]/-/g; s/-{2,}/-/g; s/$/$1/' "$1"
    '';

    # claude Code with dangerous skip permissions
    ccds = ''
      exec pnpm --package=@anthropic-ai/claude-code dlx claude --dangerously-skip-permissions "$@"
    '';

    # create a private GitHub fork
    gfork = ''
      if ! command -v gh &> /dev/null; then
        echo "GitHub CLI (gh) is not installed. Please install it first."
        exit 1
      fi

      if ! git rev-parse --is-inside-work-tree &> /dev/null; then
        echo "Error: Not inside a git repository"
        exit 1
      fi

      echo "Current remotes:"
      git remote -v

      echo
      echo "Renaming origin to upstream..."
      git remote rename origin upstream 2>/dev/null || echo "Note: No 'origin' remote to rename"

      repo_name=$(basename "$(git rev-parse --show-toplevel)")
      gh_username=$(gh api user --jq .login 2>/dev/null)

      if [ -z "$gh_username" ]; then
        echo "Error: Could not get GitHub username. Please ensure you're logged in with 'gh auth login'"
        exit 1
      fi

      echo "Creating repo: $gh_username/$repo_name"
      printf "Press enter to continue or type new name: "
      read -r new_name

      final_name=''${new_name:-$repo_name}
      echo "Creating private repository: $gh_username/$final_name"

      if gh repo create "$gh_username/$final_name" --private --push -r origin -s .; then
        echo "Successfully created and pushed to private repository: $gh_username/$final_name"
        echo "Updated remotes:"
        git remote -v
      else
        echo "Error: Failed to create repository"
        exit 1
      fi
    '';

    # nix garbage collection for both system and user
    gc = ''
      set -x
      sudo nix-collect-garbage --delete-older-than 7d
      nix-collect-garbage --delete-older-than 7d
      nix store optimise
    '';

    # update nix flake and commit lock file
    flakeup = ''
      exec nix flake update --commit-lock-file "$@"
    '';

    # quick nix develop wrapper
    dev = ''
      exec nix develop "$@"
    '';
  };
}

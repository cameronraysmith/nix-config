{ pkgs, lib, ... }:
{
  home.packages = lib.mapAttrsToList (name: text: pkgs.writeShellApplication { inherit name text; }) {
    # create kind cluster
    kindc = ''
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      Create a kind Kubernetes cluster with ingress support

      Usage: kindc

      Creates a local Kubernetes cluster using kind with:
        - Control plane node with ingress support
        - Port mappings: 8080->80, 8443->443
        - Node labels for ingress readiness

      Example:
        kindc    # Create the configured cluster
      HELP
          exit 0
          ;;
      esac

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
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      Compute SHA256 Nix hash of a file from URL

      Usage: get-nix-hash URL

      Downloads a file from the given URL and computes its SHA256 hash
      in SRI format for use in Nix expressions.

      Arguments:
        URL    The URL of the file to hash

      Example:
        get-nix-hash https://example.com/file.tar.gz
      HELP
          exit 0
          ;;
        "")
          echo "Error: URL required" >&2
          echo "Usage: get-nix-hash URL" >&2
          echo "Try 'get-nix-hash --help' for more information." >&2
          exit 1
          ;;
      esac

      url="$1"
      nix_hash=$(nix-prefetch-url "$url")
      nix hash convert --to sri --hash-algo sha256 "$nix_hash"
    '';

    # nnn file manager launcher (without cd-on-quit)
    n-launcher = ''
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      Launch nnn file manager

      Usage: n-launcher [OPTIONS]

      Starts nnn file manager with preset options:
        -a: auto-setup temporary NNN_FIFO
        -d: detail mode
        -e: open text files in $EDITOR
        -H: show hidden files
        -o: open files only on Enter

      Note: For cd-on-quit functionality, use the 'n' shell function instead.

      Examples:
        n-launcher           # Launch nnn with default settings
        n-launcher /path     # Open nnn at specific path
      HELP
          exit 0
          ;;
      esac

      if [ -n "''${NNNLVL:-}" ] && [ "''${NNNLVL:-0}" -ge 1 ]; then
        echo "nnn is already running"
        exit 0
      fi

      exec ${pkgs.nnn}/bin/nnn -adeHo "$@"
    '';

    # pre-merge check for git branches
    pmc = ''
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      Pre-merge check for git branches

      Usage: pmc [BRANCH]

      Shows detailed information about changes between current HEAD and
      target branch to review before merging.

      Arguments:
        BRANCH    Branch to compare against (default: upstream/main)

      Output includes:
        - Commit summary (one-line)
        - Detailed commit logs
        - Files changed with status

      Examples:
        pmc                    # Compare with upstream/main
        pmc origin/develop     # Compare with origin/develop
      HELP
          exit 0
          ;;
      esac

      branch="''${1:-upstream/main}"
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

    # check github token scopes
    check-github-token-scopes = ''
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      Check GitHub personal access token scopes

      Usage: check-github-token-scopes TOKEN

      Lists the active scopes of a GitHub legacy personal access token.

      Arguments:
        TOKEN    GitHub personal access token to check

      Example:
        check-github-token-scopes ghp_xxxxxxxxxxxxxxxxxxxx
      HELP
          exit 0
          ;;
        "")
          echo "Error: GitHub token required" >&2
          echo "Usage: check-github-token-scopes TOKEN" >&2
          echo "Try 'check-github-token-scopes --help' for more information." >&2
          exit 1
          ;;
      esac

      token="$1"
      curl -sS -f -I -H "Authorization: token $token" https://api.github.com | grep -i x-oauth-scopes
    '';

    # get github noreply email address
    github-email = ''
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      Get GitHub noreply email address for a user

      Usage: github-email USERNAME

      Retrieves the noreply email address for a GitHub user using the
      GitHub API. Requires GitHub CLI (gh) to be authenticated.

      Arguments:
        USERNAME    GitHub username

      Example:
        github-email octocat
        # Returns: 1234567+octocat@users.noreply.github.com
      HELP
          exit 0
          ;;
        "")
          echo "Error: Username required" >&2
          echo "Usage: github-email USERNAME" >&2
          echo "Try 'github-email --help' for more information." >&2
          exit 1
          ;;
      esac

      username="$1"

      if ! command -v gh &> /dev/null; then
        echo "Error: GitHub CLI (gh) is not installed" >&2
        exit 1
      fi

      user_id=$(gh api "users/''${username}" --jq ".id" 2>/dev/null)

      if [ -z "$user_id" ]; then
        echo "Error: Failed to retrieve user ID for username: ''${username}" >&2
        exit 1
      fi

      echo "''${user_id}+''${username}@users.noreply.github.com"
    '';

    # git log as JSON
    gitjson = ''
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      Display git log as JSON

      Usage: gitjson

      Converts git log output to JSON format using jc and displays
      it with nushell for better formatting.

      Requires: nushell, jc

      Example:
        gitjson    # Show entire git log as JSON
      HELP
          exit 0
          ;;
      esac

      exec ${pkgs.nushell}/bin/nu -c "git log | ${pkgs.jc}/bin/jc --git-log | from json"
    '';

    # git log lines as JSON
    gitjsonl = ''
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      Display git log lines as JSON

      Usage: gitjsonl [LINES]

      Shows specified number of git log entries as JSON in transposed format.

      Arguments:
        LINES    Number of log entries to show (default: 1)

      Examples:
        gitjsonl      # Show latest commit as JSON
        gitjsonl 5    # Show latest 5 commits as JSON
      HELP
          exit 0
          ;;
      esac

      lines="''${1:-1}"
      exec ${pkgs.nushell}/bin/nu -c "git log | ${pkgs.jc}/bin/jc --git-log | from json | take $lines | transpose"
    '';

    # clean up filenames
    cleanfn = ''
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      Clean up filenames by removing special characters

      Usage: cleanfn FILENAME

      Standardizes filenames by:
        - Removing spaces (replaced with hyphens)
        - Removing special characters
        - Converting dots to hyphens (except file extension)
        - Collapsing multiple hyphens

      Arguments:
        FILENAME    File to rename

      Example:
        cleanfn "My Document (2023).v2.pdf"
        # Renames to: My-Document-2023-v2.pdf
      HELP
          exit 0
          ;;
        "")
          echo "Error: Filename required" >&2
          echo "Usage: cleanfn FILENAME" >&2
          echo "Try 'cleanfn --help' for more information." >&2
          exit 1
          ;;
      esac

      ${pkgs.rename}/bin/rename -bf 's/(\.[^.]+)$//; s/\s+/-/g; s/\./-/g; s/[^a-zA-Z0-9\-]/-/g; s/-{2,}/-/g; s/$/$1/' "$1"
    '';

    # claude code with dangerous skip permissions
    ccds = ''
      exec ${pkgs.pnpm}/bin/pnpm --package=@anthropic-ai/claude-code dlx claude --dangerously-skip-permissions "$@"
    '';

    # create a private github fork
    gfork = ''
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      Create a private fork of current repository

      Usage: gfork

      Creates a private GitHub repository as a fork:
        1. Renames 'origin' remote to 'upstream'
        2. Creates new private repo on your GitHub account
        3. Sets the new repo as 'origin'
        4. Pushes current branch to new origin

      Requirements:
        - Must be run inside a git repository
        - GitHub CLI (gh) must be authenticated

      Interactive:
        - Prompts for confirmation or new repo name
      HELP
          exit 0
          ;;
      esac

      if ! command -v gh &> /dev/null; then
        echo "Error: GitHub CLI (gh) is not installed" >&2
        exit 1
      fi

      if ! git rev-parse --is-inside-work-tree &> /dev/null; then
        echo "Error: Not inside a git repository" >&2
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
        echo "Error: Could not get GitHub username. Please run 'gh auth login'" >&2
        exit 1
      fi

      echo "Creating repo: $gh_username/$repo_name"
      printf "Press enter to continue or type new name: "
      read -r new_name

      final_name="''${new_name:-$repo_name}"
      echo "Creating private repository: $gh_username/$final_name"

      if gh repo create "$gh_username/$final_name" --private --push -r origin -s .; then
        echo "Successfully created and pushed to private repository: $gh_username/$final_name"
        echo "Updated remotes:"
        git remote -v
      else
        echo "Error: Failed to create repository" >&2
        exit 1
      fi
    '';

    # save staged changes to stash while keeping them staged
    stash-staged = ''
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      Save staged changes to stash while keeping them staged

      Usage: stash-staged MESSAGE

      Creates a stash containing only the staged changes, then immediately
      reapplies them to keep them staged. This allows you to save a snapshot
      of staged changes while continuing to work with them.

      Arguments:
        MESSAGE    Required stash message describing the changes

      Workflow:
        1. Stashes staged changes with your message
        2. Reapplies the stash to restore staged state
        3. Shows current stash list
        4. Provides command to view the stash later

      Example:
        stash-staged "API refactoring"

      To view the stash later:
        PAGER=cat git stash show -p stash@{0}
      HELP
          exit 0
          ;;
        "")
          echo "Error: Stash message required" >&2
          echo "Usage: stash-staged MESSAGE" >&2
          echo "Try 'stash-staged --help' for more information." >&2
          exit 1
          ;;
      esac

      message="$1"

      echo "Stashing staged changes: $message"
      git stash push --staged -m "$message"

      echo "Reapplying staged changes..."
      git stash apply --index

      echo
      echo "Current stash list:"
      git stash list

      echo
      echo "To view this stash later, run:"
      echo "PAGER=cat git stash show -p stash@{0}"
    '';

    # nix garbage collection for both system and user
    ngc = ''
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      Nix garbage collection for system and user

      Usage: ngc

      Performs garbage collection on Nix store:
        1. System-wide GC (removes profiles older than 7 days)
        2. User GC (removes profiles older than 7 days)
        3. Optimizes Nix store (hardlinks identical files)

      Note: Requires sudo for system-wide collection

      Example:
        ngc    # Run full garbage collection
      HELP
          exit 0
          ;;
      esac

      set -x
      sudo nix-collect-garbage --delete-older-than 7d
      nix-collect-garbage --delete-older-than 7d
      nix store optimise
    '';

    # update nix flake and commit lock file
    flakeup = ''
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      Update Nix flake and commit lock file

      Usage: flakeup [FLAKE_ARGS...]

      Updates flake inputs and automatically commits the lock file.

      Arguments:
        FLAKE_ARGS    Additional arguments for 'nix flake update'

      Examples:
        flakeup                    # Update all inputs
        flakeup --update-input foo # Update specific input
      HELP
          exit 0
          ;;
      esac

      exec nix flake update --commit-lock-file "$@"
    '';

    # quick nix develop wrapper
    dev = ''
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      Enter Nix development shell

      Usage: dev [NIX_ARGS...]

      Shorthand wrapper for 'nix develop'.

      Arguments:
        NIX_ARGS    Arguments to pass to 'nix develop'

      Examples:
        dev                   # Enter default devShell
        dev .#backend         # Enter specific devShell
        dev --command bash    # Run command in devShell
      HELP
          exit 0
          ;;
      esac

      exec nix develop "$@"
    '';

    # nix shell app reference
    nsa-ref = ''
      case "''${1:-}" in
        -h|--help)
          cat <<'HELP'
      List all nix shell applications with descriptions

      Usage: nsa-ref

      Displays a reference list of all available shell commands
      defined in this configuration with brief descriptions.

      Example:
        nsa-ref    # Show all commands and descriptions
      HELP
          exit 0
          ;;
      esac

      cat <<'EOF'
      kindc                         Create kind Kubernetes cluster with ingress support
      get-nix-hash                  Compute SHA256 Nix hash of a file from URL
      n-launcher                    Launch nnn file manager with preset options
      pmc                          Pre-merge check for git branches
      check-github-token-scopes    Check GitHub personal access token scopes
      github-email                 Get GitHub noreply email address for a user
      gitjson                      Display git log as JSON
      gitjsonl                     Display git log lines as JSON
      cleanfn                      Clean up filenames by removing special characters
      ccds                         Claude code with dangerous skip permissions
      gfork                        Create a private GitHub fork of current repository
      stash-staged                 Save staged changes to stash while keeping them staged
      ngc                          Nix garbage collection for system and user
      flakeup                      Update Nix flake and commit lock file
      dev                          Enter Nix development shell
      nsa-ref                      List all nix shell applications with descriptions
      EOF
    '';
  };
}

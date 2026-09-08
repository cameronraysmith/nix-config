{
  perSystem =
    {
      lib,
      pkgs,
      inputs',
      config,
      self',
      ...
    }:
    let
      # Match the home-manager python environment from modules/home/languages/python.nix.
      # duckdb resolves to nixpkgs' python3Packages.duckdb. The local
      # duckdb/python-duckdb pair that used to shadow it on machines now lives
      # in pkgs/disabled/ (see pkgs/disabled/README.md), so nixpkgs is the only
      # source here and on machines alike.
      python = pkgs.python3.withPackages (
        ps: with ps; [
          duckdb
          huggingface-hub
          pip
          trafilatura
        ]
      );
    in
    {
      devShells.default = pkgs.mkShell {
        inputsFrom = [
          config.pre-commit.devShell
        ];

        # Materializes the repo-root AGENTS.md/CLAUDE.md from the
        # agent-context-* apm fragments once per clone; run `just
        # agents-context` to refresh after editing the fragments. The
        # presence check below is a bash builtin, so the common case
        # (AGENTS.md already exists) execs nothing: the compile wrapper's
        # runtimeInputs (apm, git, yq-go, coreutils, findutils) exec
        # roughly 20 non-Apple binaries even just to check staleness, and
        # each exec of non-Apple code on macOS triggers a syspolicyd
        # Gatekeeper adjudication -- paying that cost on every shell entry
        # and direnv reload, across every worktree, contributed to a
        # syspolicyd lockup. `lib.getExe` embeds the store path at eval
        # time; `--auto` lets the script itself pick the repository tier
        # vs every tier by checking for a user-level agent context file
        # (see apm-context-compile.sh); the `if !` guard means a failure
        # never fails the shell, since a missing AGENTS.md degrades an
        # agent session but must not block a human terminal or direnv.
        # The check below is `$PWD`-relative, not repo-root-relative:
        # entering the devShell from a subdirectory can miss an
        # AGENTS.md that exists only at the repo root.
        shellHook = ''
          if [[ ! -f "$PWD/AGENTS.md" ]]; then
            if ! ${lib.getExe config.packages.apm-context-compile} --auto; then
              echo "apm-context-compile: skipped (run 'just agents-context' to regenerate AGENTS.md/CLAUDE.md manually)" >&2
            fi
          fi
        '';

        # The playwright-web-flake default devShell is intentionally not inherited;
        # select the browser set explicitly. Use the full flake set (chromium,
        # firefox, webkit) on both platforms: the fork carries working macOS-15
        # (rev 2311) and Linux webkit builds, so the all-browser local `just
        # docs-test` passes. The Chrome-for-Testing sandbox crash that forces the
        # nixpkgs-chromium wrapper is specific to the hermetic e2e check in
        # pkgs/by-name/vanixiets-docs/package.nix, not this interactive devShell.
        PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
        PLAYWRIGHT_BROWSERS_PATH = "${inputs'.playwright-web-flake.packages.playwright-driver.browsers}";

        packages = [
          python
          inputs'.clan-core.packages.default
          inputs'.nix2container.packages.skopeo-nix2container
          pkgs.just
          pkgs.nh
          pkgs.omnix
          pkgs.nix-output-monitor
          self'.packages.nix-fast-build
          pkgs.nix-update
          pkgs.nix-prefetch-github
          self'.packages.uncomment-bin
          # Tools required by Makefile verify target
          pkgs.age
          pkgs.ssh-to-age
          pkgs.sops
          # Identity administration; version tracks the kanidm server on magnetite
          pkgs.kanidm_1_11
          # Kubernetes cluster management
          pkgs.clusterctl
          pkgs.kluctl
          pkgs.k3d
          pkgs.ctlptl
          pkgs.kyverno-chainsaw
          pkgs.rsync # nixidy-sync manifest deployment
          # Tools required by TypeScript packages CI
          pkgs.bun
          inputs'.bun2nix.packages.default
          pkgs.nodejs_24 # semantic-release >= 24.10.0
          pkgs.fuc
          pkgs.rip2
          # Language detection
          pkgs.github-linguist
          # Document typesetting
          pkgs.typstWithPackages
          pkgs.svgo
          # The skills apm deploys into .agents/skills/ shell out to these CLIs.
          # Home-manager supplies them on a fleet machine and nowhere else, so
          # on a CI runner, an agent sandbox, or a fresh checkout a skill loads
          # and then dies on its first command. duckdb here is the CLI; the
          # python binding above is a separate output.
          pkgs.jujutsu
          pkgs.ghq
          pkgs.jaq
          pkgs.duckdb
          self'.packages.linear-cli
          self'.packages.mergify-cli-bin
          inputs'.llm-agents.packages.openspec
        ]
        # buildbot-effects CLI for local dispatch of hercules-ci-effects
        # (see buildbot-nix/docs/EFFECTS.md). Linux-only: depends on bwrap.
        ++ lib.optionals pkgs.stdenv.isLinux [
          inputs'.buildbot-nix.packages.buildbot-effects
        ];

        passthru.meta.description = "Development environment with clan CLI and build tools";
      };
    };
}

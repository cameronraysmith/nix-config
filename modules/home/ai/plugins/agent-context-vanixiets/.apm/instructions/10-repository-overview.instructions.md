---
description: vanixiets repository overview — what it manages, its layout, and its build/check/test entry points.
---

## Repository overview

vanixiets manages nix-darwin workstations, a bare-metal NixOS laptop, and NixOS cloud servers with [clan](https://clan.lol), using a deferred module composition architecture.
Clan handles multi-machine provisioning and declarative configuration across nix-darwin, NixOS, and home-manager, with sops-nix for secrets and ZeroTier for the private mesh network.
The flake is built with flake-parts and import-tree, so every module under `modules/` is discovered from the filesystem rather than listed in an explicit import set; adding a file is how a module is registered.

The repository also publishes an [apm](https://github.com/microsoft/apm) marketplace of agent-skill plugins, which is independent of the Nix configurations and installable on its own.

## Repository layout

`machines/` holds one directory per NixOS machine.
`modules/` holds the flake-parts modules import-tree discovers, subdivided by concern: `clan/` for inventory and clan services, `darwin/` and `nixos/` for per-platform system configuration, `home/` for home-manager, `terranix/` for cloud resource declarations, `checks/` for flake checks, and `containers/`, `kubernetes.nix`, and `nixidy.nix` for the container and Kubernetes layers.
`pkgs/by-name/` holds first-party packages that are built, several of which override versions supplied by flake inputs; `pkgs/disabled/` holds derivations parked out of the build, including the beads issue-tracker family, which this repository no longer uses.
`lib/`, `scripts/`, `secrets/`, `sops/`, `vars/`, and `terraform/` hold shared helpers, operational scripts, encrypted material, and generated Terraform state respectively.

Documentation lives in two places.
`packages/docs/` is an Astro Starlight site published from this repository, and architecture decision records live under `packages/docs/src/content/docs/development/architecture/adrs/`.
`docs/` holds the working notes and reference material that feed it, including `docs/notes/development/kubernetes/` for the Kubernetes platform design and its own ADR series.

`openspec/` holds change proposals and their specs; `openspec/changes/archive/` is deliberately tracked, which is why the `archive/` ignore rule in `.gitignore` is anchored to the repository root.

## Building, checking, and testing

`just` is the task entry point; `just help` lists the recipes.

`just check` runs `nix flake check` over everything.
`just check-fast` runs the same check set through `nix-fast-build` and is the normal local loop.
`just test-quick` builds a named subset of checks directly for fast feedback.
`just lint` runs the `prek` hook set, which is treefmt plus a staged-diff gitleaks scan; the hooks are declared in `modules/formatting.nix` rather than in a `.pre-commit-config.yaml`.

Individual checks are addressable, so the narrowest useful selection is usually a direct build of the one that covers the change, for example `nix build .#checks.<system>.gitleaks`.
`checks.gitleaks` scans the whole flake source tree with `gitleaks detect --no-git`, so it covers any newly committed file, not only staged diffs.
Check definitions live under `modules/checks/`.
Many, particularly those built through `mkStructuralCheck` in `validation.nix`, carry a `passthru.meta.description` naming what they validate, but this is not universal — files such as `package-tests.nix`, `aeneas-toolchain.nix`, and `home.nix` define checks without that field, so consult the file directly rather than assuming the annotation is present.

Documentation has its own lane under `packages/docs`: `just docs-lint`, `just docs-check`, and the `just docs-test-*` recipes.

## Version control

The default branch is `main`.
Mergify's queues in `.github/mergify.yml` remain configured and are the working landing path until the operator-coordinated App-installation window.
The replacement gitea-mq service is deployed at https://mq.scientistexperience.net with App id 4875422 and `batchMax = 5`, but manages zero repositories because the App is deliberately not yet installed.
Its required external checks are `nixbot/nix-eval` and `nixbot/nix-build`.
At cutover, external handoff follows `git-stacked-pr-integration` §Queue authorization in every local VCS mode.
Follow that owner's installation-readiness hold before authorizing; instruction delivery precedes installation, and Mergify queue removal belongs to the same coordinated window.

Checkouts of this repository are commonly colocated with [jujutsu](https://jj-vcs.github.io/jj/), in which case a detached git `HEAD` is normal and must not be reattached.
Because this is a flake repository, flake evaluation resolves the root through git, so a second working tree must be created with `git worktree add` rather than `jj workspace add`.

{
  description = "vanixiets: infrastructure from nix with flake-parts and clan";

  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } (inputs.import-tree ./modules);

  inputs = {
    nixpkgs.url = "https://channels.nixos.org/nixos-unstable-small/nixexprs.tar.xz";
    systems.url = "github:nix-systems/default/future-26.11";

    nixpkgs-darwin-stable.url = "https://channels.nixos.org/nixpkgs-26.05-darwin/nixexprs.tar.xz";
    nixpkgs-linux-stable.url = "https://channels.nixos.org/nixos-26.05/nixexprs.tar.xz";

    flake-parts.url = "github:hercules-ci/flake-parts";
    flake-parts.inputs.nixpkgs-lib.follows = "nixpkgs";

    nix-index-database.url = "github:nix-community/nix-index-database";

    nix-darwin.url = "github:nix-darwin/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";

    mac-app-util.url = "github:hraban/mac-app-util";
    mac-app-util.inputs.nixpkgs.follows = "nixpkgs";

    home-manager.url = "github:nix-community/home-manager";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";

    # Typed configuration only; pyrite runs and validates with nixpkgs' niri.
    niri-flake.url = "github:epireyn/niri-flake";
    niri-flake.inputs.nixpkgs.follows = "nixpkgs";
    niri-flake.inputs.nixpkgs-stable.follows = "nixpkgs";

    sops-nix.url = "github:Mic92/sops-nix";
    sops-nix.inputs.nixpkgs.follows = "nixpkgs";

    import-tree.url = "github:vic/import-tree";

    pkgs-by-name-for-flake-parts.url = "github:drupol/pkgs-by-name-for-flake-parts";

    treefmt-nix.url = "github:numtide/treefmt-nix";
    treefmt-nix.inputs.nixpkgs.follows = "nixpkgs";

    git-hooks.url = "github:cachix/git-hooks.nix";
    git-hooks.inputs.nixpkgs.follows = "nixpkgs";
    git-hooks.inputs.flake-compat.follows = "";

    nix-unit.url = "github:nix-community/nix-unit";
    nix-unit.inputs.nixpkgs.follows = "nixpkgs";
    nix-unit.inputs.treefmt-nix.follows = "treefmt-nix";

    lazyvim-nix.url = "github:pfassina/lazyvim-nix";
    lazyvim-nix.inputs.nixpkgs.follows = "nixpkgs";

    nix2container.url = "github:nlewo/nix2container";
    nix2container.inputs.nixpkgs.follows = "nixpkgs";

    nix-rosetta-builder.url = "github:cpick/nix-rosetta-builder";
    nix-rosetta-builder.inputs.nixpkgs.follows = "nixpkgs";

    niks3.url = "github:Mic92/niks3";
    niks3.inputs.nixpkgs.follows = "nixpkgs";
    niks3.inputs.treefmt-nix.follows = "treefmt-nix";

    cognee-nix.url = "github:cameronraysmith/cognee-nix/cognee-v112";

    buildbot-nix.url = "github:nix-community/buildbot-nix";
    buildbot-nix.inputs.nixpkgs.follows = "nixpkgs";
    buildbot-nix.inputs.treefmt-nix.follows = "treefmt-nix";

    nixbot.url = "github:Mic92/nixbot";
    nixbot.inputs.nixpkgs.follows = "nixpkgs";
    nixbot.inputs.treefmt-nix.follows = "treefmt-nix";

    gitea-mq.url = "github:Mic92/gitea-mq";
    gitea-mq.inputs.nixpkgs.follows = "nixpkgs";
    gitea-mq.inputs.treefmt-nix.follows = "treefmt-nix";

    hercules-ci-effects.url = "github:hercules-ci/hercules-ci-effects";
    hercules-ci-effects.inputs.flake-parts.follows = "flake-parts";
    hercules-ci-effects.inputs.nixpkgs.follows = "nixpkgs";

    clan-core.url = "https://git.clan.lol/clan/clan-core/archive/main.tar.gz";
    clan-core.inputs.sops-nix.follows = "sops-nix";
    clan-core.inputs.disko.follows = "disko";
    clan-core.inputs.flake-parts.follows = "flake-parts";
    clan-core.inputs.treefmt-nix.follows = "treefmt-nix";
    clan-core.inputs.nix-darwin.follows = "nix-darwin";
    clan-core.inputs.systems.follows = "systems";

    terranix.url = "github:terranix/terranix";
    terranix.inputs.flake-parts.follows = "flake-parts";
    terranix.inputs.nixpkgs.follows = "nixpkgs";
    terranix.inputs.systems.follows = "systems";

    disko.url = "github:nix-community/disko";
    disko.inputs.nixpkgs.follows = "nixpkgs";

    nixos-hardware.url = "github:NixOS/nixos-hardware";
    nixos-hardware.inputs.nixpkgs.follows = "nixpkgs";

    srvos.url = "github:nix-community/srvos";
    srvos.inputs.nixpkgs.follows = "nixpkgs";

    direnv-instant.url = "github:Mic92/direnv-instant";
    direnv-instant.inputs.nixpkgs.follows = "nixpkgs";
    direnv-instant.inputs.flake-parts.follows = "flake-parts";
    direnv-instant.inputs.treefmt-nix.follows = "treefmt-nix";

    bun2nix.url = "github:nix-community/bun2nix";
    bun2nix.inputs.nixpkgs.follows = "nixpkgs";
    bun2nix.inputs.flake-parts.follows = "flake-parts";
    bun2nix.inputs.systems.follows = "systems";
    bun2nix.inputs.treefmt-nix.follows = "treefmt-nix";

    playwright-web-flake.url = "github:cameronraysmith/playwright-web-flake/fix-webkit-darwin-mac15-arm64";
    playwright-web-flake.inputs.nixpkgs.follows = "nixpkgs";

    nuenv.url = "github:hallettj/nuenv/writeShellApplication";
    nuenv.inputs.nixpkgs.follows = "nixpkgs";

    llm-agents.url = "github:numtide/llm-agents.nix";

    hunk.url = "github:modem-dev/hunk";
    hunk.inputs.nixpkgs.follows = "nixpkgs";
    hunk.inputs.bun2nix.follows = "bun2nix";

    worktrunk.url = "github:max-sixty/worktrunk/v0.65.0";
    worktrunk.inputs.nixpkgs.follows = "nixpkgs";

    rust-overlay.url = "github:oxalica/rust-overlay";
    rust-overlay.inputs.nixpkgs.follows = "nixpkgs";

    hermes-agent.url = "github:NousResearch/hermes-agent/main";
    hermes-agent.inputs.nixpkgs.follows = "nixpkgs";
    hermes-agent.inputs.flake-parts.follows = "flake-parts";

    catppuccin.url = "github:catppuccin/nix";

    nixidy.url = "github:arnarg/nixidy";
    nixidy.inputs.nixpkgs.follows = "nixpkgs";

    nixhelm.url = "github:farcaller/nixhelm";
    nixhelm.inputs.nixpkgs.follows = "nixpkgs";

    easykubenix.url = "github:cameronraysmith/easykubenix/dev";
    easykubenix.flake = false;

    cilium-src.url = "github:cilium/cilium/v1.18.6";
    cilium-src.flake = false;

    step-ca-src.url = "github:smallstep/helm-charts/master";
    step-ca-src.flake = false;

    sops-secrets-operator-src.url = "github:isindir/sops-secrets-operator/0.16.0";
    sops-secrets-operator-src.flake = false;

    argocd-src.url = "github:argoproj/argo-cd/v3.2.5";
    argocd-src.flake = false;

    argocd-helm-src.url = "github:argoproj/argo-helm/argo-cd-9.3.4";
    argocd-helm-src.flake = false;

    gateway-api-src.url = "github:kubernetes-sigs/gateway-api/v1.4.1";
    gateway-api-src.flake = false;
  };

  # sync with lib/caches.nix for machine modules
  nixConfig = {
    extra-substituters = [
      "https://cache.nixos.org"
      "https://nix-community.cachix.org"
      "https://cache.numtide.com"
      "https://cache.clan.lol"
      "https://pyproject-nix.cachix.org"
      "https://catppuccin.cachix.org"
      "https://cuda-maintainers.cachix.org"
      "https://cache.scientistexperience.net?priority=45"
      "https://cameronraysmith.cachix.org?priority=50"
    ];
    extra-trusted-public-keys = [
      "cache.nixos.org-1:6NCHdD59X431o0gWypbMrAURkbJ16ZPMQFGspcDShjY="
      "nix-community.cachix.org-1:mB9FSh9qf2dCimDSUo8Zy7bkq5CX+/rkCWyvRCYg3Fs="
      "niks3.numtide.com-1:DTx8wZduET09hRmMtKdQDxNNthLQETkc/yaX7M4qK0g="
      "cache.clan.lol-1:3KztgSAB5R1M+Dz7vzkBGzXdodizbgLXGXKXlcQLA28="
      "pyproject-nix.cachix.org-1:UNzugsOlQIu2iOz0VyZNBQm2JSrL/kwxeCcFGw+jMe0="
      "catppuccin.cachix.org-1:noG/4HkbhJb+lUAdKrph6LaozJvAeEEZj4N732IysmU="
      "cuda-maintainers.cachix.org-1:0dq3bujKpuEPMCX6U4WylrUDZ9JyUG0VpVZa7CNfq5E="
      "cache.scientistexperience.net-1:N9ZeWasooJLXEwaN+rd4MMyBuGpAtcUAXrEUPBT5cXI="
      "cameronraysmith.cachix.org-1:aC8ZcRCVcQql77Qn//Q1jrKkiDGir+pIUjhUunN6aio="
    ];
  };
}

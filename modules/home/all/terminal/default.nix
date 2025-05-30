{ pkgs, ... }:
let
  python = pkgs.python311.withPackages (ps: with ps; [ pip ]);
  dvcWithOptionalRemotes = pkgs.dvc.override {
    enableGoogle = true;
    enableAWS = true;
    enableAzure = true;
    enableSSH = true;
  };
in
{
  imports = [
    ./atuin.nix
    ./starship.nix
    ./tmux.nix
    ./yazi.nix
    ./zellij.nix
  ];

  home.packages =
    with pkgs;
    [
      # unix tools
      b3sum
      coreutils # many (non-)overlapping tools in toybox
      fd
      findutils # mostly covered by alternatives in toybox
      gnugrep # alternative in toybox
      gnupatch # alternative in toybox
      gnupg
      gnused # alternative in toybox
      gum
      moreutils
      patchutils
      pinentry-tty
      pipe-rename
      procps # mostly covered by alternatives in toybox
      procs # alternative to ps
      rename
      ripgrep
      rsync
      sd
      sesh
      # toybox # many (non-)overlapping tools in coreutils + grep/sed/find/xargs/ps
      tree
      unison

      # io
      aria2
      curl
      rclone
      restic
      autorestic
      wget

      # nix dev
      cachix
      nil
      nix-info
      nix-prefetch-scripts
      nixpkgs-fmt
      omnix

      # publishing
      asciinema
      asciinema-agg
      exiftool
      ghostscript
      imagemagick
      poppler_utils
      qpdf
      (quarto.override { python3 = null; })
      repomix
      svg2pdf

      # compute
      argo
      argocd
      argocd-autopilot
      crane
      crossplane-cli
      ctlptl
      cue
      dive
      (google-cloud-sdk.withExtraComponents [
        google-cloud-sdk.components.gke-gcloud-auth-plugin
      ])
      holos
      kcl
      kind
      krew
      kubectl
      kubectx
      kubernetes-helm
      kustomize
      lazydocker
      terraform
      timoni
      vcluster
      # https://github.com/NixOS/nixpkgs/issues/381980
      # ❯ yarn dlx wrangler ...
      # wrangler

      # db
      duckdb
      limbo
      postgresql_16
      sqlite
      turso-cli

      # dev
      act
      bazelisk
      bazel-buildtools
      dvcWithOptionalRemotes
      gh
      git-filter-repo
      git-machete
      graphite-cli
      graphviz
      jc
      jqp
      just
      mkcert
      plantuml-c4
      pre-commit
      proto # version manager NOT protobuf-related
      ratchet
      step-ca
      tmate
      yq

      # compression
      zstd
      snzip

      # fonts
      noto-fonts-emoji
      fira-code
      cascadia-code
      monaspace
      nerd-fonts.inconsolata

      # Note: for quick experiments with different versions
      # of language toolchains, use proto as a dynamic version manager
      # versus a reproducible language-specific flake.
      # Versions installed below will be latest stable from nixpkgs.

      # rust
      dioxus-cli
      rustup

      # typescript
      bun
      nodejs_22
      pnpm
      tailwindcss_4
      yarn-berry

      # go
      go

      # python
      dotnet-sdk_8 # for fable transpiler
      micromamba
      pixi
      poethepoet
      pydeps
      pylint
      pyright
      python
      ruff
      uv
    ]
    ++ lib.optionals pkgs.stdenv.isDarwin [
      mactop
    ];

  home.shellAliases = rec {
    b = "bat";
    bt = "btop";
    bm = "btm";
    bazel = "bazelisk";
    e = "nvim";
    dl = "aria2c -x 16 -s 16 -k 1M";
    dr = "docker container run --interactive --rm --tty";
    g = "git";
    ghe = "github_email";
    gbc = "git branch --sort=-committerdate | grep -v '^\*\|main' | fzf --multi | xargs git branch -d";
    gmach = "git machete";
    gu = "git machete traverse --fetch --start-from=first-root";
    gts = "check_github_token_scopes";
    i = "macchina";
    j = "just";
    k = "kubectl";
    kns = "kubectl config unset contexts.$(kubectl config current-context).namespace";
    ks = "kubens";
    kx = "kubectx";
    l = "ll";
    ld = "lazydocker";
    lg = "lazygit";
    nr = "nix run";
    p = "procs --tree";
    py = "poetry run python";
    rn = "fd -d 1 -t f '.*' | renamer";
    t = "tree";
    tls = "tmux ls";
    tns = "tmux new -s";
    tat = "tmux attach -t";
    tks = "tmux kill-session -t";
    tmh = "tmux list-keys | less";
    mm = "micromamba";
    nb = "nix build --json --no-link --print-build-logs";
    nix-hash = "get_nix_hash";
    s = "sesh connect \"$(sesh list -i | gum filter --limit 1 --placeholder 'Pick a sesh' --prompt='⚡')\"";
    y = "yazi";
    cfn = "cleanfn";
  };

  home.sessionVariables = {
    EDITOR = "nvim";
    LANG = "en_US.UTF-8";
    LC_ALL = "en_US.UTF-8";
    LC_CTYPE = "en_US.UTF-8";
  };

  fonts.fontconfig.enable = true;
  catppuccin.flavor = "mocha";
  catppuccin.enable = true;

  programs = {
    autojump.enable = false;
    bat.enable = true;
    btop.enable = true;
    direnv = {
      enable = true;
      nix-direnv.enable = true;
      config.global = {
        warn_timeout = "10m";
      };
    };
    fzf = {
      enable = true;
      tmux.enableShellIntegration = true;
    };
    htop.enable = true;
    jq.enable = true;
    lsd = {
      enable = true;
      enableAliases = true;
    };
    nix-index = {
      enable = true;
      enableZshIntegration = true;
    };
    nix-index-database.comma.enable = true;
    nnn = {
      enable = true;
      package = pkgs.nnn.override { withNerdIcons = true; };
      plugins = {
        mappings = {
          K = "preview-tui";
        };
        src = pkgs.nnn + "/plugins";
      };
    };
    zoxide.enable = true;

  };
}

{ pkgs, ... }:
let
  python = pkgs.python3.withPackages (ps: with ps; [ pip ]);
  dvcWithOptionalRemotes = pkgs.dvc.override {
    enableGoogle = true;
    enableAWS = true;
    enableAzure = true;
    enableSSH = true;
  };
in
{
  home.packages = with pkgs; [
    # unix tools
    coreutils-full
    fd
    findutils
    moreutils
    pipe-rename
    procps
    procs
    ripgrep
    rsync
    sd
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
    nixpkgs-fmt

    # publishing
    asciinema
    quarto
    svg2pdf

    # compute    
    argo
    argocd
    argocd-autopilot
    crane
    cue
    dive
    (google-cloud-sdk.withExtraComponents
      [
        google-cloud-sdk.components.gke-gcloud-auth-plugin
      ]
    )
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

    # db
    duckdb
    postgresql_16
    sqlite

    # dev
    act
    bazelisk
    dvcWithOptionalRemotes
    gh
    git-filter-repo
    graphite-cli
    graphviz
    just
    jqp
    lunarvim
    plantuml-c4
    pre-commit
    ratchet
    tmate
    yq

    # fonts
    cascadia-code
    (pkgs.nerdfonts.override { fonts = [ "Inconsolata" ]; })

    # python
    # conda-lock # not available in nixpkgs
    # hatch # broken on Darwin
    micromamba
    pixi
    poethepoet
    pydeps
    pylint
    pyright
    python
  ];

  home.shellAliases = rec {
    b = "btm";
    e = "lvim";
    dl = "aria2c -x 16 -s 16 -k 1M";
    dr = "docker container run --interactive --rm --tty";
    g = "git";
    ghe = "github_email";
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
    p = "procs --tree";
    py = "poetry run python";
    rn = "find ./ -maxdepth 1 -type f -name '*.*' | renamer";
    t = "tree";
    mm = "micromamba";
    nb = "nix build --json --no-link --print-build-logs";
    nix-hash = "get_nix_hash";
  };

  home.sessionVariables = {
    EDITOR = "lvim";
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
    fzf.enable = true;
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

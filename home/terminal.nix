{ pkgs, ... }:
let
  python = pkgs.python3.withPackages (ps: with ps; [ ]);
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
    coreutils
    fd
    ripgrep
    sd
    tree

    # io
    aria2
    curl
    rclone
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
    cue
    (google-cloud-sdk.withExtraComponents
      [
        google-cloud-sdk.components.gke-gcloud-auth-plugin
      ]
    )
    kind
    kubectl
    kubectx
    kubernetes-helm
    kustomize
    lazydocker
    terraform
    timoni

    # dev
    act
    bazelisk
    dvcWithOptionalRemotes
    gh
    graphite-cli
    graphviz
    just
    lunarvim
    plantuml-c4
    pre-commit
    ratchet
    tmate

    # fonts
    cascadia-code
    (pkgs.nerdfonts.override { fonts = [ "Inconsolata" ]; })

    # python
    # conda-lock # not available in nixpkgs
    # hatch # broken on Darwin
    micromamba
    poethepoet
    pydeps
    pylint
    pyright
    python
  ];

  home.shellAliases = rec {
    e = "lvim";
    dl = "aria2c -x 16 -s 16 -k 1M";
    dr = "docker container run --interactive --rm --tty";
    g = "git";
    j = "just";
    l = "ls";
    ld = "lazydocker";
    lg = "lazygit";
    t = "tree";
    mm = "micromamba";
    nb = "nix build --json --no-link --print-build-logs";
    nix-hash = "nix_hash_func";
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

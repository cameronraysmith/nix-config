{ pkgs, ... }:
# Platform-independent terminal setup
{
  home.packages = with pkgs; [
    # Unix tools
    coreutils
    fd
    ripgrep
    sd
    tree

    # IO
    aria2
    curl
    wget

    # Nix dev
    cachix
    nil
    nix-info
    nixpkgs-fmt

    # Publishing
    asciinema
    quarto

    # Compute    
    awscli2
    k9s
    kind
    kubectl
    lazydocker

    # Dev
    gh
    graphite-cli
    just
    lunarvim
    pre-commit
    ratchet
    tmate

    # Fonts
    cascadia-code
    (pkgs.nerdfonts.override { fonts = [ "Inconsolata" ]; })

    # Python
    micromamba
    python3
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

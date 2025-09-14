{
  pkgs,
  flake,
  config,
  lib,
  ...
}:
let
  package = pkgs.gitAndTools.git;
in
{
  programs.git = {
    inherit package;
    enable = true;
    userName = flake.config.me.fullname;
    userEmail = flake.config.me.email;
    signing = {
      key = "~/.ssh/id_ed25519.pub";
      format = "ssh";
      signByDefault = true;
    };

    lfs = {
      enable = true;
      skipSmudge = false;
    };

    extraConfig = {
      core.editor = "nvim";
      credential.helper = "store --file ~/.git-credentials";
      github.user = "cameronraysmith";
      color.ui = true;
      diff.colorMoved = "zebra";
      fetch.prune = true;
      format.signoff = true;
      init.defaultBranch = "main";
      merge.conflictstyle = "diff3";
      push = {
        autoSetupRemote = true;
        useForceIfIncludes = true;
      };
      rebase = {
        autoStash = true;
        updateRefs = true;
      };
      gpg.ssh.allowedSignersFile = "${config.home.homeDirectory}/.config/git/allowed_signers";
      log.showSignature = true; # --[no-]show-signature
    };

    aliases = {
      a = "add";
      br = "branch";
      bra = "branch -a";
      c = "commit";
      ca = "commit --amend";
      can = "commit --amend --no-edit";
      cavm = "commit -a -v -m";
      cfg = "config --list";
      cl = "clone";
      cm = "commit -m";
      co = "checkout";
      cp = "cherry-pick";
      cpx = "cherry-pick -x";
      d = "diff";
      f = "fetch";
      fo = "fetch origin";
      fu = "fetch upstream";
      lease = "push --force-with-lease";
      lol = "log --graph --decorate --pretty=oneline --abbrev-commit";
      lola = "log --graph --decorate --pretty=oneline --abbrev-commit --all";
      pl = "pull";
      pr = "pull -r";
      ps = "push";
      psf = "push -f";
      rb = "rebase";
      rbi = "rebase -i";
      r = "remote";
      ra = "remote add";
      rr = "remote rm";
      rv = "remote -v";
      rs = "remote show";
      st = "status";
      stn = "status -uno";
    };

    delta = {
      enable = true;
      options = {
        side-by-side = true;
      };
    };
    ignores = [
      "*~"
      "*.swp"
    ];
  };

  programs.lazygit = {
    enable = true;
    settings = {
      git = {
        overrideGpg = true;
        paging = {
          colorArg = "always";
          pager = "delta --color-only --dark --paging=never";
          useConfig = false;
        };
        commit = {
          signOff = true;
        };
      };
    };
  };

  home.file."${config.xdg.configHome}/git/allowed_signers".text = ''
    ${flake.config.me.email} namespaces="git" ${flake.config.me.sshKey}
  '';
}

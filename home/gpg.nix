{ lib, pkgs, ... }:
{
  services.gpg-agent = {
    enable = true;

    defaultCacheTtl = 600; # 10 minutes for normal cache
    maxCacheTtl = 7200; # 2 hours maximum cache lifetime

    pinentryPackage = pkgs.pinentry-tty;

    extraConfig = ''
    '';
  };

  programs.gpg = {
    enable = true;
  };
}


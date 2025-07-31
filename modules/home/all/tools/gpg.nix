{ lib, pkgs, ... }:
{
  services.gpg-agent = {
    enable = true;

    defaultCacheTtl = 43200; # 12 hours for normal cache
    maxCacheTtl = 86400; # 1 day maximum cache lifetime

    pinentry.package = pkgs.pinentry-tty;

    extraConfig = '''';
  };

  programs.gpg = {
    enable = true;
  };
}

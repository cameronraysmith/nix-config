{
  config,
  pkgs,
  ...
}:
{
  sops.secrets."BITWARDEN_EMAIL" = { };

  programs.rbw = {
    enable = true;
    settings = {
      email = builtins.readFile config.sops.secrets."BITWARDEN_EMAIL".path;
    };
  };
}

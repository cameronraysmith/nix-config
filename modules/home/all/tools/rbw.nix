{
  config,
  pkgs,
  self,
  ...
}:
{
  sops.secrets."BITWARDEN_EMAIL" = {
    sopsFile = "${self}/secrets/shared.yaml";
  };

  programs.rbw = {
    enable = true;
    settings = {
      email = builtins.readFile config.sops.secrets."BITWARDEN_EMAIL".path;
    };
  };
}

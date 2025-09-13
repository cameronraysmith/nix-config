{
  config,
  pkgs,
  lib,
  ...
}:
{
  sops.secrets."BITWARDEN_EMAIL" = { };

  # use sops template with overrides for rbw defaults
  sops.templates."rbw-config" = {
    content = builtins.toJSON {
      email = config.sops.placeholder."BITWARDEN_EMAIL";
      sso_id = null;
      base_url = null;
      identity_url = null;
      ui_url = null;
      notifications_url = null;
      lock_timeout = 3600;
      sync_interval = 3600;
      pinentry = "pinentry";
      client_cert_path = null;
    };

    path =
      if pkgs.stdenv.isDarwin then
        "${config.home.homeDirectory}/Library/Application Support/rbw/config.json"
      else
        "${config.xdg.configHome}/rbw/config.json";
  };

  programs.rbw = {
    enable = true;
    # nullify home-manager settings since we're using the sops template
    settings = null;
  };
}

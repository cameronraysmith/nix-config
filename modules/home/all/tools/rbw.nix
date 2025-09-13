{
  config,
  pkgs,
  lib,
  ...
}:
let
  xdgRuntimeDir =
    if pkgs.stdenv.isDarwin then
      # macOS: use a user-specific directory
      "${config.home.homeDirectory}/.local/run"
    else
      # linux: systemd-managed runtime dir
      "/run/user/\${UID}";
in
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
      lock_timeout = 86400;
      sync_interval = 900;
      pinentry = lib.getExe pkgs.pinentry-tty;
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

  # set XDG_RUNTIME_DIR and SSH_AUTH_SOCK for rbw-agent
  home.sessionVariables = lib.mkMerge [
    # set XDG_RUNTIME_DIR on macOS
    (lib.mkIf pkgs.stdenv.isDarwin {
      XDG_RUNTIME_DIR = xdgRuntimeDir;
    })
    # set SSH_AUTH_SOCK for rbw-agent on all platforms
    {
      SSH_AUTH_SOCK = "\${XDG_RUNTIME_DIR:-${xdgRuntimeDir}}/rbw/ssh-agent-socket";
    }
  ];

  # ensure the runtime directory exists on macOS
  home.activation.createRbwRuntimeDir = lib.mkIf pkgs.stdenv.isDarwin (
    lib.hm.dag.entryAfter [ "writeBoundary" ] ''
      $DRY_RUN_CMD mkdir -p "${xdgRuntimeDir}/rbw"
      $DRY_RUN_CMD chmod 700 "${xdgRuntimeDir}"
    ''
  );
}

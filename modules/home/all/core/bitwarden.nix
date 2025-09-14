{
  config,
  pkgs,
  lib,
  ...
}:
let
  # Check if bitwarden-desktop is in the user packages
  bitwardenEnabled = builtins.elem pkgs.bitwarden-desktop config.home.packages;
  socketPath = "${config.home.homeDirectory}/.bitwarden-ssh-agent.sock";
in
{
  # Set SSH_AUTH_SOCK for the bitwarden-desktop SSH agent
  # only if bitwarden-desktop is installed
  home.sessionVariables = lib.mkIf bitwardenEnabled {
    SSH_AUTH_SOCK = socketPath;
  };

  # Clean up stale socket on activation
  home.activation.cleanBitwardenSshSocket = lib.mkIf bitwardenEnabled (
    lib.hm.dag.entryAfter [ "writeBoundary" ] ''
      # Remove stale socket if it exists and is not active
      if [ -e "${socketPath}" ] && [ ! -S "${socketPath}" ]; then
        $DRY_RUN_CMD rm -f "${socketPath}"
      fi
    ''
  );
}

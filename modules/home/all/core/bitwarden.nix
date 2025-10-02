{
  config,
  pkgs,
  lib,
  ...
}:
let
  isDarwin = pkgs.stdenv.isDarwin;

  # On Darwin, bitwarden is installed via homebrew MAS and enabled by default
  # On NixOS, it's disabled by default to avoid circular dependencies
  # (checking config.home.packages would create infinite recursion)
  bitwardenEnabled = isDarwin;

  # Set socket paths for macOS MAS vs linux system
  # https://bitwarden.com/help/ssh-agent/#tab-macos-6VN1DmoAVFvm7ZWD95curS
  socketPath =
    if isDarwin then
      "${config.home.homeDirectory}/Library/Containers/com.bitwarden.desktop/Data/.bitwarden-ssh-agent.sock"
    else
      "${config.home.homeDirectory}/.bitwarden-ssh-agent.sock";
in
{
  # Set SSH_AUTH_SOCK for the Bitwarden SSH agent
  # https://bitwarden.com/help/ssh-agent/#configure-bitwarden-ssh-agent
  home.sessionVariables = lib.mkIf bitwardenEnabled {
    SSH_AUTH_SOCK = socketPath;
  };
}

{
  config,
  pkgs,
  lib,
  ...
}:
let
  isDarwin = pkgs.stdenv.isDarwin;

  # On Darwin, bitwarden is installed via homebrew MAS
  # On other platforms, check if bitwarden-desktop is in packages
  bitwardenEnabled =
    if isDarwin then
      true # TODO: check if bitwarden is installed via homebrew MAS
    else
      builtins.elem pkgs.bitwarden-desktop config.home.packages;

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

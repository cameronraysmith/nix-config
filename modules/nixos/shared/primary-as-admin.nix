# Make flake.config.me the admin of the machine
{
  flake,
  pkgs,
  lib,
  ...
}:

{
  # Login via SSH with SSH key
  users.users =
    let
      me = flake.config.me;
      myKeys = [
        me.sshKey
      ];
    in
    {
      root.openssh.authorizedKeys.keys = myKeys;
      ${me.username} =
        {
          openssh.authorizedKeys.keys = myKeys;
          shell = pkgs.zsh;
        }
        // lib.optionalAttrs pkgs.stdenv.isLinux {
          isNormalUser = true;
          extraGroups = [ "wheel" ];
        };
    };

  programs.zsh.enable = lib.mkIf pkgs.stdenv.isLinux true;

  # Make 'me' a sudoer without password
  security = lib.optionalAttrs pkgs.stdenv.isLinux {
    sudo.execWheelOnly = true;
    sudo.wheelNeedsPassword = false;
  };
}

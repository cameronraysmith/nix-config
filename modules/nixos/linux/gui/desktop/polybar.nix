{ config, pkgs, ... }:

{
  systemd.user.services.polybar = {
    enable = true;
    description = "Polybar";
    wantedBy = [ "graphical-session.target" ];
    serviceConfig = {
      ExecStart = "${pkgs.polybar}/bin/polybar -c /etc/nixos/nixos/desktop/polybar example";
      Restart = "on-abnormal";
    };
  };

  environment.systemPackages = [ pkgs.polybar ];

  fonts = {
    fonts = with pkgs; [
      siji
    ];
  };

}

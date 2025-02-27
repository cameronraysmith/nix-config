{ config, pkgs, ... }:

{
  environment.systemPackages = with pkgs; [
    xorg.xdpyinfo
    xorg.xrandr
    arandr
    autorandr

    dmenu
    gmrun
    dzen2
  ];

  services.xserver = {
    enable = true;
    windowManager.xmonad = {
      enable = true;
      haskellPackages = pkgs.haskellPackages.extend (
        import "${myXmonadProject}/overlay.nix" { inherit pkgs; }
      );
      extraPackages =
        hpkgs: with pkgs.haskell.lib; [
          hpkgs.xmonad-contrib
          hpkgs.xmonad-extras
        ];
      enableContribAndExtras = true;
    };
  };
  services.xserver.displayManager.defaultSession = "none+xmonad";
}

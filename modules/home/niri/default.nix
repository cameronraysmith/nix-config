{ inputs, ... }:
{
  flake.modules.homeManager.niri =
    { config, lib, ... }:
    {
      imports = [ inputs.niri-flake.homeModules.config ];

      programs.niri.settings = {
        input = {
          # logind also ignores this key on pyrite; neither handler may suspend it.
          power-key-handling.enable = false;
          touchpad = {
            tap = true;
            natural-scroll = true;
          };
        };

        # No includes or idle daemon; no shell/locker or X11 satellite in slice A.
        binds = with config.lib.niri.actions; {
          "Mod+Return".action = spawn (lib.getExe config.programs.ghostty.package);
          "Mod+Q".action = close-window;
          "Mod+Left".action = focus-column-left;
          "Mod+Right".action = focus-column-right;
          "Mod+Up".action = focus-window-up;
          "Mod+Down".action = focus-window-down;
          "Mod+Shift+Left".action = move-column-left;
          "Mod+Shift+Right".action = move-column-right;
          "Mod+Shift+Up".action = move-window-up;
          "Mod+Shift+Down".action = move-window-down;
          "Mod+Page_Up".action = focus-workspace-up;
          "Mod+Page_Down".action = focus-workspace-down;
          "Mod+Shift+Page_Up".action = move-window-to-workspace-up;
          "Mod+Shift+Page_Down".action = move-window-to-workspace-down;
          "Mod+Shift+E".action = quit;
        };
      };
    };
}

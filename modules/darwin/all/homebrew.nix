{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.custom.homebrew;

  # Core GUI applications managed via homebrew casks
  baseCaskApps = [
    "aldente"
    "alt-tab"
    "betterdisplay"
    "ghostty"
    "neohtop"
    "orbstack"
    "raindropio"
    "raycast"
    "skim"
    "soundsource"
    "stats"
    "tailscale-app"
    "tableplus"
    "visual-studio-code"
    "wezterm@nightly"
    "zed"
    "zen"
  ];

  # Mac App Store applications (ID mapping)
  baseMasApps = {
    bitwarden = 1352778147;
    whatsapp = 310633997;
  };

  # Font packages via homebrew cask
  caskFonts = map (name: "font-${name}") [
    "cascadia-code"
    "cascadia-code-nf"
    "fira-code"
    "fira-code-nerd-font"
    "geist"
    "geist-mono"
    "inter"
    "jetbrains-mono"
    "jetbrains-mono-nerd-font"
    "monaspace"
    "roboto"
    "roboto-mono"
    "ubuntu"
    "ubuntu-mono"
  ];
in
{
  options.custom.homebrew = {
    enable = lib.mkEnableOption "homebrew package management";

    additionalCasks = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      description = "Additional cask applications to install";
    };

    additionalMasApps = lib.mkOption {
      type = lib.types.attrsOf lib.types.int;
      default = { };
      description = "Additional Mac App Store apps to install";
    };

    manageFonts = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to manage fonts via homebrew casks";
    };
  };

  config = lib.mkIf cfg.enable {
    homebrew = {
      enable = true;

      global = {
        autoUpdate = true;
      };

      onActivation = {
        autoUpdate = true;
        upgrade = true;
        # https://nix-darwin.github.io/nix-darwin/manual/#opt-homebrew.onActivation.cleanup
        # TODO: set to "uninstall" after Brewfile generation is complete
        cleanup = "none";
      };

      taps = [ ];
      brews = [ ];

      casks = baseCaskApps ++ cfg.additionalCasks ++ (lib.optionals cfg.manageFonts caskFonts);

      masApps = baseMasApps // cfg.additionalMasApps;
    };
  };
}

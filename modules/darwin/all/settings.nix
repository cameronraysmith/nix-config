{
  config,
  lib,
  pkgs,
  ...
}:

{
  system.defaults = {
    # Custom User Preferences for specific applications
    CustomUserPreferences = {
      NSGlobalDomain = {
        NSCloseAlwaysConfirmsChanges = false;
        AppleSpacesSwitchOnActivate = true;
      };
      "com.apple.Music" = {
        userWantsPlaybackNotifications = false;
      };
      "com.apple.ActivityMonitor" = {
        UpdatePeriod = 1;
      };
      "com.apple.TextEdit" = {
        SmartQuotes = false;
        RichText = false;
      };
      "com.apple.spaces" = {
        "spans-displays" = false;
      };
      "com.apple.menuextra.clock" = {
        DateFormat = "EEE d MMM HH:mm:ss";
        FlashDateSeparators = false;
      };
    };

    # Dock settings
    dock = {
      appswitcher-all-displays = true;
      autohide = true;
      autohide-delay = 0.0;
      autohide-time-modifier = 0.15;
      dashboard-in-overlay = false;
      enable-spring-load-actions-on-all-items = false;
      expose-animation-duration = 0.1;
      expose-group-apps = true;
      launchanim = true;
      mineffect = "scale";
      minimize-to-application = false;
      mouse-over-hilite-stack = true;
      mru-spaces = false;
      orientation = "bottom";
      show-process-indicators = true;
      show-recents = true;
      showhidden = true;
      static-only = false;
      tilesize = 48;
      # Hot corners (1 = disabled)
      wvous-bl-corner = 1;
      wvous-br-corner = 5;
      wvous-tl-corner = 1;
      wvous-tr-corner = 1;
      # TODO: add persistent-apps config to module to allow per-machine customization
      persistent-apps = [
        "/Applications/NeoHtop.app"
        "/Applications/Ghostty.app"
        "/Applications/Fork.app"
        "/Applications/Zed.app"
        "/Applications/Helium.app"
        "/Applications/Visual Studio Code.app"
        "/Applications/Zen.app"
        "/Applications/Raindrop.io.app"
        "/Applications/Skim.app"
        "/Applications/Preview.app"
        "/Applications/calibre.app"
        "/Applications/Zotero.app"
        "/Applications/Cyberduck.app"
        "/Applications/TablePlus.app"
        "/Applications/DBeaver.app"
        "/Applications/Codelayer-Nightly.app"
        "/Applications/Claude.app"
        "/Applications/Logseq.app"
        "/Applications/Bitwarden.app"
        "/Applications/OrbStack.app"
        "/Applications/OBS.app"
        "/Applications/Discord.app"
        "/Applications/zoom.us.app"
        "/Applications/WhatsApp.app"
        "/Applications/Slack.app"
        "/Applications/Utilities/Audio MIDI Setup.app"
        "/System/Applications/System Settings.app"
      ];
    };

    # Finder settings
    finder = {
      _FXShowPosixPathInTitle = false;
      _FXSortFoldersFirst = false;
      AppleShowAllExtensions = true;
      AppleShowAllFiles = false;
      CreateDesktop = true;
      FXDefaultSearchScope = "SCcf"; # Search current folder
      FXEnableExtensionChangeWarning = false;
      FXPreferredViewStyle = "Nlsv"; # List view
      QuitMenuItem = false;
      ShowPathbar = true;
      ShowStatusBar = false;
    };

    # Login window settings
    loginwindow = {
      autoLoginUser = null;
      DisableConsoleAccess = false;
      GuestEnabled = false;
      LoginwindowText = null;
      PowerOffDisabledWhileLoggedIn = false;
      RestartDisabled = false;
      RestartDisabledWhileLoggedIn = false;
      SHOWFULLNAME = false;
      ShutDownDisabled = false;
      ShutDownDisabledWhileLoggedIn = false;
      SleepDisabled = false;
    };

    # Magic Mouse settings
    magicmouse = {
      MouseButtonMode = "OneButton";
    };

    # Screenshot settings
    screencapture = {
      disable-shadow = true;
      location = "~/Downloads";
      show-thumbnail = true;
      type = "png";
      target = "file";
    };

    # SMB settings
    smb = {
      NetBIOSName = null;
      ServerDescription = null;
    };

    # Spaces settings
    spaces = {
      spans-displays = false;
    };

    # Trackpad settings
    trackpad = {
      ActuationStrength = 1;
      Clicking = true;
      Dragging = true;
      FirstClickThreshold = 1;
      SecondClickThreshold = 2;
      TrackpadRightClick = true;
      TrackpadThreeFingerDrag = false;
      TrackpadThreeFingerTapGesture = 0;
    };

    # Universal Access settings
    # NOTE: domain write permission failure during build
    # Could not write domain com.apple.universalaccess;
    # universalaccess = {
    #   closeViewScrollWheelToggle = false;
    #   closeViewZoomFollowsFocus = false;
    #   reduceTransparency = false;
    #   mouseDriverCursorSize = 1.0;
    # };

    # Software Update settings
    SoftwareUpdate = {
      AutomaticallyInstallMacOSUpdates = false;
    };

    # Launch Services settings
    LaunchServices = {
      LSQuarantine = true;
    };

    # Window Manager (Stage Manager) settings
    WindowManager = {
      AppWindowGroupingBehavior = true;
      AutoHide = false;
      EnableStandardClickToShowDesktop = false;
      EnableTiledWindowMargins = false;
      GloballyEnabled = false;
      HideDesktop = false;
      StageManagerHideWidgets = false;
      StandardHideDesktopIcons = false;
      StandardHideWidgets = false;
    };

    # Global preferences
    ".GlobalPreferences" = {
      "com.apple.mouse.scaling" = null;
      "com.apple.sound.beep.sound" = null;
    };

    # NSGlobalDomain settings (system-wide preferences)
    NSGlobalDomain = {
      _HIHideMenuBar = true;
      "com.apple.keyboard.fnState" = false;
      "com.apple.mouse.tapBehavior" = 1;
      "com.apple.sound.beep.feedback" = 0;
      "com.apple.sound.beep.volume" = 0.0;
      "com.apple.springing.delay" = 1.0;
      "com.apple.springing.enabled" = null;
      "com.apple.swipescrolldirection" = false;
      "com.apple.trackpad.enableSecondaryClick" = true;
      "com.apple.trackpad.forceClick" = false;
      "com.apple.trackpad.scaling" = null;
      "com.apple.trackpad.trackpadCornerClickBehavior" = null;
      AppleEnableMouseSwipeNavigateWithScrolls = true;
      AppleEnableSwipeNavigateWithScrolls = true;
      AppleFontSmoothing = null;
      AppleICUForce24HourTime = false;
      AppleInterfaceStyle = "Dark";
      AppleInterfaceStyleSwitchesAutomatically = false;
      AppleKeyboardUIMode = null;
      AppleMeasurementUnits = "Inches";
      AppleMetricUnits = 0;
      ApplePressAndHoldEnabled = false;
      AppleScrollerPagingBehavior = true;
      AppleShowAllExtensions = true;
      AppleShowAllFiles = false;
      AppleShowScrollBars = "WhenScrolling";
      AppleSpacesSwitchOnActivate = true;
      AppleTemperatureUnit = "Fahrenheit";
      AppleWindowTabbingMode = "always";
      InitialKeyRepeat = 15; # slider values: 120, 94, 68, 35, 25, 15
      KeyRepeat = 2; # slider values: 120, 90, 60, 30, 12, 6, 2
      NSAutomaticCapitalizationEnabled = false;
      NSAutomaticDashSubstitutionEnabled = false;
      NSAutomaticPeriodSubstitutionEnabled = false;
      NSAutomaticQuoteSubstitutionEnabled = false;
      NSAutomaticSpellingCorrectionEnabled = false;
      NSAutomaticWindowAnimationsEnabled = true;
      NSDisableAutomaticTermination = null;
      NSDocumentSaveNewDocumentsToCloud = false;
      NSNavPanelExpandedStateForSaveMode = true;
      NSNavPanelExpandedStateForSaveMode2 = true;
      NSScrollAnimationEnabled = true;
      NSTableViewDefaultSizeMode = 2;
      NSTextShowsControlCharacters = false;
      NSUseAnimatedFocusRing = true;
      NSWindowResizeTime = 2.0e-2;
      PMPrintingExpandedStateForPrint = true;
      PMPrintingExpandedStateForPrint2 = true;
    };
  };

  # System startup settings
  system.startup = {
    chime = false;
  };
}

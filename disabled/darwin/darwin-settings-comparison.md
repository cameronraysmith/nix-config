# Darwin Settings Comparison Report

This report compares your current macOS settings with what will be applied by the new `modules/darwin/all/settings.nix` configuration.

## Key Changes That Will Be Applied

### 🔴 Settings That Will Change

These settings currently differ from what the Nix configuration will apply:

#### Dock
- **autohide-delay**: Currently `<not set>` → Will be `0.0` (instant dock appearance)
- **autohide-time-modifier**: Currently `<not set>` → Will be `0.15` (faster animation)
- **mineffect**: Currently `scale` → Will be `genie` (different minimize animation)
- **wvous-br-corner**: Currently `5` (Start Screen Saver) → Will be `1` (disabled)

#### Finder
- **_FXSortFoldersFirst**: Currently `0` → Will be `true` (folders will appear first)
- **FXPreferredViewStyle**: Currently `Nlsv` (list view) → Will be `clmv` (column view)

#### Mouse
- **MouseButtonMode**: Currently `OneButton` → Will be `TwoButton` (enables right-click)

#### Trackpad
- **Dragging**: Currently `0` → Will be `true` (enable dragging)
- **TrackpadThreeFingerDrag**: Currently `0` → Will be `true` (enable three-finger drag)

#### Screenshot
- **location**: Currently `~/Dropbox (Personal)/Apps/Overleaf/slides-t32-03032025/fig/reproducibility` → Will be `~/Downloads`
- **show-thumbnail**: Currently `0` → Will be `true` (show thumbnail after capture)

#### NSGlobalDomain
- **_HIHideMenuBar**: Currently `1` (hidden) → Will be `false` (always visible)
- **com.apple.swipescrolldirection**: Currently `0` → Will be `true` (natural scrolling)
- **AppleMeasurementUnits**: Currently `Inches` → Will be `Centimeters`
- **AppleMetricUnits**: Currently `0` → Will be `1` (metric)
- **AppleTemperatureUnit**: Currently `Fahrenheit` → Will be `Celsius`
- **NSAutomaticDashSubstitutionEnabled**: Currently `1` → Will be `false` (disable auto dash)
- **NSAutomaticQuoteSubstitutionEnabled**: Currently `1` → Will be `false` (disable smart quotes)

#### System Startup
- **chime**: Currently `true` → Will be `false` (no startup sound)

### ✅ Settings That Match Current Configuration

These are already set as the Nix configuration will apply:

- Dock autohide: Already enabled
- Dark mode: Already enabled
- Key repeat settings: Already fast (15/2)
- Show all extensions: Already enabled
- Window tabbing: Already set to "always"
- Finder path bar: Already shown
- Tap to click: Already enabled

### ⚠️ New Settings That Will Be Configured

These settings are currently not set but will be configured:

- **AppleICUForce24HourTime**: Will be `true` (24-hour time format)
- **ApplePressAndHoldEnabled**: Will be `false` (disable press-and-hold for accents)
- **NSDocumentSaveNewDocumentsToCloud**: Will be `false` (don't save to iCloud by default)
- **NSNavPanelExpandedStateForSaveMode**: Will be `true` (expanded save dialogs)
- **AutomaticallyInstallMacOSUpdates**: Will be `true` (auto-install updates)

## Summary

**Total settings in configuration**: ~100+
**Settings that will change**: 18
**Settings already matching**: 12
**New settings to be applied**: 15+

## Recommendations

1. **Backup Current Preferences**: The most significant changes affect:
   - Natural scrolling direction (will be enabled)
   - Menu bar visibility (will be always visible)
   - Units (will switch to metric)
   - Three-finger drag (will be enabled)

2. **Screenshot Location**: Your custom screenshot location will be reset to `~/Downloads`. You may want to override this in your per-machine configuration if you prefer the current location.

3. **View Preferences**: Finder will switch from list view to column view by default.

## How to Apply

To apply these settings:
```bash
darwin-rebuild switch --flake .
```

To test without applying:
```bash
darwin-rebuild check --flake .
```

## Customization

If you want to keep certain settings as they are, you can override them in your machine-specific configuration files in `configurations/darwin/`.
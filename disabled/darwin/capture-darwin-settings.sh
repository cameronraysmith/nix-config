#!/usr/bin/env bash

# Script to capture current macOS system settings
# Corresponds to the settings defined in modules/darwin/all/settings.nix

set -euo pipefail

OUTPUT_FILE="${1:-current-darwin-settings.txt}"

echo "Capturing current Darwin settings to $OUTPUT_FILE..."
echo "================================================" > "$OUTPUT_FILE"
echo "Current macOS System Settings" >> "$OUTPUT_FILE"
echo "Generated on: $(date)" >> "$OUTPUT_FILE"
echo "================================================" >> "$OUTPUT_FILE"
echo "" >> "$OUTPUT_FILE"

# Function to safely read a default value
read_default() {
    local domain="$1"
    local key="$2"
    local result
    if result=$(defaults read "$domain" "$key" 2>/dev/null); then
        echo "$result"
    else
        echo "<not set>"
    fi
}

# Function to read and format a setting
capture_setting() {
    local category="$1"
    local domain="$2"
    local key="$3"
    local description="${4:-}"
    local value
    value=$(read_default "$domain" "$key")
    echo "[$category] $key = $value ${description:+(${description})}" >> "$OUTPUT_FILE"
}

echo "## CustomUserPreferences" >> "$OUTPUT_FILE"
echo "------------------------" >> "$OUTPUT_FILE"

# NSGlobalDomain CustomUserPreferences
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSCloseAlwaysConfirmsChanges" "Confirm changes when closing documents"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleSpacesSwitchOnActivate" "Switch to Space with open windows for app"

# Application-specific preferences
capture_setting "com.apple.Music" "com.apple.Music" "userWantsPlaybackNotifications" "Music playback notifications"
capture_setting "com.apple.ActivityMonitor" "com.apple.ActivityMonitor" "UpdatePeriod" "Update frequency"
capture_setting "com.apple.TextEdit" "com.apple.TextEdit" "SmartQuotes" "Smart quotes"
capture_setting "com.apple.TextEdit" "com.apple.TextEdit" "RichText" "Rich text mode"
capture_setting "com.apple.spaces" "com.apple.spaces" "spans-displays" "Each space spans displays"
capture_setting "com.apple.menuextra.clock" "com.apple.menuextra.clock" "DateFormat" "Clock date format"
capture_setting "com.apple.menuextra.clock" "com.apple.menuextra.clock" "FlashDateSeparators" "Flash date separators"

echo "" >> "$OUTPUT_FILE"
echo "## Dock Settings" >> "$OUTPUT_FILE"
echo "----------------" >> "$OUTPUT_FILE"

# Dock settings
capture_setting "Dock" "com.apple.dock" "appswitcher-all-displays" "Show app switcher on all displays"
capture_setting "Dock" "com.apple.dock" "autohide" "Auto-hide dock"
capture_setting "Dock" "com.apple.dock" "autohide-delay" "Auto-hide delay"
capture_setting "Dock" "com.apple.dock" "autohide-time-modifier" "Auto-hide animation duration"
capture_setting "Dock" "com.apple.dock" "dashboard-in-overlay" "Dashboard as overlay"
capture_setting "Dock" "com.apple.dock" "enable-spring-load-actions-on-all-items" "Spring loading for all items"
capture_setting "Dock" "com.apple.dock" "expose-animation-duration" "Mission Control animation duration"
capture_setting "Dock" "com.apple.dock" "expose-group-apps" "Group windows by application"
capture_setting "Dock" "com.apple.dock" "launchanim" "Launch animation"
capture_setting "Dock" "com.apple.dock" "mineffect" "Minimize effect"
capture_setting "Dock" "com.apple.dock" "minimize-to-application" "Minimize to application icon"
capture_setting "Dock" "com.apple.dock" "mouse-over-hilite-stack" "Highlight stack items on hover"
capture_setting "Dock" "com.apple.dock" "mru-spaces" "Rearrange spaces based on use"
capture_setting "Dock" "com.apple.dock" "orientation" "Dock position"
capture_setting "Dock" "com.apple.dock" "show-process-indicators" "Show indicators for open apps"
capture_setting "Dock" "com.apple.dock" "show-recents" "Show recent apps"
capture_setting "Dock" "com.apple.dock" "showhidden" "Show hidden apps"
capture_setting "Dock" "com.apple.dock" "static-only" "Show only open apps"
capture_setting "Dock" "com.apple.dock" "tilesize" "Icon size"

# Hot corners
capture_setting "Dock" "com.apple.dock" "wvous-bl-corner" "Bottom-left hot corner"
capture_setting "Dock" "com.apple.dock" "wvous-br-corner" "Bottom-right hot corner"
capture_setting "Dock" "com.apple.dock" "wvous-tl-corner" "Top-left hot corner"
capture_setting "Dock" "com.apple.dock" "wvous-tr-corner" "Top-right hot corner"

echo "" >> "$OUTPUT_FILE"
echo "## Finder Settings" >> "$OUTPUT_FILE"
echo "------------------" >> "$OUTPUT_FILE"

# Finder settings
capture_setting "Finder" "com.apple.finder" "_FXShowPosixPathInTitle" "Show POSIX path in title"
capture_setting "Finder" "com.apple.finder" "_FXSortFoldersFirst" "Keep folders on top"
capture_setting "Finder" "com.apple.finder" "AppleShowAllExtensions" "Show all file extensions"
capture_setting "Finder" "com.apple.finder" "AppleShowAllFiles" "Show hidden files"
capture_setting "Finder" "com.apple.finder" "CreateDesktop" "Show items on desktop"
capture_setting "Finder" "com.apple.finder" "FXDefaultSearchScope" "Default search scope"
capture_setting "Finder" "com.apple.finder" "FXEnableExtensionChangeWarning" "Warn when changing extension"
capture_setting "Finder" "com.apple.finder" "FXPreferredViewStyle" "Preferred view style"
capture_setting "Finder" "com.apple.finder" "QuitMenuItem" "Allow quitting Finder"
capture_setting "Finder" "com.apple.finder" "ShowPathbar" "Show path bar"
capture_setting "Finder" "com.apple.finder" "ShowStatusBar" "Show status bar"

echo "" >> "$OUTPUT_FILE"
echo "## Login Window Settings" >> "$OUTPUT_FILE"
echo "------------------------" >> "$OUTPUT_FILE"

# Login window settings
capture_setting "LoginWindow" "com.apple.loginwindow" "autoLoginUser" "Auto-login user"
capture_setting "LoginWindow" "com.apple.loginwindow" "DisableConsoleAccess" "Disable console access"
capture_setting "LoginWindow" "com.apple.loginwindow" "GuestEnabled" "Guest account enabled"
capture_setting "LoginWindow" "com.apple.loginwindow" "LoginwindowText" "Login window text"
capture_setting "LoginWindow" "com.apple.loginwindow" "PowerOffDisabledWhileLoggedIn" "Disable power off when logged in"
capture_setting "LoginWindow" "com.apple.loginwindow" "RestartDisabled" "Disable restart"
capture_setting "LoginWindow" "com.apple.loginwindow" "RestartDisabledWhileLoggedIn" "Disable restart when logged in"
capture_setting "LoginWindow" "com.apple.loginwindow" "SHOWFULLNAME" "Show full name"
capture_setting "LoginWindow" "com.apple.loginwindow" "ShutDownDisabled" "Disable shut down"
capture_setting "LoginWindow" "com.apple.loginwindow" "ShutDownDisabledWhileLoggedIn" "Disable shut down when logged in"
capture_setting "LoginWindow" "com.apple.loginwindow" "SleepDisabled" "Disable sleep"

echo "" >> "$OUTPUT_FILE"
echo "## Mouse & Trackpad Settings" >> "$OUTPUT_FILE"
echo "----------------------------" >> "$OUTPUT_FILE"

# Mouse settings
capture_setting "Mouse" "com.apple.driver.AppleHIDMouse" "Button2" "Secondary click"
capture_setting "Mouse" "com.apple.driver.AppleBluetoothMultitouch.mouse" "MouseButtonMode" "Mouse button mode"

# Trackpad settings
capture_setting "Trackpad" "com.apple.AppleMultitouchTrackpad" "ActuationStrength" "Click pressure"
capture_setting "Trackpad" "com.apple.AppleMultitouchTrackpad" "Clicking" "Tap to click"
capture_setting "Trackpad" "com.apple.AppleMultitouchTrackpad" "Dragging" "Dragging"
capture_setting "Trackpad" "com.apple.AppleMultitouchTrackpad" "FirstClickThreshold" "First click threshold"
capture_setting "Trackpad" "com.apple.AppleMultitouchTrackpad" "SecondClickThreshold" "Second click threshold"
capture_setting "Trackpad" "com.apple.AppleMultitouchTrackpad" "TrackpadRightClick" "Right click"
capture_setting "Trackpad" "com.apple.AppleMultitouchTrackpad" "TrackpadThreeFingerDrag" "Three finger drag"
capture_setting "Trackpad" "com.apple.AppleMultitouchTrackpad" "TrackpadThreeFingerTapGesture" "Three finger tap"

echo "" >> "$OUTPUT_FILE"
echo "## Screenshot Settings" >> "$OUTPUT_FILE"
echo "----------------------" >> "$OUTPUT_FILE"

# Screenshot settings
capture_setting "Screenshot" "com.apple.screencapture" "disable-shadow" "Disable shadow"
capture_setting "Screenshot" "com.apple.screencapture" "location" "Save location"
capture_setting "Screenshot" "com.apple.screencapture" "show-thumbnail" "Show thumbnail"
capture_setting "Screenshot" "com.apple.screencapture" "type" "File type"
capture_setting "Screenshot" "com.apple.screencapture" "target" "Capture target"

echo "" >> "$OUTPUT_FILE"
echo "## Spaces Settings" >> "$OUTPUT_FILE"
echo "------------------" >> "$OUTPUT_FILE"

capture_setting "Spaces" "com.apple.spaces" "spans-displays" "Displays have separate Spaces"

echo "" >> "$OUTPUT_FILE"
echo "## Universal Access Settings" >> "$OUTPUT_FILE"
echo "----------------------------" >> "$OUTPUT_FILE"

capture_setting "UniversalAccess" "com.apple.universalaccess" "closeViewScrollWheelToggle" "Zoom with scroll wheel"
capture_setting "UniversalAccess" "com.apple.universalaccess" "closeViewZoomFollowsFocus" "Zoom follows focus"
capture_setting "UniversalAccess" "com.apple.universalaccess" "reduceTransparency" "Reduce transparency"
capture_setting "UniversalAccess" "com.apple.universalaccess" "mouseDriverCursorSize" "Cursor size"

echo "" >> "$OUTPUT_FILE"
echo "## Software Update Settings" >> "$OUTPUT_FILE"
echo "---------------------------" >> "$OUTPUT_FILE"

capture_setting "SoftwareUpdate" "com.apple.SoftwareUpdate" "AutomaticallyInstallMacOSUpdates" "Auto-install macOS updates"

echo "" >> "$OUTPUT_FILE"
echo "## NSGlobalDomain Settings" >> "$OUTPUT_FILE"
echo "--------------------------" >> "$OUTPUT_FILE"

# NSGlobalDomain settings
capture_setting "NSGlobalDomain" "NSGlobalDomain" "_HIHideMenuBar" "Auto-hide menu bar"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "com.apple.keyboard.fnState" "Function key behavior"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "com.apple.mouse.tapBehavior" "Mouse tap behavior"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "com.apple.sound.beep.feedback" "Sound feedback"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "com.apple.sound.beep.volume" "Beep volume"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "com.apple.springing.delay" "Spring loading delay"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "com.apple.springing.enabled" "Spring loading enabled"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "com.apple.swipescrolldirection" "Natural scrolling"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "com.apple.trackpad.enableSecondaryClick" "Secondary click"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "com.apple.trackpad.forceClick" "Force click"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "com.apple.trackpad.scaling" "Tracking speed"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleEnableMouseSwipeNavigateWithScrolls" "Swipe to navigate (mouse)"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleEnableSwipeNavigateWithScrolls" "Swipe to navigate"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleFontSmoothing" "Font smoothing"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleICUForce24HourTime" "24-hour time"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleInterfaceStyle" "Interface style"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleInterfaceStyleSwitchesAutomatically" "Auto dark mode"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleKeyboardUIMode" "Keyboard UI mode"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleMeasurementUnits" "Measurement units"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleMetricUnits" "Metric units"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "ApplePressAndHoldEnabled" "Press and hold for accents"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleScrollerPagingBehavior" "Click in scroll bar behavior"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleShowAllExtensions" "Show all extensions"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleShowAllFiles" "Show all files"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleShowScrollBars" "Show scroll bars"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleSpacesSwitchOnActivate" "Switch to Space with windows"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleTemperatureUnit" "Temperature unit"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "AppleWindowTabbingMode" "Window tabbing mode"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "InitialKeyRepeat" "Initial key repeat delay"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "KeyRepeat" "Key repeat rate"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSAutomaticCapitalizationEnabled" "Auto capitalization"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSAutomaticDashSubstitutionEnabled" "Auto dash substitution"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSAutomaticPeriodSubstitutionEnabled" "Auto period substitution"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSAutomaticQuoteSubstitutionEnabled" "Smart quotes"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSAutomaticSpellingCorrectionEnabled" "Auto spelling correction"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSAutomaticWindowAnimationsEnabled" "Window animations"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSDisableAutomaticTermination" "Disable auto termination"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSDocumentSaveNewDocumentsToCloud" "Save to iCloud by default"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSNavPanelExpandedStateForSaveMode" "Expanded save panel"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSNavPanelExpandedStateForSaveMode2" "Expanded save panel 2"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSScrollAnimationEnabled" "Smooth scrolling"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSTableViewDefaultSizeMode" "Table view size mode"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSTextShowsControlCharacters" "Show control characters"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSUseAnimatedFocusRing" "Animated focus ring"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "NSWindowResizeTime" "Window resize time"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "PMPrintingExpandedStateForPrint" "Expanded print panel"
capture_setting "NSGlobalDomain" "NSGlobalDomain" "PMPrintingExpandedStateForPrint2" "Expanded print panel 2"

echo "" >> "$OUTPUT_FILE"
echo "## System Startup Settings" >> "$OUTPUT_FILE"
echo "--------------------------" >> "$OUTPUT_FILE"

# Check if startup chime is enabled (requires different method)
if nvram StartupMute 2>/dev/null | grep -q "%01"; then
    echo "[Startup] chime = false (muted)" >> "$OUTPUT_FILE"
else
    echo "[Startup] chime = true (enabled)" >> "$OUTPUT_FILE"
fi

echo "" >> "$OUTPUT_FILE"
echo "================================================" >> "$OUTPUT_FILE"
echo "Capture complete! Settings saved to $OUTPUT_FILE" >> "$OUTPUT_FILE"
echo "================================================" >> "$OUTPUT_FILE"

echo "Settings captured successfully to $OUTPUT_FILE"
echo ""
echo "Note: Some settings may show '<not set>' if they haven't been configured"
echo "or if they require admin privileges to read."
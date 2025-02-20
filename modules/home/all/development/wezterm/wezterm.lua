return {
  font = wezterm.font("Monaspace Neon"),
  color_scheme = 'Catppuccin Mocha',
  window_decorations = 'RESIZE',
  keys = {
    -- Emulate other programs (Zed, VSCode, ...)
    {
      key = 'P',
      mods = 'CMD|SHIFT',
      action = wezterm.action.ActivateCommandPalette,
    },
  },
  -- Workaround for https://github.com/NixOS/nixpkgs/issues/336069#issuecomment-2299008280
  -- front_end = "WebGpu"
}

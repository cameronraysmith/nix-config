# https://github.com/nix-community/home-manager/blob/master/modules/programs/zed-editor.nix
{
  programs.zed-editor = {
    enable = true;
    package = null;

    # https://github.com/zed-industries/extensions/tree/main/extensions
    extensions = [
      "just"
      "catppuccin"
      "catppuccin-icons"
      "nix"
      "rainbow-csv"
      "toml"
    ];

    # userKeymaps = {
    #   context = "Workspace";
    #   bindings = {
    #     ctrl-tab = "tab_switcher::ToggleAll";
    #   };
    # };
    #
    # [
    #   {
    #     "context": "Workspace",
    #     "bindings": {
    #       "ctrl-tab": "tab_switcher::ToggleAll"
    #     }
    #   }
    # ]

    userSettings = {
      vim_mode = true;
      base_keymap = "VSCode";
      soft_wrap = "editor_width";
      tab_size = 2;
      file_types = {
        Markdown = [ "qmd" ];
      };

      load_direnv = "shell_hook";
      languages.Nix.language_servers = [
        "nixd"
        "!nil"
      ];

      ui_font_size = 16;
      ui_font_family = "Cascadia Code";
      buffer_font_size = 14;
      icon_theme = "Catppuccin Mocha";

      theme = {
        mode = "system";
        light = "Catppuccin Mocha";
        dark = "Catppuccin Mocha";
      };

      outline_panel = {
        dock = "left";
      };
      project_panel = {
        dock = "right";
      };
      tab_bar = {
        show = false;
      };
    };
  };
}

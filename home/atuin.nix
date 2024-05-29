{
  programs.atuin = {
    enable = true;
    enableZshIntegration = true;
    settings = {
      search_mode = "fuzzy";
      filter_mode_shell_up_key_binding = "directory";
      show_preview = true;
      show_help = false;
      ctrl_n_shortcuts = false;
    };
  };
}

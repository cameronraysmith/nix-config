{
  programs.atuin = {
    enable = true;
    enableZshIntegration = true;
    # https://docs.atuin.sh/configuration/config/
    settings = {
      auto_sync = true;
      sync.records = true;
      dotfiles.enabled = true;
      sync_frequency = "15m";
      update_check = false;
      ctrl_n_shortcuts = false;
      enter_accept = true;
      keymap_mode = "vim-insert";
      filter_mode_shell_up_key_binding = "directory";
      search_mode = "skim";
      show_help = false;
      show_preview = true;
      # Only necessary on certain file systems e.g. cephfs.
      # daemon = {
      #   enabled = true;
      # };
    };
  };
}

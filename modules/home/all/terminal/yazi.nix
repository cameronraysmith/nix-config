{
  programs.yazi = {
    enable = true;
    enableBashIntegration = true;
    enableNushellIntegration = true;
    enableZshIntegration = true;
    settings = {
      preview.tab_size = 2;
      manager = {
        show_hidden = true;
        show_symlink = true;
        sort_by = "natural";
        sort_dir_first = true;
      };
    };
  };
}

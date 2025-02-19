{
  programs.starship = {
    enable = true;
    # catppuccin.enable = true;
    settings = {
      command_timeout = 2000;
      aws.disabled = true;
      gcloud.disabled = true;
    };
  };
}

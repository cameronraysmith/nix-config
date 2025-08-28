{
  programs.starship = {
    enable = true;
    # catppuccin.enable = true;
    settings = {
      format = ''
        $all''${custom.jj}$character
      '';
      command_timeout = 2000;
      aws.disabled = true;
      gcloud.disabled = true;
      custom.jj = {
        command = "prompt";
        format = "$output";
        ignore_timeout = true;
        shell = [
          "starship-jj"
          "--ignore-working-copy"
          "starship"
        ];
        use_stdin = false;
        when = true;
      };
    };
  };
}

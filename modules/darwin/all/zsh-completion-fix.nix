{
  home-manager.sharedModules = [
    (
      { config, ... }:
      {
        programs.zsh.initContent = ''
          fpath+=("${config.home.profileDirectory}"/share/zsh/site-functions "${config.home.profileDirectory}"/share/zsh/$ZSH_VERSION/functions "${config.home.profileDirectory}"/share/zsh/vendor-completions)
        '';
      }
    )
  ];

  programs.zsh.enable = true;
}

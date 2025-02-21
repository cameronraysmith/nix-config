{ inputs, pkgs, ... }: {
  imports = [
    inputs.lazyvim.homeManagerModules.default
  ];

  programs.git = {
    enable = true;
  };

  programs.lazygit = {
    enable = true;
  };

  programs.lazyvim = {
    enable = true;
    # Apply minimal settings relative to our config in 
    # ./modules/home/all/development/neovim/lazyvim.nix
    extras = {
      coding = {
        blink.enable = true;
        mini-surround.enable = true;
      };
      lang = {
        nix.enable = true;
        python.enable = true;
        rust.enable = true;
      };
    };
    plugins = with pkgs.vimPlugins; [
      # Core plugins from our main config
      copilot-lua
      mini-pick
      telescope-nvim
      telescope-fzf-native-nvim
    ];
    pluginsFile = {
      # Use similar lazyvim.lua to our config
      # ./modules/home/all/development/neovim/lazyvim/lazyvim.lua
      "lazyvim.lua".source = ./lazyvim.lua;
    };
  };
}

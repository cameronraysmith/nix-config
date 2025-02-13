{ pkgs, ... }:

{
  programs.lazyvim = {
    enable = true;
    extras = {
      coding = {
        blink.enable = true;
        mini-surround.enable = true;
        yanky.enable = true;
      };
      lang = {
        # docker.enable = true;
        json.enable = true;
        # markdown.enable = true; # render-markdown-nvim
        nix.enable = true;
        # nushell.enable = true;
        # ocaml.enable = true;
        # python.enable = true;
        # rust.enable = true;
        # scala.enable = true;
        # sql.enable = true;
        # terraform.enable = true;
        # toml.enable = true;
        tailwind.enable = true;
        typescript.enable = true;
        # yaml.enable = true;
      };
      test = {
        core.enable = true;
      };
      util = {
        dot.enable = true;
      };
    };
    plugins = with pkgs.vimPlugins; [
      avante-nvim
      blink-cmp-copilot
      copilot-lua
      dressing-nvim
      img-clip-nvim
      mini-pick
      nvim-web-devicons
      render-markdown-nvim
      telescope-nvim
      telescope-fzf-native-nvim
    ];
    pluginsFile = {
      "lazyvim.lua".source = ./lazyvim/lazyvim.lua;
      "avante.lua".source = ./lazyvim/avante.lua;
    };
  };
}

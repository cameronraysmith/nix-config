{ pkgs, lib, ... }:

# see https://github.com/azuwis/lazyvim-nixvim
{
  config = {
    programs.nixvim = {
      enable = true;

      extraPackages = with pkgs; [
        lua-language-server
        stylua
        ripgrep
      ];

      extraPlugins = [ pkgs.vimPlugins.lazy-nvim ];

      extraConfigLua =
        let
          plugins = with pkgs.vimPlugins; [
            LazyVim
            bufferline-nvim
            cmp-buffer
            cmp-nvim-lsp
            cmp-path
            conform-nvim
            dashboard-nvim
            dressing-nvim
            flash-nvim
            friendly-snippets
            fzf-lua
            gitsigns-nvim
            indent-blankline-nvim
            lazydev-nvim
            lualine-nvim
            neo-tree-nvim
            noice-nvim
            nui-nvim
            nvim-cmp
            nvim-lint
            nvim-lspconfig
            nvim-snippets
            nvim-treesitter
            nvim-treesitter-textobjects
            nvim-ts-autotag
            persistence-nvim
            plenary-nvim
            # telescope-fzf-native-nvim
            # telescope-nvim
            todo-comments-nvim
            trouble-nvim
            which-key-nvim
            {
              name = "catppuccin";
              path = catppuccin-nvim;
            }
            {
              name = "mini.ai";
              path = mini-nvim;
            }
            {
              name = "mini.pairs";
              path = mini-nvim;
            }
          ];
          mkEntryFromDrv =
            drv:
            if lib.isDerivation drv then
              {
                name = "${lib.getName drv}";
                path = drv;
              }
            else
              drv;
          lazyPath = pkgs.linkFarm "lazy-plugins" (builtins.map mkEntryFromDrv plugins);
        in
        ''
          require("lazy").setup({
            defaults = {
              lazy = true,
            },
            dev = {
              path = "${lazyPath}",
              patterns = { "" },
              fallback = true,
            },
            spec = {
              { "LazyVim/LazyVim", import = "lazyvim.plugins", 
                opts = {
                  colorscheme = "catppuccin",
                },
              },
              -- force enable telescope-fzf-native.nvim
              -- { "nvim-telescope/telescope-fzf-native.nvim", enabled = true },
              -- disable mason.nvim, use config.extraPackages
              { "williamboman/mason-lspconfig.nvim", enabled = false },
              { "williamboman/mason.nvim", enabled = false },
              { "nvim-treesitter/nvim-treesitter", opts = function(_, opts) opts.ensure_installed = {} end },
            },
          })
        '';
    };
  };
}

{ pkgs, ... }:

{
  programs.nixvim = {
    enable = true;

    imports = [
      ./options.nix
      ./lazygit.nix
    ];

    extraPlugins = with pkgs.vimPlugins; [
      grug-far-nvim
      lazydev-nvim
      persistence-nvim
      snacks-nvim
      # catppuccin-nvim
    ];

    globals.mapleader = " ";

    # colorscheme = "catppuccin";
    colorschemes.catppuccin = {
      enable = true;
      autoLoad = true;
    };

    extraConfigLua = ''
      require("catppuccin").setup({
        integrations = {
          aerial = true,
          gitsigns = true,
          mason = true,
          mini = true,
          native_lsp = {
            enabled = true,
          },
          telescope = true,
          treesitter = true,
          which_key = true
        }
      })
    '';

    plugins = {
      web-devicons.enable = true;

      lualine = {
        enable = true;
        settings = {
          options = {
            theme = "auto";
            globalstatus = true;
            disabled_filetypes = {
              statusline = [ "dashboard" "alpha" ];
            };
          };
          sections = {
            lualine_a = [ "mode" ];
            lualine_b = [ "branch" ];
            lualine_c = [
              {
                __raw = ''
                  {
                    "diagnostics",
                    symbols = {
                      error = " ",
                      warn = " ",
                      info = " ",
                      hint = " "
                    }
                  }
                '';
              }
            ];
          };
        };
      };

      bufferline = {
        enable = true;
        settings = {
          options = {
            diagnostics = "nvim_lsp";
            always_show_bufferline = false;
            diagnostics_indicator = ''
              function(_, _, diag)
                local icons = { Error = " ", Warn = " ", Hint = " ", Info = " " }
                local ret = (diag.error and icons.Error .. diag.error .. " " or "")
                  .. (diag.warning and icons.Warn .. diag.warning or "")
                return vim.trim(ret)
              end
            '';
          };
        };
      };

      treesitter = {
        enable = true;
        settings = {
          ensure_installed = [
            "bash"
            "html"
            "javascript"
            "json"
            "lua"
            "markdown"
            "markdown_inline"
            "python"
            "query"
            "regex"
            "vim"
            "yaml"
          ];
          incremental_selection = {
            enable = true;
            keymaps = {
              init_selection = "<C-space>";
              node_incremental = "<C-space>";
              node_decremental = "<bs>";
              scope_incremental = false;
            };
          };
        };
      };

      which-key = {
        enable = true;
        settings = {
          plugins = {
            marks = true;
            registers = true;
            spelling = {
              enabled = true;
              suggestions = 20;
            };
          };
          groups = {
            mode = "n";
            "<leader>f" = { name = "+file/find"; };
            "<leader>b" = { name = "+buffer"; };
            "<leader>c" = { name = "+code"; };
            "<leader>g" = { name = "+git"; };
            "<leader>q" = { name = "+quit/session"; };
            "<leader>s" = { name = "+search"; };
            "<leader>u" = { name = "+ui"; };
            "<leader>w" = { name = "+windows"; };
            "<leader>x" = { name = "+diagnostics/quickfix"; };
          };
        };
      };

      noice = {
        enable = true;
        settings = {
          lsp = {
            override = {
              "vim.lsp.util.convert_input_to_markdown_lines" = true;
              "vim.lsp.util.stylize_markdown" = true;
              "cmp.entry.get_documentation" = true;
            };
          };
          presets = {
            bottom_search = true;
            command_palette = true;
            long_message_to_split = true;
          };
        };
      };

      telescope = {
        enable = true;
        extensions = {
          fzf-native.enable = true;
        };
        keymaps = {
          "<leader>ff" = "find_files";
          "<leader>fg" = "live_grep";
          "<leader>fr" = "oldfiles";
          "<leader>fb" = "buffers";
        };
      };

      gitsigns = {
        enable = true;
        settings = {
          signs = {
            add = { text = "▎"; };
            change = { text = "▎"; };
            delete = { text = ""; };
            topdelete = { text = ""; };
            changedelete = { text = "▎"; };
            untracked = { text = "▎"; };
          };
        };
      };

      lsp = {
        enable = true;
        servers = {
          hls = {
            enable = true;
            installGhc = false;
          };
          marksman.enable = true;
          nil_ls.enable = true;
          rust_analyzer = {
            enable = true;
            installCargo = false;
            installRustc = false;
          };
          lua_ls = {
            enable = true;
            settings.Lua = {
              workspace = { checkThirdParty = false; };
              completion = { callSnippet = "Replace"; };
            };
          };
          pyright = {
            enable = true;
            settings = {
              python = {
                analysis = {
                  typeCheckingMode = "basic";
                  autoSearchPaths = true;
                  useLibraryCodeForTypes = true;
                };
              };
            };
          };
        };
        keymaps = {
          silent = true;
          diagnostic = {
            "<leader>xl" = "open_float";
            "<leader>xq" = "setloclist";
            "]d" = "goto_next";
            "[d" = "goto_prev";
          };
          lspBuf = {
            "gd" = "definition";
            "gr" = "references";
            "K" = "hover";
            "<leader>ca" = "code_action";
            "<leader>cr" = "rename";
          };
        };
      };

      mini = {
        enable = true;
        modules = {
          pairs = { };
          ai = { };
        };
      };
    };

    keymaps = [
      {
        mode = "n";
        key = "<C-h>";
        action = "<C-w>h";
        options.desc = "Go to left window";
      }
      {
        mode = "n";
        key = "<C-j>";
        action = "<C-w>j";
        options.desc = "Go to lower window";
      }
      {
        mode = "n";
        key = "<C-k>";
        action = "<C-w>k";
        options.desc = "Go to upper window";
      }
      {
        mode = "n";
        key = "<C-l>";
        action = "<C-w>l";
        options.desc = "Go to right window";
      }
    ];
  };
}

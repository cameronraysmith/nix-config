{ pkgs, config, ... }:
let
  tmux-sessionx = pkgs.tmuxPlugins.mkTmuxPlugin {
    pluginName = "tmux-sessionx";
    version = "unstable-2025-01-07";
    src = pkgs.fetchFromGitHub {
      owner = "omerxx";
      repo = "tmux-sessionx";
      rev = "42c18389e73b80381d054dd1005b8c9a66942248";
      sha256 = "sha256-SRKI4mliMSMp/Yd+oSn48ArbbRA+szaj70BQeTd8NhM=";
    };
  };
in
{
  programs.tmux = {
    enable = true;
    shell = "${pkgs.zsh}/bin/zsh";
    shortcut = "a";
    keyMode = "vi";
    baseIndex = 1;
    historyLimit = 1000000;
    newSession = true;
    escapeTime = 0;
    secureSocket = false;
    disableConfirmationPrompt = true;

    plugins = with pkgs; [
      tmuxPlugins.better-mouse-mode
      tmuxPlugins.catppuccin
      tmuxPlugins.fzf-tmux-url
      tmuxPlugins.yank
      tmuxPlugins.prefix-highlight
      tmuxPlugins.tmux-fzf
      tmuxPlugins.tmux-thumbs
      tmuxPlugins.resurrect
      tmuxPlugins.continuum
      tmuxPlugins.tmux-floax
      tmuxPlugins.session-wizard
    ];

    extraConfig = ''
      bind ^X lock-server
      bind ^C new-window -c "#{pane_current_path}"
      bind ^D detach
      bind * list-clients

      bind H previous-window
      bind L next-window
      bind ^T clock-mode

      bind r command-prompt "rename-window %%"
      bind R source-file ~/.config/tmux/tmux.conf
      bind ^A last-window
      bind ^W list-windows
      bind w list-windows
      bind z resize-pane -Z
      bind ^L refresh-client
      bind l refresh-client
      bind | split-window
      bind s split-window -v -c "#{pane_current_path}"
      bind v split-window -h -c "#{pane_current_path}"

      bind '"' choose-window
      bind h select-pane -L
      bind j select-pane -D
      bind k select-pane -U
      bind l select-pane -R
      bind -r -T prefix , resize-pane -L 20
      bind -r -T prefix . resize-pane -R 20
      bind -r -T prefix - resize-pane -D 7
      bind -r -T prefix = resize-pane -U 7
      bind : command-prompt
      bind * setw synchronize-panes
      bind P set pane-border-status
      bind c kill-pane
      bind x swap-pane -D
      bind S choose-session
      bind R source-file ~/.config/tmux/tmux.conf
      bind ^R send-keys "clear"\; send-keys "Enter"
      bind-key "K" display-popup -E -w 80% -h 80% "sesh connect \"$(sesh list -i | gum filter --limit 1 --placeholder 'Pick a sesh' --prompt='⚡')\""      
      bind-key -T copy-mode-vi v send-keys -X begin-selection

      set -g default-terminal "xterm-256color"
      set -ga terminal-overrides ",*256col*:Tc"
      set -ga terminal-overrides '*:Ss=\E[%p1%d q:Se=\E[ q'
      set-environment -g COLORTERM "truecolor"

      set-option -g mouse on
      set -g detach-on-destroy off
      set -g renumber-windows on
      set -g set-clipboard on
      set -g status-position top
      set -g pane-active-border-style 'fg=magenta,bg=default'
      set -g pane-border-style 'fg=brightblack,bg=default'

      set -g @floax-width '80%'
      set -g @floax-height '80%'
      set -g @floax-border-color 'magenta'
      set -g @floax-text-color 'blue'
      set -g @floax-bind 'p'
      set -g @floax-change-path 'true'

      set -g @session-wizard 't'
      set -g @session-wizard-height 80
      set -g @session-wizard-width 80

      set -g @resurrect-strategy-nvim 'session'
      set -g @resurrect-capture-pane-contents 'on'
      set -g @continuum-restore 'on'
      set -g @continuum-boot 'on'
      set -g @continuum-save-interval '3'

      set -g @catppuccin_window_left_separator ''
      set -g @catppuccin_window_right_separator ' '
      set -g @catppuccin_window_middle_separator ' █'
      set -g @catppuccin_window_number_position 'right'
      set -g @catppuccin_window_default_fill 'number'
      set -g @catppuccin_window_default_text '#W'
      set -g @catppuccin_window_current_fill 'number'
      set -g @catppuccin_window_current_text '#W#{?window_zoomed_flag,(),}'
      set -g @catppuccin_status_modules_right 'directory date_time'
      set -g @catppuccin_status_modules_left 'session'
      set -g @catppuccin_status_left_separator  ' '
      set -g @catppuccin_status_right_separator ' '
      set -g @catppuccin_status_right_separator_inverse 'no'
      set -g @catppuccin_status_fill 'icon'
      set -g @catppuccin_status_connect_separator 'no'
      set -g @catppuccin_directory_text '#{b:pane_current_path}'
      set -g @catppuccin_date_time_text '%H:%M'
    '';
  };

  programs.tmate = {
    enable = true;
  };

  home.packages = [
    (pkgs.writeShellApplication {
      name = "pux";
      runtimeInputs = [ pkgs.tmux ];
      text = ''
        PRJ="''$(zoxide query -i)"
        echo "Launching tmux for ''$PRJ"
        set -x
        cd "''$PRJ" && \
          exec tmux -S "''$PRJ".tmux attach
      '';
    })
  ];
}

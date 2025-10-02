{
  config,
  pkgs,
  ...
}:
{
  programs.claude-code = {
    enable = true;
    package = pkgs.claude-code-bin;

    # symlink commands and agents directory trees
    commandsDir = ./commands;
    agentsDir = ./agents;

    # https://schemastore.org/claude-code-settings.json
    settings = {
      statusLine = {
        type = "command";
        command = "${pkgs.cc-statusline-rs}/bin/statusline";
      };

      theme = "dark";
      autoCompactEnabled = false;
      spinnerTipsEnabled = false;
      cleanupPeriodDays = 1100;
      includeCoAuthoredBy = false;
      enableAllProjectMcpServers = false;
      alwaysThinkingEnabled = true;

      permissions = {
        defaultMode = "acceptEdits";
        allow = [
          # Basics
          "Bash(cat:*)"
          "Bash(echo:*)"
          "Bash(find:*)"
          "Bash(grep:*)"
          "Bash(head:*)"
          "Bash(ls:*)"
          "Bash(mkdir:*)"
          "Bash(pwd)"
          "Bash(tail:*)"
          "Bash(which:*)"
          # Git operations
          "Bash(git add:*)"
          "Bash(git branch:*)"
          "Bash(git checkout:*)"
          "Bash(git commit:*)"
          "Bash(git config:*)"
          "Bash(git diff:*)"
          "Bash(git log:*)"
          "Bash(git push)"
          "Bash(git reset:*)"
          "Bash(git rev-parse:*)"
          "Bash(git show:*)"
          "Bash(git stash:*)"
          "Bash(git status:*)"
          "Bash(git tag:*)"
          # GitHub CLI
          "Bash(gh:*)"
          # Nix operations
          "Bash(nix build:*)"
          "Bash(nix develop:*)"
          "Bash(nix flake:*)"
          "Bash(nix run:*)"
          # Development tools
          "Bash(jq:*)"
          "Bash(test:*)"
          # mcps
          "mcp__firecrawl__*"
        ];
        deny = [
          "Bash(sudo:*)"
          "Bash(rm -rf:*)"
        ];
        ask = [ ];
      };

      # hooks = {
      #   PostToolUse = [
      #     {
      #       matcher = "Edit|MultiEdit|Write";
      #       hooks = [
      #         {
      #           type = "command";
      #           command = ''
      #             file_path=$(echo "$CLAUDE_TOOL_INPUT" | jq -r '.file_path // .files[0].file_path // empty')
      #             if [ -n "$file_path" ] && [[ "$file_path" == *.nix ]]; then
      #               nix fmt "$file_path" 2>/dev/null || true
      #             fi
      #           '';
      #         }
      #       ];
      #     }
      #   ];
      # };
    };
  };

  home.shellAliases = {
    ccds = "claude --dangerously-skip-permissions";
  };

  # symlink .local/bin to satisfy claude doctor
  home.file.".local/bin/claude".source =
    config.lib.file.mkOutOfStoreSymlink "${config.programs.claude-code.finalPackage}/bin/claude";
}

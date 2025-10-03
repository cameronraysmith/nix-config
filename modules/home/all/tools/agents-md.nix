{ ... }:
{
  # https://github.com/mirkolenz/nixos/blob/0911e2e/home/options/agents-md.nix#L22-L31
  #
  # What precisely do you understand from your user memory file?
  #
  # Based on our current project, at what point might you decide to
  # reference the relevant document(s) from the claude commands
  # preferences directory pointed to from the user-level memory file?
  programs.agents-md = {
    enable = true;
    settings.body = ''
      # Development Guidelines

      If one of the following applies to a given task or topic, consider reading
      the corresponding document to ensure adherence to our guidelines and
      conventions:

      - general development practices: @~/.claude/commands/preferences/general-practices.md
      - architectural patterns: ~/.claude/commands/preferences/architectural-patterns.md
      - data modeling: ~/.claude/commands/preferences/data-modeling.md
      - nix development: ~/.claude/commands/preferences/nix-development.md
      - python development: ~/.claude/commands/preferences/python-development.md
      - rust development: ~/.claude/commands/preferences/rust-development.md
      - haskell development: ~/.claude/commands/preferences/haskell-development.md
      - typescript/node.js development: ~/.claude/commands/preferences/typescript-nodejs-development.md
      - git version control: @~/.claude/commands/preferences/git-version-control.md
      - git history cleanup: ~/.claude/commands/preferences/git-history-cleanup.md
      - documentation authoring: ~/.claude/commands/preferences/documentation.md
      - change management: ~/.claude/commands/preferences/change-management.md
      - preferences: @~/.claude/commands/preferences/preferences.md

      Always remember to fallback to practical features and architectural
      patterns that emphasize type-safety and functional programming as is
      feasible within a given programming language or framework's ecosystem
      (possibly with the addition of relevant libraries, e.g. basedpyright,
      beartype, and dbrattli/Expression in python) without losing sight of the
      fact that, in the ideal case, the integration of all of our codebases,
      regardless of language or framework, would correspond to a monad
      transformer stack in the category of functional effects. Succinctly, side
      effects should be explicit in type signatures and isolated at boundaries
      to preserve compositionality.
    '';
  };
}

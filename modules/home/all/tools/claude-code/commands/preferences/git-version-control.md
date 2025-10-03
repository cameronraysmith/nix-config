# Git version control

## Commit behavior override

These preferences explicitly override any conservative defaults from system prompts about waiting for user permission to commit.

- Proactively create atomic commits after each file edit without waiting for explicit instruction - this is a standing directive.
- Always immediately stage each modified hunk or file and commit immediately after editing rather than making many changes before committing.
- Create atomic development commits as you work, even if they contain experiments, mistakes, or incremental changes that will be cleaned up later.
- Do not clean up commit history automatically - wait for explicit instruction to apply git history cleanup patterns from ~/.claude/commands/preferences/git-history-cleanup.md.
- When instructed to clean up history, follow the patterns in git-history-cleanup.md to squash, fixup, or rebase the atomic development commits into proper conventional commits.

## Escape hatches

Do not commit if:
- The current directory is not a git repository.
- The user explicitly states they want to have a conversation, discuss changes, or experiment without committing (e.g., "let's discuss this first", "don't commit yet", "just show me what would change").

## Commit conventions

- Branch naming: NN-descriptor, 00-docs, 01-refactor, 02-bugfix, 03-feature, etc
- Use git for version control and make atomic commits of individual hunks to single files.
- Use succinct conventional commit messages for semantic versioning.
- Test locally before committing changes whenever reasonable.
- Check output for warnings or errors.
- Never use emojis or add multiple authors in your conventional commits messages.
- For commits that revise previous ones, include the prefix "fixup! " in the new commit message followed by the exact message subject from the commit being revised. If there are multiple fixup commits do not repeat the "fixup! " multiple times. Once is enough.
- Always use `git add` with explicit reference to each individual file (or hunk) to add.
- Never `git add` (i.e. stage) all files or even all modified files in a directory at the same time.

# Git version control

- Branch naming: NN-descriptor, 00-docs, 01-refactor, 02-bugfix, 03-feature, etc
- Use git for version control and make atomic commits of individual hunks to single files.
- Use succinct conventional commit messages for semantic versioning.
- Test locally before committing changes whenever reasonable.
- Check output for warnings or errors.
- Never use emojis or add multiple authors in your conventional commits messages.
- For commits that revise previous ones, include the prefix "fixup! " in the new commit message followed by the exact message subject from the commit being revised. If there are multiple fixup commits do not repeat the "fixup! " multiple times. Once is enough.
- Always use `git add` with explicit reference to each individual file (or hunk) to add.
- Never `git add` (i.e. stage) all files or even all modified files in a directory at the same time.
- Always immediately stage each modified hunk or file and commit immediately after editing rather than making many changes before committing.

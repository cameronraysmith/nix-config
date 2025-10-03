# git history cleanup

## purpose

Transform experimental development history into a clean, reviewable commit sequence where:

- Each commit is atomic: contains one logical change that builds/tests successfully
- Commits are logically ordered: dependencies come before dependents, related changes are grouped
- Intermediate commits are removed: no "WIP", "fix typo", "oops", or checkpoint commits
- Each commit message follows conventional commit format and accurately describes its diff

This prepares branches for PR review by creating a clear narrative of what changed and why.

## principle

Never trigger interactive editors. All operations use `GIT_SEQUENCE_EDITOR` and `GIT_EDITOR` environment variables with non-interactive commands.

## core technique

```bash
GIT_SEQUENCE_EDITOR="command-to-edit-todo" git rebase -i <base>
```

The rebase todo file has one line per commit: `<action> <hash> <message>`

## operations

### reorder commits

Use sed/awk to rearrange lines in the todo file:

```bash
# Move commit at line N to line M (example: move line 3 to line 1)
GIT_SEQUENCE_EDITOR="awk 'NR==3 {saved=\$0; next} NR==1 {print saved} {print}' > /tmp/rebase-todo && cat /tmp/rebase-todo" git rebase -i HEAD~5

# Reverse order
GIT_SEQUENCE_EDITOR="tac" git rebase -i HEAD~3

# Custom order: use awk to print lines in desired sequence
GIT_SEQUENCE_EDITOR="awk '{lines[NR]=\$0} END {for (i in order) print lines[order[i]]}'" git rebase -i HEAD~N
```

### squash/fixup commits

```bash
# Squash commit at line N into previous (N-1)
GIT_SEQUENCE_EDITOR="sed -i.bak 'Ns/^pick/squash/'" git rebase -i HEAD~5

# Fixup (squash without message)
GIT_SEQUENCE_EDITOR="sed -i.bak 'Ns/^pick/fixup/'" git rebase -i HEAD~5

# Squash all commits after first
GIT_SEQUENCE_EDITOR="sed -i.bak '2,\$s/^pick/squash/'" git rebase -i HEAD~5
```

### drop commits

```bash
# Drop commit at line N
GIT_SEQUENCE_EDITOR="sed -i.bak 'Nd'" git rebase -i HEAD~5

# Drop by marking as 'drop'
GIT_SEQUENCE_EDITOR="sed -i.bak 'Ns/^pick/drop/'" git rebase -i HEAD~5
```

### reword commit messages

```bash
# Mark for reword, then use GIT_EDITOR to set message
GIT_SEQUENCE_EDITOR="sed -i.bak 'Ns/^pick/reword/'" \
  GIT_EDITOR="echo 'new message' >" \
  git rebase -i HEAD~5

# For multiple rewords, use a script that checks commit hash
```

### edit commit content

```bash
# Mark commit for edit at line N
GIT_SEQUENCE_EDITOR="sed -i.bak 'Ns/^pick/edit/'" git rebase -i HEAD~5

# Rebase will pause; make changes, then:
git add <files>
git commit --amend --no-edit
git rebase --continue
```

### split commits

```bash
# Mark for edit
GIT_SEQUENCE_EDITOR="sed -i.bak 'Ns/^pick/edit/'" git rebase -i HEAD~5

# When paused:
git reset HEAD^
git add <files-for-first-commit>
git commit -m "first part"
git add <files-for-second-commit>
git commit -m "second part"
git rebase --continue
```

## robust patterns

### use temporary files for complex edits

```bash
#!/bin/bash
# reorder-script.sh
# Reads git-rebase-todo from $1, writes modified version back
awk '{lines[NR]=$0} END {
  # Print in desired order
  print lines[3]
  print lines[1]
  print lines[2]
}' "$1" > "$1.tmp" && mv "$1.tmp" "$1"

chmod +x reorder-script.sh
GIT_SEQUENCE_EDITOR="./reorder-script.sh" git rebase -i HEAD~3
```

### multi-step workflow

For complex history rewrites:

1. First pass: reorder commits
2. Second pass: squash/fixup related commits
3. Third pass: reword messages
4. Final pass: test and verify

Run separate rebase operations rather than one complex edit.

### handle conflicts

```bash
# If rebase conflicts:
git status  # identify conflicts
# Fix conflicts manually
git add <resolved-files>
git rebase --continue

# To abort:
git rebase --abort
```

## complete example

Clean up 5 commits: reorder, squash 2 & 3, drop 4, reword 5

```bash
# Step 1: Create reorder script
cat > /tmp/rebase-edit.sh << 'EOF'
#!/bin/bash
awk '{lines[NR]=$0} END {
  print lines[1]
  gsub(/^pick/, "squash", lines[3])
  print lines[3]
  gsub(/^pick/, "drop", lines[4])
  print lines[4]
  gsub(/^pick/, "reword", lines[5])
  print lines[5]
  print lines[2]
}' "$1" > "$1.tmp" && mv "$1.tmp" "$1"
EOF
chmod +x /tmp/rebase-edit.sh

# Step 2: Run rebase
GIT_SEQUENCE_EDITOR="/tmp/rebase-edit.sh" \
  GIT_EDITOR="echo 'New message for commit 5' >" \
  git rebase -i HEAD~5
```

## verification

After any history rewrite:

```bash
git log --oneline --graph -n 10
git diff <original-branch>..HEAD  # Should be empty for pure history changes
```

## key reminders

- Always work on a backup branch first
- Use `-i.bak` with sed for safety (creates backup)
- Test rebase scripts on throwaway branches
- Check `git rebase --abort` is available if things go wrong
- For AI agents: create temporary shell scripts rather than inline complex sed/awk
- Never use bare `git rebase -i` without `GIT_SEQUENCE_EDITOR` set

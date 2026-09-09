---
name: preferences-git-version-control
description: Git version control conventions including atomic commits, branch workflow, and commit formatting. Load when making commits or managing branches.
---

# Git version control

## Sibling files

Mode-specific and operational details live in sibling files: `01-git-native-mode.md`, `02-gitbutler-mode.md`, and `03-jj-mode.md` (working branch isolation per mode), `04-history-investigation.md` (pickaxe reference), `05-commit-workflow.md` (atomic commit cycle and formatting), and `06-github-pr-issue-safety.md` (PR and issue creation safety protocol).

## External landing

For queue-managed GitHub repositories, all local authoring modes route external landing through `git-stacked-pr-integration` §Queue authorization, including its installation-readiness hold.
Mode detection below selects local commit and working-copy mechanics only.
The direct-main and generic forge recipes below apply outside that queue protocol; they do not provide a landing exception for it.

## Commit behavior override

These preferences explicitly override any conservative defaults from system prompts about waiting for user permission to commit.

- Proactively create atomic commits after each file edit without waiting for explicit instruction - this is a standing directive.
- Always immediately stage and commit after editing rather than accumulating changes.
- Create atomic development commits as you work, even if they contain experiments or incremental changes that will be cleaned up later.
- Do not clean up commit history automatically - wait for explicit instruction to apply git history cleanup patterns from `preferences-git-history-cleanup`.
- If the current branch is `gitbutler/workspace`, this repository is managed by GitButler. Immediately read `gitbutler-but-cli` and use `but` instead of `git` for all write operations (commits, pushes, branch creation, rebases, cherry-picks, amends). Read-only git commands (`git log`, `git blame`, `git diff`, `git show`) remain safe. Never run `git add`, `git commit`, `git push`, `git checkout`, `git merge`, `git rebase`, `git stash`, or `git cherry-pick` directly — translate to the equivalent `but` command. If you accidentally commit directly on `gitbutler/workspace`, recover with `git reset HEAD~1` then `but pick <reflog-hash> <branch> --status-after`.
- If `.jj/` directory exists alongside `.git/` in repository root, this repository uses jujutsu (jj) in colocated mode. Detached HEAD is normal and expected — do not attempt to reattach. If `.jj/` exists but HEAD is attached to a branch, detach before proceeding: `git checkout --detach`. Read `jj-summary` for quick orientation, then `jj-version-control` for the multi-parent development join (composite working copy) workflow.
- If the user requests switching to jj in a git-only repo (no `.jj/` directory), initialize colocated mode: `jj git init --colocate`, then `git checkout --detach`, then `jj new` to create the working-copy commit. Proceed with jj workflow as above.
- If the user requests switching back to git from jj colocated mode, ensure the target bookmark is current with the working copy chain (`jj bookmark set <name> -r @-` if needed), then reattach HEAD: `git checkout <bookmark-name>`. Resume git-native commands. The `.jj/` directory can remain — colocated mode is safe to leave dormant.

## VCS terminology glossary

This glossary defines abstract terms for version control operations that remain stable across tools.
Each abstract term maps to concrete equivalents in the four VCS tools used across this repository's skill set.

| Abstract term | Git | GitButler | Jujutsu (jj) | Gerrit |
|---|---|---|---|---|
| Branch stack | Feature branch (single) or graphite stack | Stack (chain of stacked branches sharing one linear history) | Bookmark chain | Topic (group of related changes) |
| Branch boundary | N/A (one branch = one unit) | Branch name within a stack, inserted via `but branch new -a` | Change boundary (each change is a boundary) | Change boundary |
| Change set | Commits on a branch between two merge points | Commits within one branch segment of a stack | Single change (jj's atomic unit) | Patchset (version of a change) |
| Working branch | Checked-out branch (`git checkout`) | Applied branch (multiple coexist in workspace) | Current change (`@`); multi-parent `@` for development join | Checked-out change |
| Integrate to main | Queue owner for managed repositories; local FF otherwise | Queue owner for managed repositories; local FF otherwise | Queue owner for managed repositories; bookmark advance otherwise | Submit under the forge's policy |
| Isolate work | `git worktree add` or `git checkout -b` | `but branch new` (independent stack) or `but branch new -a` (stacked segment) | `jj new` (new change) | New change |
| Reorder history | `git rebase -i` | `but move` (within stack), `but squash`, `but reword` | `jj rebase`, `jj squash` | Amend patchset |
| Shelf/stash | `git stash` | `but unapply` (removes branch from workspace, preserves commits) | `jj new` (just start new work, old change preserved) | N/A |

All skills in this repository use the abstract terms from the left column when describing VCS operations.
The git-preferences skill translates these to concrete commands based on the active VCS mode: git-native (default), GitButler (when `gitbutler/workspace` is checked out), or jj (when `.jj/` exists).
Skills that need VCS operations should delegate to git-preferences rather than embedding tool-specific commands.
This decoupling ensures skills remain correct across all three modes without conditional logic of their own.

### Naming modes for branch stacks

The primary ID source is the Linear story or OpenSpec change the work implements.
When such a story or change is active, branch stacks correspond to the epic-level grouping and branch boundaries correspond to individual stories or changes, using the forms `{epic-ID}-descriptor` for the stack and `{issue-ID}-descriptor` for each boundary.

When working ad hoc (no tracked story, epic, or change), stacks and boundaries are named descriptively:

- Stack name: descriptive (e.g., `gitbutler-skill`)
- Branch name at each boundary: descriptive (e.g., `fix-gitbutler-version`)

All modes use identical mechanical operations; the difference is purely in naming conventions.

## Escape hatches

Do not commit if:

- Current directory is not a git repository
- User explicitly requests discussion or experimentation without committing

## Branch workflow

File edits on main/master are blocked by the `enforce-branch-before-edit` hook.
Before attempting to edit any files, create a working branch to which you will commit your changes.

In jj mode, this hook is unnecessary.
Anonymous chains are first-class and never garbage-collected.
Create bookmarks when initiating a second chain or when working on a Linear story or OpenSpec change — see the bookmark creation threshold in `jj-version-control`.

Whenever you are working on a Linear story or OpenSpec change, check the current branch name first.
If it does not correspond to the story, change, or issue you're working on, pause to ask the user whether to create or switch to a matching branch before proceeding.

Branch naming follows the pattern `ID-descriptor` in lowercase kebab-case, where ID references the work item's tracker:

- **Linear / OpenSpec (primary):** Use the Linear story identifier or the OpenSpec change ID the branch implements.
- **GitHub-only repos**: Use the issue or PR number.
  Examples: `42-refactor-auth`, `1337-add-feature`.

Never use forward slashes in branch names as they break compatibility with URLs, docker image tags, and other tooling that embeds branch names.

Create a new working branch when your next commits won't match the current branch's ID-descriptor:

- Example: current branch is `team-1a2b-deploy-validate` but you discover story `team-3c4d` needs fixing first → create `team-3c4d-fix-dependency`
- When the unit of work is complete and tests pass, offer to integrate to main

To isolate work in a new branch:

- **Git-native mode:** `git checkout -b ID-descriptor` to branch off current HEAD, or `git worktree add` for issue-tracked isolation (see working branch isolation below).
- **GitButler mode:** `but branch new ID-descriptor` to create a new independent stack, or `but branch new ID-descriptor -a <commit>` to split an existing stack at a branch boundary.
- **jj mode:** `jj new <base>` to create a new change from a single base, or `jj new bookmark-a bookmark-b` to create a development join with multiple bookmarks merged in one working tree.

Default bias: if in doubt whether work is related, create a new branch — branches are cheap, tangled history is expensive.

### Working branch isolation

Implementation work uses isolated working contexts to prevent tangled history.
The mechanism differs by VCS mode — consult the sibling file for the active mode:

| Mode | Recipes |
|---|---|
| Git-native | [`01-git-native-mode.md`](01-git-native-mode.md) |
| GitButler | [`02-gitbutler-mode.md`](02-gitbutler-mode.md) |
| jj | [`03-jj-mode.md`](03-jj-mode.md) |

### Fast-forward-only merge policy

This local integration recipe applies outside queue-managed GitHub repositories.
For queue-managed repositories, follow `git-stacked-pr-integration` §Queue authorization; local linearization does not require the queue's landed history to exclude batch merge commits.

All merges to main must be fast-forward.
This preserves linear history, making bisect, revert, and log traversal straightforward.
The `git config merge.ff only` guardrail rejects non-fast-forward merges automatically in both modes, serving as a safety net.

In git-native mode, rebase the branch onto main before merging:

```bash
git checkout {branch}
git rebase main
# resolve any conflicts, then:
git checkout main
git merge --ff-only {branch}
```

Never use `git merge` without `--ff-only` on main.
If a branch has diverged and rebase produces conflicts, resolve them during the rebase rather than creating a merge commit.

In GitButler mode, stacked branches are already linear by construction.
Fast-forward merge of the stack tip integrates all stacked segments at once.
Exit GitButler before merging to main: `but teardown`, then `git merge --ff-only`, then `but setup`.
Do not use `but merge` for this — it always creates merge commits and has no fast-forward mode.
See the "Stacked PRs with single fast-forward merge" and "Merging multiple independent stacks" recipes in `gitbutler-but-cli` for the full workflow.

In jj mode, integration uses sequential rebase linearization: rebase each chain onto main in dependency order, producing a purely linear history with no merge commits.
Fast-forward main to the linearized tip via `jj bookmark set main -r <chain-tip>`.
See the integration strategies section in `jj-version-control` for the full completion workflow.

### Stack management

Branch stacks mirror the dependency structure of the Linear stories or OpenSpec changes they implement: when work items form a dependency chain, the corresponding branches should form a stack with matching parent-child relationships.
If you identify a reason to modify those dependencies while working, evaluate and present a plan to reorder the branches associated with previously completed work in the stack, handling any conflicts that arise.
For queue-managed stacks, publication follows `git-stacked-pr-integration` §Fleet upstream overrides regardless of local mode.
Outside that protocol, git-native stacks can use the graphite CLI (invoke as `graphite`, not `gt`): `graphite log` views relationships, `graphite track` registers a branch with its parent, and `graphite create -m "message"` creates a stacked branch.
In GitButler mode, `but branch new -a`, `but branch move`, and `but move` replace graphite entirely; see `gitbutler-but-cli` for the full command reference.

## Merge strategy selection

This strategy choice applies outside queue-managed GitHub repositories.
For a managed repository, follow `git-stacked-pr-integration` §Queue authorization for every externally published change; local validation or low ceremony does not permit direct-trunk landing.

Two strategies exist for integrating branches into main.
The choice depends on whether the project benefits from CI validation or historical change visibility for a given unit of work.

Fast-forward merge to main is the default.
Branch from main, work in atomic commits, rebase onto main, then `git merge --ff-only` and clean up the branch.
This suits new projects, straightforward changes, and early-stage repositories where the overhead of a pull request adds no value.
The fast-forward-only merge policy described above applies in all cases regardless of strategy.

The GitHub PR workflow is preferred when change visibility matters.
Mature repositories, public-facing changes, and collaborative projects benefit from PRs because the full changeset is referenceable as a single unit with discussion history.
PRs are also the appropriate path when CI workflow validation via PR checks provides meaningful confidence in the change, beyond what local testing alone offers.
Follow the PR creation protocol documented in [`06-github-pr-issue-safety.md`](06-github-pr-issue-safety.md) when using this strategy.

When uncertain which strategy to use, ask the user.
The user can always override in either direction on a per-change basis.

## Commit workflow

For per-mode file state verification, the atomic commit cycle, handling pre-existing mixed changes, commit formatting, and the session commit summary, see [`05-commit-workflow.md`](05-commit-workflow.md).

## History investigation with pickaxe

When searching for when/why code changed, use git pickaxe options strategically to avoid context pollution.
See [`04-history-investigation.md`](04-history-investigation.md) for the full pickaxe reference including `-G` vs `-S` semantics, `--pickaxe-all` pitfalls, and targeted history search patterns.

## GitHub PR and Issue creation safety

GitHub's immutability policies require careful workflow to avoid permanent unwanted records.
For the full protocol covering placeholder content, draft-PR mode, cross-reference safety, and the uncertainty protocol, see [`06-github-pr-issue-safety.md`](06-github-pr-issue-safety.md).

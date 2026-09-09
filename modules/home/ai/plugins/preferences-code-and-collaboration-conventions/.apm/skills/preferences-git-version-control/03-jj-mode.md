# jj mode

Working branch isolation recipes for jj mode.
jj provides a development join (multi-parent working copy) that achieves the same simultaneous multi-branch editing as GitButler's applied-branches model.
All bookmarks coexist in a single working tree, so parallel chains need no worktree, and the development join is the default technique for them.
A linked git worktree remains available and is warranted when a separate filesystem tree is itself the requirement — an external agent framework driving its own process, a long-running build, side-by-side comparison — under the ownership and return-by-ref discipline in `jj-version-control` §"Worktree interop".

## Creating a multi-parent working copy

Create a development join with multiple parent bookmarks:

```bash
jj new bookmark-a bookmark-b bookmark-c
```

The resulting `@` is a development join whose working tree merges all parent bookmarks.
Edits made in `@` can be routed (route elements to their chain) to any chain.

## Change routing

Route changes from the development join `@` to the appropriate chain:

```bash
# Manual: squash specific changes into a named chain element
jj squash --into <parent-bookmark> -u -- <path>

# Automatic: distribute changes based on blame ancestry
jj absorb
```

The `-u` (`--use-destination-message`) flag prevents the description merge editor from opening and preserves the target chain element's existing description.
`jj absorb` analyzes which ancestor last touched each modified line and routes changes automatically.
Use `jj squash --into` when changes belong to a specific chain element that blame cannot determine.

## Adding and removing chains

Modify the set of chains in the development join.
These recipes re-parent the join commit, never the wip working copy.
In the two-commit `[merge]`+`[wip]` structure, rebase the frozen `[merge]` (`@-`), then re-attach the empty `[wip]` onto it — the two `jj rebase` calls form a required tool-pair:

```bash
# Add a chain: grow the join's parent set in place, then re-attach the wip
jj rebase -r <merge-change-id> -d <existing-chain-a> -d <existing-chain-b> -d new-bookmark
jj rebase -s <wip-change-id> -d <merge-change-id>

# Remove a chain
jj rebase -r <merge-change-id> -d <remaining-chain-a> -d <remaining-chain-b>
jj rebase -s <wip-change-id> -d <merge-change-id>
```

Name every destination explicitly, one `-d` per chain the join is to carry afterward, so removal is expressed by omitting a chain from the list rather than subtracting it in a revset.
The `all:` revset modifier that earlier revisions of this file placed on these destinations was removed in jj 0.38.0 and now fails to parse.
The second half takes `-s`, not `-r`, so that any commits stacked above `[wip]` return to the rebuilt `[merge]` with it; `-r <wip>` moves `[wip]` alone and orphans them.

Do NOT make the empty `[wip]` the subject of a positional rebase — `jj rebase -r @ --insert-before <target>` / `--insert-after <target>` (and the `jj rebase --revisions @ --insert-before/--insert-after <target>` aliases) relocate `@` below or into the join, dropping the shared editing surface concurrent actors are writing and dragging the pushed `wip` deploy bookmark (the catastrophic concurrency failure).
In the simpler single-commit join — where `@` IS the join with no separate `[wip]` — the sanctioned destination form `jj rebase -r @ -d <chain-a> -d <chain-b> …`, naming one `-d` per chain the join is to carry afterward, re-parents in place and keeps `@` an empty direct child of the join; the two-commit `[merge]`+`[wip]` pair above is canonical for diamond work.
This destination form is the ONLY `jj rebase` that may name `@`; it is distinct from the prohibited positional `--insert-before/--insert-after` forms.
See `jj-version-control` invariant (iii) and §"Adding and removing chains" for the full canon.

## Auto-rebase behavior

When a chain advances (via commits on that bookmark from another workspace or collaborator), jj automatically rebases `@` onto the updated parents.
This keeps the development join current without manual intervention.

## Epic and issue mapping

Bookmarks correspond to epics or independent work streams.
Changes within each bookmark's chain correspond to issues.
This mapping parallels the git-native worktree model and the GitButler stack model, but without filesystem separation.

Create a bookmark per active epic following the standard naming convention:

```bash
jj bookmark create {epic-ID}-descriptor
```

Build changes as a chain descending from each bookmark.
Each change in the chain corresponds to an issue within the epic:

```bash
# Start work on an issue within the epic
jj new {epic-ID}-descriptor
jj describe -m "feat: implement issue description"
# edit files...
jj new  # freeze and start next issue
```

This linear-chain pattern describes `@` because `@` is a single-base content commit here.
In a multi-parent development join, by contrast, `@` is the empty `[wip]` and must NEVER be `jj describe`'d — route downward into a chain instead.

When working across multiple epics simultaneously, create a development join over the active epic bookmarks:

```bash
jj new {epic-a}-descriptor {epic-b}-descriptor
```

Route changes from the development join `@` to the appropriate chain:

```bash
# Automatic: distribute changes by blame ancestry
jj absorb

# Manual: route specific changes to a named epic chain
jj squash --into {epic-b}-descriptor -u -- <path>
```

## Subagent dispatch in jj mode

In jj mode, subagents do not create bookmarks, and dispatch omits the `isolation` parameter by default.
All agents — including parallel agents — edit files directly in the shared `@` working copy.
The orchestrator routes changes to the correct chain via `jj absorb` or `jj squash --into <target> -u -- <path>` after each subagent completes.
Requesting `isolation: "worktree"` raises an ask rather than a denial; answer it affirmatively only when the subagent genuinely needs its own filesystem tree, and follow the discipline in `jj-version-control` §"Worktree interop" when it does.

When working in the development join, use a join + wip structure (two-commit pattern).
The development join integrates all parent bookmarks and has a description to prevent auto-abandonment.
The wip commit (`@`) sits on top for active edits.
`jj absorb` and `jj squash --into <target> -u -- <path>` route changes from wip to chains without disrupting the development join.

Invariant: `@` is ALWAYS the empty `[wip]` commit directly on the development join.
Every editor — human or agent — edits this same shared `[wip]`, then routes each change DOWNWARD into the correct chain, returning `[wip]` to empty between routings.
The shared `[wip]` is the stable coordination point that makes N concurrent editors safe by construction, and in this repo it additionally anchors the pushed `wip` deploy bookmark.
Never `jj describe @` into a content commit (that consumes the empty wip), and never make `@` the subject of `jj rebase` as a routing move — `jj rebase -r @` / `jj rebase --revisions @` with the positional `--insert-before/--insert-after` forms drifts `@` off the join, removes the shared editing surface concurrent agents write to, and drags the pushed `wip` deploy bookmark.
Routing verbs leave `@` in place and empty: `jj absorb` (auto-distribute by blame; scoped `jj absorb <path>` under concurrency), `jj squash --from @ --into <chain-tip> --keep-emptied [-- <paths>]` (amend-route), `jj squash --from @ --insert-after <chain-tip> -m "msg" --keep-emptied -- <paths>` (append-route), and `jj split` keeping the wip remainder.
To place a change BELOW the join, route it down from the live `@` with `jj squash --from @ --insert-before <target> -m "msg" --keep-emptied -- <paths>`; any by-relocation `<target>`/`<commit>` is a SEPARATE already-sealed non-wip commit, never `@` itself.
The canonical invariants and the `--keep-emptied` routing primitives are normative in `jj-version-control` invariant (iii).

Coordination protocol: atomic one-file changes, periodic `jj log` review, prompt routing to keep `@` clean.
Subagent dispatch prompts specify which files to edit and the target chain context but do not include jj routing commands.
The subagent edits files in the shared `@` and does NOT run `jj`, `git`, or `bd` commands itself; the orchestrator routes the working-copy diff to the appropriate chain after the subagent returns.

Example prompt fragment: "Edit only modules/.../<file>.nix; do not run jj/git/bd. Your changes will be routed to the nix-pxj-4-deploy-validate bookmark by the orchestrator after you return."

See the parallel agent coordination protocol in `jj-version-control` for the full model.

## Completing issues and epics

When a work item is complete, advance its state in the owning layer: mark the Linear story Done and archive the OpenSpec change.
In Manual mode, also close the corresponding bead:

```bash
bd close {issue-ID} --reason "Implemented in $(jj log -r '{epic-ID}-descriptor' --no-graph -T 'commit_id.short(8)')"
```

For queue-managed GitHub repositories, return the completed, verified ref and evidence to the orchestrator without publication or landing.
The publisher follows `git-stacked-pr-integration` §Queue authorization, including its installation hold and upstream overrides.
This external handoff leaves the shared working-copy restrictions and `jj-version-control` §Worktree interop return-by-ref discipline unchanged.
Do not advance or push the default branch as a landing shortcut for this queue.

## No direnv initialization needed

jj development joins operate in a single working tree, so the repository root's direnv environment applies to all chains.

## GitButler equivalence mapping

| GitButler | jj development join |
|---|---|
| Applied branches | Chains in development join `@` |
| `gitbutler/workspace` commit | Development join `@` commit |
| `but commit --changes` | `jj squash --into <target> -u -- <path>` or `jj absorb` |
| `but unapply` | Remove chain: `jj rebase -r <merge> -d <remaining-chain-a> -d <remaining-chain-b>` then `jj rebase -s <wip> -d <merge>` (single-commit join: `jj rebase -r @ -d <remaining-chain-a> -d <remaining-chain-b>`) |
| `but apply` | Add chain: `jj rebase -r <merge> -d <existing-chain-a> -d <existing-chain-b> -d new-bookmark` then `jj rebase -s <wip> -d <merge>` (single-commit join: `jj rebase -r @ -d <existing-chain-a> -d <existing-chain-b> -d new-bookmark`) |
| Branch stacks | Bookmark chains (linear descendant sequences) |
| `but move` (cross-stack) | `jj squash --from <src> --into <dst>` |

## Diamond workflow

When epic-scoped work spans multiple parallel streams — a Linear initiative or project, an OpenSpec change group, or (in Manual mode) a beads epic — it uses the diamond workflow's four phases (diverge, develop, converge, serialize) to map the dependency graph onto jj bookmark chain topology.
The mechanical implementation leverages jj's multi-parent working copy; the pattern generalizes conceptually to GitButler's applied-branches model and git-native worktrees.
For the canonical operational recipe, theoretical foundations, and dependency-graph-to-jj mapping (including the beads-to-jj mapping used in Manual mode), see the `jj-version-control` skill's `diamond-workflow.md`.

`jj-linearize-join` supplies the local diamond-to-linearized-chain transformation.
Return that verified chain ref for publication under `git-stacked-pr-integration` §Queue authorization.
The generic `jj-stack-submit` N+1 recipe, where retained for other forges, is outside the queue-managed GitHub route.
See `jj-version-control/diamond-workflow.md` §Phase 4 for local mechanics and the external handoff.

## See also

- [`SKILL.md`](SKILL.md) — top-level git version control principles and policy
- [`01-git-native-mode.md`](01-git-native-mode.md) — git-native mode isolation recipes
- [`02-gitbutler-mode.md`](02-gitbutler-mode.md) — GitButler mode isolation recipes

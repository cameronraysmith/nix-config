# Tiered ceremony in jj mode

This document establishes the three-tier ceremony model that governs how much version-control apparatus a given jj-mode workstream warrants.
The doctrine is monotonic escalation: stay at the lowest tier that satisfies the work's verification needs, ascend only when a concrete trigger fires, and descend back once the trigger resolves.
Most jj work is tier 1.
Bookmark creation has a specific operational trigger (engaging the nix-flake-pr-cycle workflow with CI as the severity-raising mechanism), not a general "this work is important" intuition.
The diamond workflow is reserved for genuine multi-stream parallel work, not for solo single-stream development that happens to span several commits.

For the theoretical treatment of the diamond workflow (lattice theory, event structures, VSM mapping, four-phase recipe), see `diamond-workflow.md` in this directory.
For the operational reference on the development join entity (edit-route cycle, conflict behavior, join + wip structure, composite maintenance invariant), see `SKILL.md` in this directory.
For mode-detection context (when this document applies versus git-native or GitButler), see the `preferences-git-version-control` skill's `03-jj-mode.md`.

These tiers choose local working-copy ceremony, independently of risk class and PR shape.
Every externally published change in a queue-managed GitHub repository follows `git-stacked-pr-integration` §Queue authorization, including the installation-readiness hold.
Workers return verified refs and evidence; the publisher handles external handoff under that owner.

## Tier 1: anonymous chain on `@`

What it is: commits accumulate on `@` as an anonymous chain descending from the repository's default trunk bookmark (typically `main`).
No bookmark beyond the trunk one is created.
When the chain is ready for external publication, return its verified ref or name a task bookmark for publication under the policy owner.

Trigger to be in this tier: default state.
Routine repo maintenance, small fixes, atomic commits each individually safe to land on the trunk, work where local `just check-fast` provides adequate verification severity.

Cost: zero ceremony.
Local work needs no task bookmark until publication requires one.
Verification severity is bounded by what local checks can establish on `currentSystem`.

Operations: regular `jj describe -m "..."` + `jj new` cycle as documented in `SKILL.md`.
External handoff follows `git-stacked-pr-integration` §Queue authorization; tier 1 does not permit a direct-trunk push for this queue.

## Tier 2: single named bookmark

What it is: one bookmark created at a specific change on an existing anonymous chain (or at `@-`), pushed to the remote to engage the nix-flake-pr-cycle workflow.
The task ref supports PR publication and CI feedback through `nix-flake-pr-cycle`.
CI feedback extends local validation to the configured CI system set; the owner governs external authorization.

Trigger to enter: the work's verification severity needs exceed what local `just check-fast` provides.
Concretely, this fires when the change touches multi-platform artifacts, when the change is large enough that human review would benefit from a unified PR view, or when the change must clear the fleet-wide check matrix before reaching the trunk.
The bookmark supplies a stable ref for publication or handoff.

Cost: one bookmark name and a PR publication/feedback cycle.
Address failures through `nix-flake-pr-cycle`, then follow `git-stacked-pr-integration` §Queue authorization for asynchronous handoff.

Operations to enter (retroactive bookmark creation on an existing anonymous chain):

```bash
jj bookmark create <name> -r <change-id>   # or -r @- for the chain tip
jj git push --bookmark <name>
```

These task-bookmark examples are for ordinary PRs; registered stacks use the owner's publication overrides.
Follow `nix-flake-pr-cycle` for validation and CI feedback, and `git-stacked-pr-integration` §Queue authorization for external handoff.
After remote completion is observed, propose bookmark cleanup under `SKILL.md` §Post-session cleanup and return to tier 1 as appropriate.

## Tier 3: diamond workflow with development join

What it is: two or more bookmarks active simultaneously, with a multi-parent `[merge]` commit merging all active chain tips and a `[wip]` commit on top where `@` resides — the canonical two-commit development join.
Per Krycho's canonical model, `[wip]` sits on top of `[merge]` so that `[merge]` stays frozen and `[wip]` serves as scratch space; see `docs/notes/development/version-control/references/krycho-jujutsu-megamerges-and-jj-absorb.md` for the canonical structure and routing recipe.
`@` must remain this empty `[wip]`; see the `@`-stays-`[wip]` routing guard below.
Edits in `@` (which is `[wip]`) route to the correct chain via the canonical two-recipe pattern documented in `SKILL.md` §"Routing to a chain: append vs amend": the append-route (`jj squash --from @ --insert-after <chain-tip> -m "msg" --keep-emptied` followed by a bookmark-move to the new commit-id surfaced in the `Created new commit <id>` output) is the default for landing new atomic commits on a chain, and the amend-route (`jj squash --from @ --into <chain-tip> --keep-emptied`, with `-m` omitted) is reserved for fixups against the existing chain-tip commit.
`jj absorb` is an alternative that auto-routes by blame and preserves `[wip]` automatically; see `SKILL.md` for the conflict-and-absorb interaction.
`[merge]` is never touched by any routing operation, and `[wip]`'s description is ephemeral so no description-recovery step is required after a squash.
Invariant: `@` is always the empty `[wip]` sitting directly on the frozen `[merge]`, because that shared empty `[wip]` is the coordination surface every editor — human or agent — writes concurrently, so drifting it off `[wip]` collapses the very thing that makes N concurrent editors safe.
Therefore never `jj describe @` (consumes the wip into a content commit) and never relocate `@` via the positional rebase forms `jj rebase -r @ --insert-before/--insert-after <target>` or `jj rebase --revisions @ --insert-before/--insert-after <target>` (these drop `@` off or below the join).
All content leaves `@` by routing DOWNWARD only — `jj absorb`, or `jj squash --from @ --insert-after/--insert-before <target> -m "msg" --keep-emptied [-- <paths>]` (append-route) and `jj squash --from @ --into <chain-tip> --keep-emptied` (amend-route, `-m` omitted) — which create or amend a target while leaving `@` empty in place.
The one sanctioned `jj rebase` naming `@` is the destination form `jj rebase -r @ -d <chain-a> -d <chain-b> …` that re-anchors the empty `@` when adding or removing a chain; it does not drift `@`.
Where any splice or by-relocation recipe references a separate stacked commit `<X>`, that `<X>` must be a SEPARATE already-sealed non-wip commit, never `@`/`[wip]` itself.
See `SKILL.md` invariant (iii-b) and §"The edit-route cycle" for the full canon and command templates.
Phase 4 linearizes the local chains and returns a verified ref for publication under `git-stacked-pr-integration` §Queue authorization.
The local tier does not select a different landing mechanism.

Trigger to enter: two or more independent work streams in the same repo concurrently.
Examples include multiple beads issues within an epic being worked in parallel, a vocab refactor running alongside a peer agent's separate workstream, or parallel experiments that should compose into a coherent integrated state for validation.
A single workstream that happens to span several commits does not trigger tier 3 — that is still tier 1 or tier 2 depending on the verification needs.

Cost: routing discipline (every edit must be intentionally routed to the right chain before yielding control), editor-hang avoidance vigilance (every commit-boundary subcommand needs `-m`; see the editor-hang reference in vanixiets memory), careful bookmark and development-join maintenance per the composite maintenance invariant in `SKILL.md`, and pre-edit cross-chain file-collision reconnaissance before each file edit in `[wip]` (see `SKILL.md` §"Pre-edit cross-chain file-collision reconnaissance").

Operations to enter (promote from tier 2 by adding a second parent to `@` and layering `[wip]` on top):

```bash
# If the new bookmark already exists at some change:
jj new <existing-bookmark> <new-bookmark> -m "join N=2: <alphabetical bookmarks, comma-separated>"
jj new @ -m "wip"   # layer [wip] on top of [merge]; @ is now [wip]

# If the new bookmark doesn't exist yet, seed it first:
jj new main -m "wip(<name>): seed chain"
jj bookmark create <new-bookmark> -r @
# then promote @ to a development join over both bookmarks, layering [wip] on top:
jj new <existing-bookmark> <new-bookmark> -m "join N=2: <alphabetical bookmarks, comma-separated>"
jj new @ -m "wip"
```

Describe `[merge]` once with the state-based convention `join N=<cardinality>: <alphabetical, comma-separated parent chain bookmarks>` (unbookmarked parents render as backtick-wrapped short change_ids), per the join + wip structure documented in `SKILL.md`; do not re-describe `[merge]` after creation, and rewrite the description in full whenever parents change so it always declares the current state.

Operations to dissolve and linearize remain in `diamond-workflow.md` §Phase 4.
`jj-linearize-join` performs the local transformation; return its verified result for publication under `git-stacked-pr-integration` §Queue authorization.
After local dissolution, work can resume in a single-parent chain without waiting for landing.
Cleanup of submitted bookmarks requires later remote-completion evidence and the existing user approval.

For the four-phase theoretical treatment and lattice-theoretic foundation, see `diamond-workflow.md`.
For the operational entity-level reference of the development join, see `SKILL.md`.

## Transition recipes

Tier 1 → tier 2 (retroactive bookmark on an existing anonymous chain):

```bash
jj bookmark create <name> -r <change-id>   # or -r @- for the chain tip
jj git push --bookmark <name>
```

Tier 2 → tier 3 (add a second parent to create `[merge]`, then layer `[wip]` on top):

```bash
jj new <existing-bookmark> <new-bookmark> -m "join N=2: <alphabetical bookmarks, comma-separated>"
jj new @ -m "wip"
```

Tier 3 → tier 1: use `diamond-workflow.md` §Phase 4 to linearize and leave the development join, then return the verified ref for publication under the policy owner.
After remote completion is observed, follow the approved cleanup procedure in `SKILL.md` §Post-session cleanup.
No tier transition performs manual fast-forward or Mergify landing for queue-managed repositories.

Descent is always available once the tier's trigger resolves.
Do not stay at a higher tier than the work currently warrants; ceremony has a real coordination cost.

## Separate working copies are not a tier

In jj mode, a separate working copy is NOT a tier in this model.
It is not the mechanism for parallelizing related work — that is the diamond workflow's role at tier 3, accomplished via the development join in a single working copy.

A separate working copy is reserved for two cases.
The first is that something outside this session needs its own filesystem tree: an external agent framework driving its own process against the repository, a long-running build that must not see ongoing edits, or a side-by-side comparison of two states.
The second is that the user explicitly requests isolation by name in-session, with utterances naming `worktree`, `workspace`, `isolate`, `separate working copy`, or path forms like `.worktrees/X`.
Absent either trigger, all parallel work in jj mode uses the diamond workflow's development join.

jj workspaces and git worktrees are not interchangeable, so the choice between them is not a matter of taste.
A `jj workspace add` directory carries `.jj` and no `.git`, so jj works inside it but flake evaluation degrades to a `path:` source with no revision that copies `.jj` and gitignored directories into the store.
A `git worktree add` directory carries `.git` and no `.jj`, so jj is unavailable inside it while flake evaluation resolves to `git+file://…&rev=<sha>` and yields the same store path as the primary.
In a flake repository, therefore, isolation means a git worktree.

See `jj-version-control/SKILL.md` §"Worktree interop" for the git-worktree discipline and mechanics, and `jj-workflow/SKILL.md` "Workspace creation" for the `jj workspace add` mechanics in a non-flake repository.

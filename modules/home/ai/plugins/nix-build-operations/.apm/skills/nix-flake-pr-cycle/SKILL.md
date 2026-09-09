---
name: nix-flake-pr-cycle
description: >
  Operational workflow for flake-bearing repositories: enumerate checks, probe targeted slices with nix eval and nix build, validate locally, warm CI through git-stacked-pr-integration, publish a PR, inspect nixbot feedback, and hand off through that skill's Queue authorization section. Phase 1 is also a standalone coverage audit. Load when validating a flake before publication, opening a PR, investigating CI feedback, or preparing asynchronous queue authorization.
---

# Nix flake PR cycle

## Framing

This skill is the agent operationalizing the CCV closure operator on the local flake.
The phases cover local validation, publication, CI feedback, and external handoff through `git-stacked-pr-integration` §Queue authorization.
Phase 1 (enumerate and probe) is a legitimate stop-point on its own — an audit-only invocation that asks "does the current check set cover everything relevant in this repository?" without intending to push.
The later phases compose into the full validate-to-merge cycle when the intent is integration.
For the theoretical anchor — operating-envelope-plus-regulator pairs composing into a single closure operator over the build graph — see `preferences-compositional-continuous-verification`.

Enumeration surveys the check suite; targeted probes and local validation exercise selected checks on `currentSystem`.
Publication exposes the change to CI, while the policy owner governs authorization and asynchronous landing.
Treating the phases as separable invocations rather than a monolithic recipe is deliberate; the agent may legitimately enter at any phase given the right state, and the phase numbering reflects the natural order rather than a rigid sequence.

## Phase 1 — enumerate and probe

Enumeration serves a tactical purpose (find the slice to probe for the current change) and a strategic purpose (audit whether the check set actually covers the artifacts in the repository).
The canonical source for these commands is `preferences-compositional-continuous-verification`; this skill is the operational instance.

```bash
nix eval --json ".#checks.$(nix eval --impure --raw --expr 'builtins.currentSystem')" --apply builtins.attrNames | jaq -r '.[]' | wc -l
nix eval --json ".#checks.$(nix eval --impure --raw --expr 'builtins.currentSystem')" --apply builtins.attrNames | jaq -r '.[]'
```

Once the slice of interest is identified, exercise it directly without paying the cost of the full check matrix.

```bash
nix eval ".#checks.$(nix eval --impure --raw --expr 'builtins.currentSystem').<name>"
nix build ".#checks.$(nix eval --impure --raw --expr 'builtins.currentSystem').<name>" -L --show-trace
```

At this phase the agent answers two audit questions in addition to whatever tactical probe motivated the enumeration.
First, does the current check set cover everything relevant in the repository, or are unchecked components leaking?
Second, do existing checks include observability-interaction verification for each artifact's check set?

Enumeration as written covers `currentSystem` only.
Audit fleet coverage by evaluating each declared system or reading the active CI configuration; `preferences-nix-checks-architecture` documents the multi-system audit form.
Vanixiets' nixbot builds x86_64-linux, so native laptop feedback is a separate observation.

VM-based (`nixosTest`) and nspawn-container check kinds may fail at `nix eval` or `nix build` locally when the workstation's nix daemon lacks the `kvm` and `nixos-test` sandbox features.
Such failures during Phase 1 probing are worker-capability gaps in the local environment, not check-set gaps in the flake — the same attribute will evaluate and build correctly on properly-configured buildbot workers (see `preferences-nix-ci-cd-integration` §"Pipeline architecture for multi-system repositories" on worker-capability heterogeneity).
Record the gap as an environmental note rather than a finding against the regulator.

Phase 1 invocations terminate here when the intent is audit-only — no push, no PR, no monitor.
The output of the audit is typically a beads issue (or update to an existing issue) describing the unchecked artifact and the regulator that needs to exist, rather than an immediate code change.
Per the no-leak principle in `preferences-compositional-continuous-verification`, an artifact discovered to be unchecked is a structural obligation toward traceability — wire the regulator in the same commit that touches the artifact, or open an issue when wiring is out of scope for the current session.

## Phase 2 — full local validation

`just check-fast` runs `nix-fast-build` over `.#checks.<currentSystem>` in parallel under the local content-addressed cache, with `--eval-workers 4` to throttle SQLite eval-cache contention.
A local pass establishes feedback for the tested inputs and system; a changed post-merge tree may require new CI builds.

Pipe through tee so subsequent failure investigation has structured evidence on disk.

```bash
mkdir -p logs
just check-fast 2>&1 | tee logs/check-fast-$(date +%Y%m%dT%H%M%S).log
```

Before publication from an aarch64-darwin laptop, follow the Linux CI-warming command and store-reuse explanation in `git-stacked-pr-integration` §Queue authorization.
That warming step is separate from this native local feedback loop.

The sibling `just check` recipe runs `nix flake check -L --show-trace` sequentially and is the slower, verbose alternative.
Prefer it when a single-derivation failure under `check-fast` is obscured by parallel buffering and the linear trace order matters more than wall-clock.

On failure, drop to `nix build .#checks.<name> -L --show-trace` for the failing slice in isolation, then dispatch a surgical-search subagent with the log as context for root-cause analysis and a minimal-fix proposal.
The single-slice rebuild with `-L --show-trace` is also the right form for capturing a clean trace for the issue tracker when the failure cause is non-obvious from the parallel `check-fast` output.
The `logs/` directory is already gitignored at the repo root, so failure logs persist on disk without polluting tracked state.

The relationship between `just check-fast` and `nix flake check` is one of execution strategy rather than coverage: both evaluate the same `.#checks.<currentSystem>` attrset against the same pinned inputs and produce the same pass-or-fail decision modulo parallel scheduling order.
Treat them as interchangeable for the closure-operator semantics and choose between them based on the diagnostic question being asked.

Validation can run on the development join or on a sealed, linearized chain when their relevant inputs match.
Recheck affected inputs after linearization rather than inferring queue eligibility from the position of `@`.

## Phase 3 — bookmark and push

The following bookmark and draft-PR examples are for an ordinary PR authored in colocated jj.
For a stack, return the verified chain ref to the publisher and follow `git-stacked-pr-integration` §Queue authorization and §Fleet upstream overrides for publication instead.
Workers in a shared development join retain the return-by-ref and no-VCS-write restrictions in `jj-version-control`.
Create a bookmark on the parent of `@` (the working-copy commit is conventionally empty) or advance an existing bookmark to track the most recent sealed change.

```bash
jj bookmark create -r @- <bookmark-name>
# or, advancing an existing bookmark:
jj bookmark set <bookmark-name> -r @-
```

If `main@origin` has advanced, update the local chain under the jj safety contract and revalidate changed inputs before publication.

```bash
jj git fetch
jj rebase -s <chain-base> -d main@origin
```

Push the non-default task bookmark to the GitHub remote.

```bash
jj git push -b <bookmark-name>
```

`jj git push` to a non-default bookmark is auto-permitted by the `gate-dangerous-commands` hook with an ntfy NOTICE; `jj git push` to `main` remains gated and requires explicit confirmation.
Plain `git push` is auto-permitted with a NOTICE in its ordinary forms — including `--force-with-lease` to a task branch and a non-force push to `main` — because an interactive prompt there stalls agent workers launched with permissions bypassed.
The destructive forms remain gated: a force push naming `main`, `master`, or the resolved default ref, a delete refspec in either the `:branch` or the `--delete` form, and `--mirror`/`--all`.
That gating reads the raw command bytes of the tool call, so a push performed inside a script is not seen by it.
The NOTICE is informational rather than blocking — it surfaces the push to the user's notification stream so a foreground operator can intervene if the push was accidental, while permitting routine bookmark publication without interactive prompts.
Hook permission does not authorize direct-default-branch landing in a queue-managed repository; external handoff follows the policy owner.

## Phase 4 — draft pull request creation

The `gate-dangerous-commands` hook's whitelist matches the canonical creation form exactly; deviating from this shape forces an interactive permission prompt.

```bash
gh pr create -d -a "@me" -B main -H <bookmark-name> -t "<conventional-commits title>" -b ""
```

The flags are `-d` for draft, `-a "@me"` to self-assign, `-B main` for the base branch, `-H <bookmark>` for the head, and `-b ""` to leave the body empty.
Per the user's PR creation protocol — referenced in full via the GitHub PR safety section of `preferences-git-version-control` — the immutable title and body fields stay generic at creation while richer description goes in as a post-creation comment.

```bash
gh pr comment <N> --body "<markdown description>"
```

Title and description in the immutable fields cannot be edited after creation, so the discipline is generic-at-creation, detailed-in-comment.
Keep the PR title descriptive under the referenced creation protocol.

For multi-chain work, `jj-version-control/diamond-workflow.md` §Phase 4 preserves local linearization and returns a verified chain ref for stack publication.
Queue-managed GitHub repositories follow `git-stacked-pr-integration` §Queue authorization; do not create an extra aggregate PR as a separate merge gate.

## Phase 5 — inspect CI feedback

Inspect the PR's reported check names, links, and states:

```bash
gh pr checks <N> --json name,link,state
```

Nixbot feedback includes `nixbot/nix-eval` and `nixbot/nix-build` in vanixiets.
Use the returned links and `ci-log-verification` to investigate failures, then return to targeted local validation before republishing.
Reported PR checks provide feedback; they do not redefine the ruleset-derived selected-head gate described in `git-stacked-pr-integration` §Queue authorization.
Lower stack members can provide independent build feedback without each becoming a separate queue gate.
Repositories still using buildbot can investigate their `buildbot/` links through `buildbot-logs`; that diagnostic does not select this protocol's landing authority.

## Phase 6 — prepare authorization

Mark the PR ready when it is ready for the applicable review:

```bash
gh pr ready <N>
```

Follow `git-stacked-pr-integration` §Queue authorization for review timing, publication-shape checks, the installation hold, and the authorization signal.
The owner also supplies the upstream overrides for registered stacks.
In vanixiets, Mergify remains configured as the working landing path until the coordinated installation window; this procedure does not signal the new queue before readiness.

## Phase 7 — asynchronous handoff

After authorization, return to other work without polling for landing.
Use the rejection-feedback route in `git-stacked-pr-integration` §Queue authorization if the queue reports a problem.
When later work needs an updated base, fetch and rebase its fresh chain under `jj-version-control`'s local safety contracts.
Do not resync a landed stack; the owner defines that upstream override.

## Evidence convention

The `logs/` directory at the repo root is the canonical evidence directory and is already gitignored.
On failure, keep `logs/check-fast-*.log` and `logs/buildbot-*-*.log` for the duration of the investigation so subagents have stable input.
Retain verification evidence needed for the handoff; an authorization report must not claim that landing has already completed.
The naming convention uses ISO-8601 timestamps for local check runs and `builder_id`-`build_number` for buildbot fetches so the filename itself answers "which run is this?" without requiring the contents to be opened.
Subagents tasked with failure analysis should be pointed at the specific log file path rather than at the `logs/` directory in general, both to avoid loading unrelated history into their context and to make the evidence chain explicit for later session checkpoints.

## NOTICEs at meaningful transitions

Use `ntfy-send "<message>" [<topic>]` to push a notification at meaningful transitions; the default topic is the local hostname (`hostname -s`).
Useful transitions include task publication, PR draft creation with its URL, CI failure, PR readiness, and queue handoff.
Keep messages short — repo name plus state plus PR number is sufficient.

```bash
ntfy-send "vanixiets PR #<N> draft created — <url>"
ntfy-send "vanixiets PR #<N> nixbot feedback available"
ntfy-send "vanixiets PR #<N> authorized; queue owns landing"
```

The wrapper script lives at `modules/home/tools/commands/system/ntfy-send.sh` and uses `/usr/bin/curl` on Darwin to satisfy endpoint-security restrictions on ad-hoc-signed Nix store binaries; the topic argument is positional and defaults to the local hostname so the same script works unmodified across the fleet.
Suppress NOTICEs during dense local iteration (rapid push-monitor-fix cycles) and re-enable them once the cadence drops to integration-significant transitions, so the notification stream stays signal-rich.

## Caveats and known scope

`just check-fast` without a system argument covers `currentSystem` only; follow the owner's Linux warming route before publication for this protocol.
Every queue-managed external handoff follows `git-stacked-pr-integration` §Queue authorization, independently of local VCS mode or author identity.
Skill content (this SKILL.md) activates via `home-manager switch`; the working-tree path is canonical during authoring sessions, but the symlinked store path that agents read at runtime lags by one switch cycle.
The `gate-dangerous-commands` hook auto-permits `git push` in every form but the destructive subset listed in Phase 3, `jj git push` to non-default bookmarks, and the canonical `gh pr create -d ... -b ""` triad; updates to the hook itself similarly lag by one switch cycle.

The phase numbering is procedural rather than rigid — entering at Phase 3 with an already-validated chain is legitimate, as is iterating Phase 1–2 multiple times before any push.
The numbering reflects the natural order when starting from a fresh chain and pursuing integration; it is not a sequence the agent is obligated to execute monolithically.
Use the narrowest validation that can falsify the change: targeted Phase 1 probes for a scoped edit and the broader Phase 2 pass when the affected check set warrants it.

## Cross-references

- `preferences-compositional-continuous-verification` — theoretical anchor; canonical source for the enumeration commands
- `preferences-nix-checks-architecture` — flake-side check taxonomy and meta-check derivation patterns; §"Choosing among integration regulators" for the three-way process-compose / nspawn / full VM regulator-kind framing referenced in Phase 1 worker-capability gap diagnosis
- `preferences-nix-ci-cd-integration` — buildbot-nix as the closure-operator executor in CI; effect system; migration patterns
- `preferences-validation-assurance` — severity, evidence quality, confidence promotion chain
- `preferences-git-version-control` — GitHub PR creation safety, branch workflow, working branch isolation
- `jj-version-control/diamond-workflow.md` §Phase 4 — local chain linearization and return-by-ref
- `git-stacked-pr-integration` §Queue authorization — CI warming, authorization, and asynchronous landing; §Fleet upstream overrides — stack publication constraints
- `session-orient` — session entry; reference for procedural-skill tone

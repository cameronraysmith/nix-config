<!--
Raw capture of the brainstorming step for this change.

Procedural note: the interactive `superpowers:brainstorming` skill was unavailable to this subagent and was not invoked.
The supervisor explicitly authorized manual capture from the ADR and launch brief, following the stand-up-gitea-mq-on-magnetite precedent.
This decision log records supplied decisions as [given] and source-derived choices as [decided].
-->

# Background

The reader is an implementation agent or operator arriving without the preceding landing discussion.
`docs/notes/development/version-control/adr-substitution-first-rollup-landing.md` §Decision, Appendix A R15/R16, and Appendix B govern this change.
It replaces the agent-facing synchronous landing procedure with authorization followed by queue-owned landing.
The service is already active on magnetite at https://mq.scientistexperience.net, with App id 4875422, `batchMax = 5`, and required checks `nixbot/nix-eval` and `nixbot/nix-build`.
It manages zero repositories because App installation is deliberately deferred.
This deployment snapshot comes from the supervisor's brief; this planning run has not independently queried the service.

# Decision chain

## Q1 [given]: ownership and scope

This change owns the instruction fragments, first-party skills, `.github/mergify.yml` queue retirement, and demotion of `pkgs/by-name/stack-land/` to assertions only.
`stand-up-gitea-mq-on-magnetite` owns R11/R13/R14 service and App operations.
`filter-check-sources-for-substitution` owns R1/R2 source filtering and the warming mechanism; this change makes the existing warming command discoverable in the author procedure.
Workers keep returning verified refs without publication, and local jj development-join and return-by-ref contracts remain unchanged.
The orchestrator publishes delegated stacks and authorizes them when policy permits; the queue performs landing.
People publishing their own ordinary PRs or stacks use the same authorization policy.

## Q2 [given]: authorization policy

The first-party `git-stacked-pr-integration` skill will own one canonical queue-authorization section for ordinary PRs and registered stacks.
Risk class decides when authorization is permitted; PR shape decides how it is signalled.
CI-sufficient changes may be authorized without additional review; review-required changes need review of the intended changes, including every selected stack member, first.
Under E1 this ordering is a convention subject to manual audit.
The queue reads no reviews and the App bypasses rulesets, so an approving-review rule cannot enforce that ordering.
Authorship by a person or agent changes neither axis.

Ordinary trunk-based PRs use GitHub native auto-merge, by button or `gh pr merge --auto`.
Registered stacks use `mergify stack push --github-native`, verification of native registration and selected-head ancestry, and `merge-queue` on the topmost intended PR.
Auto-merge is prohibited on every stack member, including the bottom member.
The ADR's `internal/poller/poller.go::enqueueAutoMergePRs` targets `pr.BaseBranch` without stack resolution, whereas `labeledTargetBranch` calls `ResolveStack`.
`PollOnce` runs auto-merge enqueue first and `enqueueLabeledPRs` skips already-queued PRs, so a correct top label cannot repair a member's auto-merge signal.
The author returns to other work after authorization; a rejection is reported by a queue comment on the PR.

## Q3 [decided]: reuse the policy owner and capability names

The archived `integrate-mergify-stacked-landing` change already establishes `first-party-skill-distribution`, `skill-corpus-interface`, and `third-party-plugin-dependency`.
Reuse those interface capabilities and replace the existing skill-corpus requirement's synchronous landing clauses explicitly.
Add `machine-interface` requirements for the assertion tool and queue-configuration transition, following the schema's machine-side classification.
No new behavioral requirements or world-assumption numbers are needed: the sibling service change owns A22–A28.
Those assumptions inform context and the satisfaction argument rather than being duplicated as fresh requirements here.

Creating a new competing skill was rejected because the current first-party skill already owns landing policy.
Repeating the full procedure in every caller was rejected because `modules/home/ai/plugins/README.md` §Authoring assigns each concept one owner.

## Q4 [given]: upstream and delivery boundaries

The upstream `mergify-stack` skill is apm-installed and has no source directory under `modules/home/ai/plugins/`.
Leave it unchanged and put the mandatory native-registration flag, branch-prefix explanation, and never-resync-a-landed-stack override in the first-party owner.
`mergify-cli` source `crates/mergify-stack/src/stack_context.rs::configured_branch_prefix`, `default_branch_prefix`, and `resolve_default_branch_prefix` resolves `mergify-cli.stack-branch-prefix`, defaulting to `stack/<author>`.
Document that configured namespace rather than inventing a fleet-specific prefix.
Retain Change-Id identity, PR-author identity, and branch bookkeeping; start a fresh stack after landing instead of resyncing or repushing the landed stack.
The ADR's V1 re-confirmation belongs to the service change's first live stacked landing and does not grant permission to use resync as a normal author step.

Delivered `~/.claude/skills/<skill>/SKILL.md` files are read-only Nix store symlinks.
Edits belong in the plugins source, then pass through `pkgs/by-name/apm-skills-compose/` and `modules/home/ai/skills/`.
Verification requires source inspection and a rebuild with output inspection.
Generated root and user-level agent context likewise comes from authored fragments, never from manual edits to the delivered file.

## Q5 [given]: warming guidance

The owner section will include `just check-fast auto off x86_64-linux 2>&1 | tee logs/checks-linux-$(date +%Y%m%d-%H%M%S).log` for an aarch64-darwin laptop.
`justfile::check-fast` takes positional `nom push system` arguments and adds `--remote magnetite.zt --no-download --retries 2` for the non-native target.
Outputs stay on magnetite for nixbot's local-store reuse.
`just check-fast auto on` populates niks3 for peer darwin laptops and is unnecessary for warming CI.
Native local feedback remains separate, and changing the tested tree can require additional builds.

## Q6 [given]: migration order

Land and deliver the instruction and skill edits before installing the App.
Until installation, the new owner section must expose a transition hold: do not use the new authorization signals on an unmanaged repository, and request the coordinated cutover instead of inventing a fallback.
The existing Mergify queue remains configured and working during that interval.
Remove its `queue human PRs`, `queue bot PRs`, `default`, and `bot-updates` queue configuration in the App-installation window, not earlier.
Keep unrelated assignment and review rules.
An agent following stale text after installation could bypass the queue or stall; delivery verification is an installation prerequisite.

`stack-land` stays packaged as a dry-run assertion tool with no real push path and no claim to establish queue eligibility.
Keeping its old push mode as a fallback was rejected by the ADR.
The existing assertions can still provide diagnostics; their all-member check predicate differs from the queue's selected-head gate.

## Q7 [decided]: source inventory and ADR audit

All eleven requested first-party instruction and skill paths exist.
The repository-overview glob resolves to `agent-context-vanixiets/.apm/instructions/10-repository-overview.instructions.md`.
The tool package contains `package.nix`, `stack-land.sh`, and `test-stack-land.sh`; `.github/mergify.yml` exists with the two queue rules and definitions.
Each document receives its own task and verification.

The formal ADR directory contains 21 numbered ADRs plus `index.md`.
A case-insensitive search for `mergify|buildbot|queue|landing` found zero matching files.
Inspection of ADR-0012 §Decision and ADR-0016 §Decision finds historical GitHub Actions choices, with no commitment to Mergify's server queue or buildbot as the landing gate.
Repeat the audit during apply and record count and hits; a newly found commitment requires an explicit superseding ADR decision rather than contradictory edits.

# Design trade-offs

Static corpus checks establish visible text, not author compliance, correct risk classification, native registration, or service behavior.
The authority rationale depends on sibling A22/A24/A27/A28 and the pinned upstream symbols recorded in the ADR.
A23 covers GitHub member bookkeeping; A26 covers tested-SHA landing.
Keep these world facts in context and state the narrower document and tool guarantees in interface deltas.

The instruction-first cutover adds a short authorization hold before installation.
It avoids publishing unsafe commands while retaining the old queue configuration until the operator can switch landing paths in one window.

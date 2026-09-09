---
name: git-stacked-pr-integration
description: First-party queue authorization for ordinary trunk-based PRs and registered stacks, including worker/orchestrator roles, risk-based review timing, asynchronous handoff, CI warming, and fleet overrides of mergify-stack. Use when preparing or publishing stacked changes, authorizing an ordinary PR or stack, or reviewing VCS routing and landing evidence.
---

# PR integration policy

This skill guides authors and orchestrators preparing ordinary PRs or stacked changes for repositories managed by gitea-mq.
It owns queue authorization, fleet role contracts, VCS routing, and landing evidence.
The upstream `mergify-stack` skill owns Git-native stack authoring and publication mechanics, subject to §Fleet upstream overrides below.
Keep both skills separately visible; the upstream skill is third-party content and must remain unedited.

The pattern was verified landing PRs 2738, 2739, and 2740 in cameronraysmith/vanixiets on 2026-08-18: main was fast-forwarded to fe5a4b71 and GitHub merged all three PRs by reachability within one second.
This evidence covers only the observed fast-forward landing and GitHub reachability.
It does not establish Mergify publication, native registration, queue batching, or asynchronous queue completion.

## Role contracts

A worker prepares and verifies one independently shippable change, commits it, and returns its ref plus verification evidence to the orchestrator without publishing or landing it.
The worker follows `mergify-stack` for Git-native stack identity, commit, and rewrite mechanics while keeping the result local.
Each stack delivery step remains one commit and one PR, with exactly one `Change-Id` matching `^I[0-9a-f]{40}$` and the Linear issue id in the commit body.
Corrections update that delivery commit only; this does not permit rewriting unrelated history.

For delegated work, the orchestrator alone orders returned refs and publishes their pull-request stack through `mergify-stack`, subject to §Fleet upstream overrides.
Its terminal action is authorization under §Queue authorization, followed by asynchronous queue ownership of landing.
Independent authors use the same policy directly for their own PRs and stacks.

## Requirement-to-mechanism map

| Requirement | Mechanism | Owner |
| --- | --- | --- |
| Each step is independently shippable | Run relevant tests and return the ref with evidence. | Worker |
| Git-native identity survives worker rewrites | Follow upstream `mergify-stack` and preserve `Change-Id` without publishing. | Worker |
| Delegated refs form the intended stack | Order and inspect refs, then publish under §Fleet upstream overrides. | Orchestrator |
| Authorization covers the intended changes | Follow §Queue authorization. | Author or orchestrator |
| Authorized work lands asynchronously | Test and land the selected head or batch. | Queue |
| Colocated-jj local work preserves the development join | Follow `jj-version-control` and its return-by-ref contract. | Worker and orchestrator |

## Queue authorization

This procedure takes effect for a repository only after its coordinated installation-readiness evidence is confirmed.
In vanixiets, gitea-mq is deployed at https://mq.scientistexperience.net with App id 4875422, `batchMax = 5`, and required external checks `nixbot/nix-eval` and `nixbot/nix-build`.
It manages zero repositories because the App is deliberately not yet installed.
Mergify's queues in `.github/mergify.yml` remain the working landing path until the operator-coordinated installation window.
Until readiness is confirmed, stop before authorization and request that coordinated cutover; do not use a direct-push or real `stack-land` fallback.

Risk class determines when to authorize; PR shape independently determines how to enqueue.
Human or agent authorship determines neither axis.
CI-sufficient changes need no additional review by policy, while review-required changes need review of all intended changes before the signal.
For a stack, that review includes every member selected by the topmost intended PR.
If the risk classification is unresolved, ask before authorizing.

Under policy E1, the enqueue signal itself is merge authorization, governed by convention and manual audit rather than queue enforcement of review.
The queue is review-blind and its App bypasses rulesets, so an approving-review rule does not constrain its ref update.
The queue derives required external checks from the forge ruleset; those checks gate the selected head and tested batch, not each lower stack member separately.
See `docs/notes/development/version-control/adr-substitution-first-rollup-landing.md` §Decision and Appendix A R15/R16 for this policy's authority.

Before publication from an aarch64-darwin laptop, warm Linux CI with:

```bash
just check-fast auto off x86_64-linux 2>&1 | tee logs/checks-linux-$(date +%Y%m%d-%H%M%S).log
```

`justfile::check-fast` takes positional `nom push system` parameters.
A non-native system adds `--remote magnetite.zt --no-download --retries 2`, building on magnetite and leaving outputs in magnetite's own store.
Nixbot reports those available outputs as `local` and skips them (`build_scheduler.py::JobScheduler._classify`).
`just check-fast auto on` populates niks3 for peer darwin laptops and is not needed to warm CI.
Native laptop feedback is separate; `--no-download` brings no outputs back to the laptop, and changed post-merge trees can still require new builds.

After warming and any required review, authorize according to shape:

1. For an ordinary trunk-based PR, enable GitHub native auto-merge with the button or `gh pr merge --auto <PR>`.
   That act authorizes the queue to merge the PR.
2. For a registered stack, publish with `mergify stack push --github-native` under §Fleet upstream overrides.
   Verify actual GitHub-native membership, that all intended lower-member heads are ancestors of the selected head, and that the selected head descends from the intended target.
   Command success or `Depends-On:` headers alone do not establish native registration; withhold authorization until missing membership or ancestry evidence is resolved.
   Verify absence of auto-merge on every stack member, then label only the topmost intended PR `merge-queue`.

Never enable auto-merge on any stack member, including the bottom member, even when the top PR has the correct label.
Gitea-mq `internal/poller/poller.go::enqueueAutoMergePRs` targets `pr.BaseBranch` without resolving the stack; `internal/poller/poller.go::labeledTargetBranch` calls `ResolveStack` to select the stack base.
`internal/poller/poller.go::PollOnce` runs auto-merge enqueue first, and `internal/poller/poller.go::enqueueLabeledPRs` skips already-queued PRs.
An upper member's auto-merge can therefore override a correct top label and silently land into the member below.
If any member has auto-merge enabled, remove it and inspect queue state before authorization.
Adding the correct top label does not repair an already queued entry; resolve that entry with the operator before proceeding.

After authorization, the author does not wait for landing and can begin other work.
The queue owns testing and landing; rejection arrives as a queue comment on the PR.

## Fleet upstream overrides

For this protocol, these first-party overrides take precedence over examples in the unedited upstream `mergify-stack` skill.
Stack publication requires `--github-native` and the registration checks in §Queue authorization, even when an upstream example uses plain push.

The remote stack namespace comes from `mergify-cli.stack-branch-prefix`, defaulting to `stack/<author>` when unset.
See mergify-cli `crates/mergify-stack/src/stack_context.rs::configured_branch_prefix`, `default_branch_prefix`, and `resolve_default_branch_prefix`.
Keep that published namespace and the PR-opening identity stable across updates so stack discovery finds the existing PRs.
The local work branch is separate from generated remote stack branches; renaming it alone does not redefine their identity.
There is no fixed fleet prefix that replaces the configured namespace.

Never resync or repush a landed stack as the normal author workflow; start a fresh stack for subsequent work.
Merged detection requires a merge timestamp and a head matching the local commit (`crates/mergify-stack/src/sync_status.rs::classify` and `crates/mergify-stack/src/changes.rs::classify`).
Closed-unmerged PRs can be recreated by the client (`crates/mergify-stack/src/remote_changes.rs::group_by_change_id`).
The ADR's first-live V1 re-confirmation is a controlled verification activity, not permission to reuse a landed stack.

## Optional assertions

`stack-land --dry-run --tip REV PR...` is available only as an optional diagnostic in this protocol, never as a landing mechanism or prerequisite for authorization.
It checks target ancestry, exactly one valid `Change-Id` per selected commit, and nonempty reported-check sets containing only `SUCCESS`, `NEUTRAL`, or `SKIPPED`.
Pending, failing, empty, or other check sets fail that diagnostic.
These all-member assertions differ from the queue's selected-head gate and establish neither review approval nor PR-set completeness.
Do not invoke the tool's real mode, including during the transition while its package demotion is pending.

## VCS routing

Git is the baseline; jj is an upgrade path when conflict volume warrants it.
The shared `Change-Id` format preserves identity and PR bookkeeping across that switch.
Use `mergify-stack` for Git-native local mechanics under the first-party overrides above.
When `.jj/` is present, keep development-join, hazard, recovery, and worktree operations in `jj-version-control`.
In either mode, workers return verified refs and the publisher follows §Queue authorization for external handoff.

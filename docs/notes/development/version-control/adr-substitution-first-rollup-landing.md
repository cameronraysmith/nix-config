---
title: "ADR-XXXX: Substitution-first landing through nixbot and gitea-mq batching"
---

## Status

Proposed, 2026-09-07; revised 2026-09-09.
Unimplemented.

Filed as a working note under `docs/notes/development/version-control/`.
Promotion to `docs/development/architecture/adrs/` with a sequence number follows discharge of the Compliance items in vanixiets.
V1 is discharged and no longer blocks promotion; it is marked for re-confirmation at the first live stacked landing.
Supersedes the working note `stacked-landing-settings-review.md` as the description of the landing mechanism; that note's validation of the fast-forward push remains valid.

Scope: every repository built by the `sciexp-nixbot` GitHub App.
First deployment: vanixiets.

Related: active OpenSpec changes `stand-up-gitea-mq-on-magnetite`, `filter-check-sources-for-substitution`, and `stand-up-nixbot-on-magnetite` (not yet archived); agent instructions `030-stacked-landing-protocol` and skill `git-stacked-pr-integration` (to be updated from Appendix B).
Appendix A is candidate material for the relevant changes, not a second normative specification; remove it when the deltas carry it.
Remove Appendix B when the instructions and skill carry its procedure.

## Context

### The naming

Three ecosystems meet in this decision and each has a word the others lack.

- Nix: a *derivation* describes a build from its inputs; a *substituter* is a binary cache that supplies its output instead of building it.
  *Substitution* is the act of taking it from there; reuse depends on input identity, not authorship.
- bors: a *rollup* is several approved changes landed as one tested unit; `staging` is the branch CI runs on before the base is fast-forwarded; `try` is a CI run that lands nothing; approval is `r+`.
- mergify-cli: a *stack* is one branch published as a chain of pull requests, one commit per PR, each carrying a `Change-Id` trailer that survives rebases.
- gitea-mq: a *batch* contains queue entries tested together; a labelled stack contributes one entry, regardless of its depth.

Substitution-first landing aims to reuse author-built derivations when the queue tests changes together.
With filtered sources and available cache outputs, CI builds only inputs that differ from those already built, including interactions between changes.
The queue constructs batches; an orchestrator does not assemble a separate rollup.

### The situation

The repository needs asynchronous landing for both ordinary trunk-based PRs and registered stacks.
The existing worker/orchestrator protocol prepares commits in jj clones and uses `stack-land` for a synchronous fast-forward after every member PR's checks pass (`030-stacked-landing-protocol`).
The proposed replacement must preserve the tested-tree property and reuse local builds without making a person wait for an orchestrator to assemble and publish a candidate.

The earlier proposal depended on a false distinction between a tested linear candidate and a queue-created merge commit.
gitea-mq constructs the merge commits before CI and then fast-forwards the target to the tested batch SHA (`internal/batch/batch.go::Engine.HandlePass`).
Its `README.md`, “Batching (bors-style)”, states: “On green it fast-forwards the target branch itself to the tested SHA (the merged tree is exactly what CI saw)”.
Batching changes history shape without losing that property, so an orchestrator rollup built on `staging` adds no substitution guarantee.

Two independent properties govern landing: risk class determines when someone may authorize a change, and PR shape determines which enqueue signal they use.
Human or agent authorship determines neither property.
CI-sufficient changes need no additional review by policy; review-required changes must receive review before authorization.

### Constraints established from source

Source paths below are relative to the named upstream clone under `~/ghq/github.com/`, at the revisions in Notes.
The verification reports in `logs/adr-verify/` record the supporting reads.

nixbot:

- Builds every PR on open, synchronize, reopen, and base retarget; no configuration disables PR builds, and draft status is ignored (`webhooks.py::_pr_action_builds`, `_parse_pr_event`; `repo_config.py::BranchConfig`).
  `[skip ci]` applies to branch pushes only and is deliberately withheld from PRs (`canceller.py::has_skip_ci_marker`; `webhooks.py::_parse_pr_event`).
- Always admits pushes to `staging`, `trying`, `gh-readonly-queue/*`, and `gitea-mq/*`, regardless of `build_branches` (`webhooks.py::MERGE_QUEUE_PATTERNS`; `service.py::CIService._process_change`).
  An empty `build_branches` excludes other non-default branches; an unset value inherits instance configuration (`repo_config.py::BranchConfig`).
- Build identity is the post-merge tree hash (`gitrepo.py::WorkTree.tree_hash`).
  A PR build merges its head into the current base tip; a branch push builds the pushed tree.
  Identical trees in one project reuse a build record, and terminal statuses replay to each new context (`db.py::get_or_create_build`; `build_reuse.py::replay_terminal_status`).
- Evaluates with `nix-eval-jobs --check-cache-status`; `cached` derivations run so Nix substitutes, `local` ones are skipped, cached failures are skipped as failures, and other statuses, including `notBuilt` or missing status, run (`build_scheduler.py::JobScheduler._classify`; `models.py::CacheStatus`).
  niks3 uploads are warn-only and do not fail a successful build (`build_run.py::AttributeBuilder._after_success`; `nixosModules/niks3.nix::services.nixbot.niks3`).
- Posts check runs `nixbot/nix-eval` and `nixbot/nix-build` on the PR head SHA, or the pushed SHA for a branch event (`status.py::ForgeStatusReporter`, `GitHubCheckRunPoster.post`).
- Cancels in-flight builds only when a PR closes unmerged; merged PR builds continue (`service.py::CIService._submit_pr_closed`; `canceller.py::CancellationManager.cancel_pr`).
- Gates PR effects through `effects_on_pull_requests`, independently of `effects_branches`; default-branch pushes always qualify, and other branches must match `effects_branches` (`effects.py::should_run_effects`).

nix-fast-build, used by vanixiets' `justfile::check-fast`:

- `--skip-cached` skips derivations reported `cached`; `local` outputs are uploaded without a build unless an output link is requested (`nix_fast_build/processes.py::nix_eval_jobs`; `nix_fast_build/workers.py::run_evaluation`).
- `--niks3-server https://niks3.scientistexperience.net` uploads every successful build result, whether built or substituted, and every `local` output; upload failure fails the run (`nix_fast_build/workers.py::run_builds`, `run_upload_worker`).
  Upload is opt-in: `just check-fast auto on` supplies the positional `push` parameter as `on` (`justfile::check-fast`).
  The recipe's parameters are positional (`nom push system`), and a requested system differing from the native one adds `--remote magnetite.zt --no-download --retries 2`, building on magnetite and leaving the outputs in magnetite's own store (`justfile::check-fast`).
  `--select` narrows the evaluated attributes with a Nix function; the recipe pins `--flake .#checks.$system` and `--eval-workers 4` (`nix_fast_build/processes.py::nix_eval_jobs`; `justfile::check-fast`).

gitea-mq, GitHub backend:

- `internal/poller/poller.go::enqueueAutoMergePRs` queues against `pr.BaseBranch` without resolving a stack.
  `enqueueLabeledPRs` uses `labeledTargetBranch`, which calls `ResolveStack` and queues against `stack.BaseBranch` when `MembersUpTo` finds the labelled PR.
  GitHub-native members are based on one another (operator assertion, consistent with `internal/github/forge.go::ResolveStack`, `internal/forge/forge.go::Stack.MembersUpTo`, and the branch-chain detection in `hintStackedPRs`).
  Auto-merge on an upper member therefore targets the member below, rather than trunk.
- `internal/poller/poller.go::PollOnce` runs auto-merge enqueue before label enqueue, and `enqueueLabeledPRs` skips already-queued PRs.
  When auto-merge enqueue succeeds, it overrides a correct label's target selection.
  Neither path reads `Depends-On:`; native registration is required for the stack-aware label path (`internal/github/forge.go::ResolveStack`).
- A labelled stack forms one queue entry; lower members land as ancestors of the selected head (`internal/poller/poller.go::enqueuePR`, `labeledTargetBranch`; `internal/batch/batch.go::Engine.Build`).
  Enqueue checks the selected head, not every lower member (`internal/poller/poller.go::prCheckResult`).
- With `batchMax = 20`, entries become `testing` and successful `Engine.HandlePass` deletes them through `internal/queue/batch.go::Service.SaveBatch`.
  Batch finalization posts completion and calls `Engine.ensureMergedOrClose` only for actual queue entries: for a labelled stack, the selected top PR alone.
  That helper polls for merged-or-closed state for about ten seconds and, if still unresolved, comments with the landing SHA and closes the entry PR.
  It never calls the forge merge endpoint (`internal/batch/batch.go::Engine.HandlePass`, `Engine.ensureMergedOrClose`).
- Lower stack members receive no queue-posted completion status and no explicit close from gitea-mq under this lifecycle.
  They can receive a pending `gitea-mq` hint before landing: `internal/poller/poller.go::PollOnce` calls `hintStackedPRs` without a batch-mode guard.
  The hint goes on unlabelled, unqueued branch-chain members, deduplicated by head SHA, with “Stack detected — add the 'merge-queue' label to the topmost PR you want to merge”.
  Their merged-or-closed state after the fast-forward is GitHub's behaviour alone, unobserved by the queue.
  `finalizeLabeledMerge` and its “Merge queue passed (stack)” completion status are legacy/non-batch only, reachable here solely for persisted non-batch entries surviving a configuration change.
- The batch engine is active when `batchMax != 1`; zero means unlimited, while twenty limits queue entries, not commits (`internal/batch/batch.go::Engine.Enabled`; `internal/queue/batch.go::Service.FormBatch`).
  A single up-to-date entry with skipping enabled can land its original head without a batch ref or extra branch CI run (`internal/batch/batch.go::Engine.headIfUpToDate`, `Engine.Build`).
  Existing head checks are still evaluated (`internal/poller/poller.go::pollMergeBranchChecks`; `internal/batch/monitor.go::Engine.HandleCheck`).
- A head behind the target, an `IsUpToDate` error, or two or more entries takes `CreateMergeBranch`/`MergeInto` through `Engine.stack` (`internal/batch/batch.go::Engine.Build`, `Engine.headIfUpToDate`; `internal/github/forge.go::mergeHead`).
  An `ErrNotFastForward` rebuild and bisection re-entry repeat that selection and can take the merge-branch path (`internal/batch/batch.go::Engine.HandlePass`, `Engine.HandleFail`, `popNext`).
  Repository merge no-ops need not create a new commit; an original head can itself already contain merge commits.
- Landing fast-forwards to the tested SHA with `Force: false`, an ancestry check rather than an expected-old-SHA compare-and-swap (`internal/github/forge.go::FastForward`).
  An incompatible target move causes two rebuilds, then ejection on the third consecutive rejection (`internal/batch/batch.go::Engine.HandlePass`, `MaxFFRetries`).
  Batch state persists in Postgres and resumes after restart (`internal/store/pg/migrations/004_batches.sql::batches`; `internal/batch/batch.go::Engine.ReconcileLive`).
- Required checks are forge-derived whenever that list is nonempty; `GITEA_MQ_REQUIRED_CHECKS` is only fallback (`internal/monitor/monitor.go::ResolveRequiredChecks`).
  GitHub unions rulesets and classic protection, excluding MQ-owned contexts (`internal/github/forge.go::GetRequiredChecks`).
  Our ruleset's `nixbot/nix-eval`, `nixbot/nix-build`, and `nixbot/effects` therefore supply the queue's required set; the environment fallback does not fire in the intended configuration.
  The fallback must nonetheless match the authoritative ruleset so an empty forge list cannot silently weaken the landing gate.
- The queue is review-blind: a case-insensitive search of `internal/` for `pull_request_review|approved|review` returned no matches, and `internal/poller/poller.go::enqueuePR` gates only on `prCheckResult`.
  `internal/github/setup.go::EnsureRepoSetup` enables `allow_auto_merge`, attempts to add the App as a bypass actor on every other branch-target ruleset, and returns early if a ruleset named `gitea-mq` already exists.
  Repository rulesets can be updated; organization-owned rulesets without bypass and insufficient setup permissions produce warnings (`internal/github/setup.go::ensureBypass`).
  The App performs direct `UpdateRef` with that bypass, so a required-approving-review rule does not constrain queue landing.
  The enqueue signal is the merge authorization.

mergify-cli:

- `mergify stack push --github-native` publishes one PR per commit and requests registration with GitHub's Stacks API (`crates/mergify-stack/src/plan.rs::plan`; `crates/mergify-stack/src/native_stack.rs::register`).
  Registration is opt-in through `mergify-cli.stack-github-native` and requires at least two PRs; registration failure can degrade to `Depends-On:` headers without failing the push (`crates/mergify-stack/src/commands/push.rs::run`).
  The operator must verify registration before using the stack enqueue rule.
- New or updated head branches are pushed atomically with `--force-with-lease`; unchanged or merged entries are skipped (`crates/mergify-stack/src/notes_push.rs::push_branches`; `crates/mergify-stack/src/commands/push.rs::run`).
- A commit counts as merged only when its PR has non-null `merged_at` and its head SHA equals the local commit (`crates/mergify-stack/src/sync_status.rs::classify`; `crates/mergify-stack/src/changes.rs::classify`).
  Closed-unmerged PRs disappear from discovery and can be recreated on a later push or sync (`crates/mergify-stack/src/remote_changes.rs::group_by_change_id`).
  Landed stack members must read as merged, not merely closed; V1 records the basis for this world assumption.

### Deployment survey and live rulesets

Four consumers were surveyed; none uses `batchMax = 0`, and none showed a linear-history mandate.
The three GitHub deployments set `batchMax = 5`: Mic92/dotfiles (`machines/eve/modules/gitea-mq.nix::services.gitea-mq`), SBEE-Lab/infra (`modules/gitea-mq/default.nix::services.gitea-mq`), and mulatta/dots (`machines/cask/modules/gitea-mq.nix::services.gitea-mq`).
Our prior choice of five matched these deployments; the Decision below supersedes that choice with twenty for flake-update waves and unlimited bisection.
clan-lol/clan-infra uses the Gitea backend at the default one (`modules/web01/gitea-mq.nix::services.gitea-mq`); its live Gitea protection was not checked.
Mic92/dotfiles' `.github/settings.yml::branches.protection.required_linear_history` is false, with “Disabled for bors to work”; this bors-era declaration is vestigial against the live GitHub state.

Session GitHub API GET observations supplement the in-tree consumer reports:

| Repository | Live default-branch rulesets | Classic protection |
|---|---|---|
| Mic92/dotfiles | App-owned `gitea-mq`, requiring only `gitea-mq` | 404 |
| SBEE-Lab/infra | Human-owned deletion, non-fast-forward, `buildbot/nix-eval` and `buildbot/nix-build`; App-owned `gitea-mq`, requiring only `gitea-mq` | 404 |
| mulatta/dots | Human-owned deletion, non-fast-forward, `buildbot/nix-eval` and `buildbot/nix-build`; App-owned `gitea-mq`, requiring only `gitea-mq` | 404 |

These observations come from `GET /repos/{owner}/{repo}/rulesets`, individual ruleset reads, and `GET /repos/{owner}/{repo}/branches/main/protection`; none of the live GitHub rulesets mandates linear history or approving review.
The two-ruleset deployment pattern makes the external checks visible to `GetRequiredChecks` even though the App bypasses enforcement when pushing.
Mic92/dotfiles has only the queue-owned check, so its configuration is not evidence that our nixbot contexts can be omitted.

In session API samples of the last 40 merged PRs per GitHub repository, `auto_merge` was recorded on 34/40, 38/40, and 36/40 respectively.
None of those PRs carried `merge-queue`; the label did not exist in two repositories.
Mic92/dotfiles had 810 lifetime uses, most recently on 2026-08-30 on #5847 and #5848, whose titles use a `[need #NNNN]` stacked convention (`GET /repos/{owner}/{repo}/pulls/{number}` and issue search for merged and labelled PRs).
This supports ordinary PR → auto-merge and stack → label the top; those two labelled PRs do not establish native registration or V1.

Mic92/dotfiles #5887–#5890 have `head.sha == merge_commit_sha` and GitHub reports them merged, discharging the observed non-stack fast-forward case.
Dependabot #5885/#5886 share batch 507531 with distinct merge commits, demonstrating several PRs sharing one batch CI run.
#5881 landed 17 commits without a force-push, with `main` equal to its head at the observed landing (`GET /repos/Mic92/dotfiles/pulls/{number}`, PR timelines, and commit reads).
These observations distinguish original-head landing from batched merge history; they do not verify registered-stack member completion.

### Considered options

1. Keep `stack-land`: synchronous fast-forward after every member PR is green in nixbot; retains the author's landing wait.
2. Mergify server merge queue with batching and fast-forward: retains an external queue dependency and nixbot's unconditional PR builds.
   Earlier claims about per-repository licensing and private-repository availability were not verified in this source audit; they are not a basis for rejection here.
3. Bespoke orchestrator queue: push a candidate to `queue/*`, wait on nixbot, fast-forward, and bisect in the agent; duplicates gitea-mq's state machine and recovery.
4. rust-lang/bors: observes CI completion through GitHub Actions `workflow_run`, not nixbot check runs (`src/server/webhook.rs::parse_webhook_event`).
   It fast-forwards its base onto a pre-built merge commit (`src/bors/merge_queue.rs::handle_successful_build`), preserving the tested tree but producing merge history.
   It has no stack handling and requires rust-lang's permission model (`src/permissions.rs::UserPermissions.has_permission`).
5. bors-ng: previously excluded as archived; current archive status was not reverified in this audit.
6. GitHub native merge queue: nixbot supports `gh-readonly-queue/*`, but this would be a different landing integration; its suitability for registered stacks remains unverified here.
   Do not combine it with gitea-mq (mulatta/dots `home/bin/gh-bootstrap::check_gitea_mq`).
7. gitea-mq for one labelled stack at a time, after an orchestrator assembles and prebuilds a linear rollup on `staging`: rejected in this revision.
   Queue-created merge commits are tested before landing, so assembly and serialization add no substitution guarantee and prevent multi-entry batching.
8. gitea-mq alone for queue formation and landing, with `batchMax = 20`, author cache warming, and shape-specific authorization signals: chosen.
   This preserves the tested-tree property without a bespoke rollup service; the Decision records why the cap now differs from the three surveyed GitHub deployments' five.

## Decision

We will run gitea-mq with nixbot and retire the orchestrator rollup onto `staging`.
We will let the queue assemble, test, bisect, and land batches, including batches mixing ordinary PRs and labelled stacks.

We will separate authorization into two orthogonal axes:

- Risk class determines when to authorize.
  For CI-sufficient changes, we will permit the enqueue signal without additional review; the queue still waits for required CI success.
  For review-required changes, we will obtain review of the intended changes before setting any enqueue signal, including all members selected by a stack's top label.
  We will apply policy E1: enforce this ordering by convention, matching the absence of review gates in the three reference GitHub deployments.
  We will treat the signal as merge authorization, rather than rely on an approving-review rule that the queue App bypasses.
- Shape determines how to enqueue.
  For an ordinary trunk-based PR, we will enable GitHub native auto-merge.
  For a registered stack, we will label its topmost intended PR `merge-queue` after verifying registration and head ancestry.
  We will never enable auto-merge on any stack member, including the bottom member; auto-merge enqueue does not resolve stacks and wins over label enqueue.

We will deploy `services.gitea-mq.batchMax = 20` and `skipQueueIfUpToDate = true`, keeping the default `merge-queue` label.
This supersedes our prior `batchMax = 5` decision, which matched Mic92/dotfiles, SBEE-Lab/infra, and mulatta/dots (Context, Deployment survey and live rulesets).
Our flake-update lane produces waves of 20–40 simultaneously-ready PRs, scheduled twice weekly (`.github/workflows/update-flake-inputs.yaml::on.schedule`); the reference deployments do not have this lane.
The cap of twenty can cover a twenty-entry wave; a forty-entry wave still needs multiple batches.
Our `bisectMaxSteps = 0` means unlimited bisection (`nix/module.nix::services.gitea-mq.bisectMaxSteps`), so `internal/batch/batch.go::Engine.HandleFail` isolates a failing entry in roughly log2(N) builds.
Its whole-batch ejection guard, `BisectMaxSteps > 0 && Builds >= BisectMaxSteps`, which comments “batch bisection reached the configured limit”, is unreachable here.
Unlimited bisection makes recovery from twenty entries affordable; not every reference deployment shares that configuration.
We accept that a large batch holds the queue for one build cycle, and one bad entry delays the other nineteen while bisection runs.

The empirical basis is one local observation: five PRs landed in two batches, first two and then three, using two batch builds.
`internal/queue/batch.go::Service.FormBatch` greedily takes up to `BatchMax` entries at the instant a poll runs, with no accumulation window.
`internal/webhook/github.go::maybeTriggerPoll` requests an immediate poll on green checks; `GithubHandler`'s `PullRequestEvent` path does so when auto-merge is enabled (`prTriggerActions`).
These triggers and greedy selection explain the observed split: batch size emerges from arrival rate versus build time.
Raising the cap raises the ceiling; it does not force larger batches.
Any speedup from twenty is a projection, not a measured result.

We will enable repository `allow_auto_merge` and maintain two default-branch rulesets: ours requiring deletion protection, non-fast-forward protection, `nixbot/nix-eval`, `nixbot/nix-build`, and `nixbot/effects`; the App's requiring `gitea-mq`.
We will permit the queue App's ruleset bypass and use neither `required_linear_history` nor classic branch protection.
We will derive the required CI set from our ruleset; an environment fallback will not substitute for that ruleset and must never be weaker than it.

Technical justification: the batch engine fast-forwards to the exact tested SHA, and nixbot admits `gitea-mq/*` builds without branch-filter configuration.
We will preserve substitution by filtering check sources, except the declared whole-tree scan allow-list, and warming magnetite's store with `just check-fast auto off x86_64-linux` before publication, so that nixbot classifies those check outputs `local` and skips them (R2).
We will retain unconditional PR builds; their evaluation cost remains, and reuse depends on matching trees and available derivation outputs.
We will measure uncached work rather than assume that every change costs a full rebuild or that every batch needs exactly one CI execution.

Business justification:

- Cost: we will share batch CI across several PRs and reuse cached derivations, reducing redundant building and eliminating bespoke rollup maintenance.
  The self-hosted queue removes dependence on Mergify server queue licensing; no unverified price or fixed savings ratio is assumed.
- Time to market: we will make landing asynchronous after authorization, allowing a person or agent to start the next task while the queue tests and lands work.
  Required review and CI remain prerequisites; there is no fixed author-wait bound.
- User satisfaction: we will provide the same discoverable signals to people and agents, with pending stack hints and queue status, instead of requiring a human to wait for orchestrator assembly.
- Strategic positioning: we will retain the deployed Nix ecosystem's queue integration, with a larger batch cap for our flake-update lane, and maintain source-filtering and cache integration rather than a second queue implementation.

## Consequences

### Positive

- Bors-style batching shares a nixbot batch execution across several PRs, as observed in dependabot batch 507531; cache warming further reduces uncached work.
- The normal batch landing updates the target to the tested SHA even when that SHA contains merge commits; incompatible target movement triggers rebuilding rather than an untested merge.
- gitea-mq owns queue persistence, race handling, bisection, ejection, and entry finalization.
  The orchestrator leaves the human landing path; people authorize their PRs directly.
- Every stack member still receives a nixbot PR build, providing per-member feedback without requiring an orchestrator to defer PR publication.
  Those lower-member results are not separate queue gates.

### Negative

- `main` may carry batch merge commits.
  Fast-forward to the original head without queue-created merge commits is guaranteed only for a single up-to-date entry taking the shortcut without a subsequent fallback or rebuild.
  All normal batch landings use a fast-forward ref update, including those landing merge commits.
- The queue is review-blind, so an errant authorization signal can land unreviewed work under E1.
  Repository approving-review rules do not repair this because the App bypasses them.
- Auto-merge-wins ordering makes auto-merge on a stack member actively wrong: an upper member can be queued against its parent branch even when correctly labelled for trunk landing.
- Stack-member bookkeeping is GitHub's, unobserved by the queue: it supplies no lower-member completion status and no explicit close under batch mode.
  V1 records GitHub's retarget-and-mark behaviour as discharged, so the residual risk is low and observable: were a landed lower member ever to read as open or closed rather than merged, mergify-cli's merged detection would miss it and could recreate the PR.
  The first live stacked landing shows this directly.
- An unlabelled stack member sits with the required `gitea-mq` check pending and a message directing a human to label the topmost intended PR.
  This makes the label discoverable instead of leaving an unexplained missing check; the hint does not establish post-landing completion.
- PR builds remain unconditional and merged PR builds run to completion.
  Each distinct tree can require evaluation, and a failed batch adds bisection builds; neither one execution per batch nor a fixed invocation reduction is guaranteed.
  A stack is one entry, so queue bisection cannot isolate its internal commits.
- A second GitHub App, Postgres database, and public endpoint are added to magnetite.
  Source filtering, author uploads, and working cache access remain operational dependencies; nixbot's warn-only uploader can leave a green build without reusable remote outputs.

### Neutral

- `stack-land` is demoted to a dry-run assertion tool; it is no longer a landing fallback.
- The Mergify server queue is retired; mergify-cli remains the stack publication client.
- History rewrites and author signing remain the publisher's responsibility; there is no orchestrator rebase, batch trailer, or landing-ref protocol.

## Compliance

Automated checks to implement in the related OpenSpec changes:

- Retain `filter-check-sources-for-substitution`'s `structure-check-source-isolation` check, negative control, and transitive `check-source-audit` probe against its declared whole-tree allow-list (`openspec/changes/filter-check-sources-for-substitution/proposal.md`, “Assertion of the property”).
  Unrelated source changes must leave unaffected filtered checks' derivation hashes stable; the deliberately whole-tree `gitleaks` scan is the declared exception.
- Add a module assertion pinning `services.gitea-mq.batchMax = 20` and `skipQueueIfUpToDate = true`; assert no merge-label override, because `nix/module.nix::services.gitea-mq` exposes batch size but not the label.
- Add a read-only GitHub ruleset check requiring all three contexts, `nixbot/nix-eval`, `nixbot/nix-build`, and `nixbot/effects`, in our default-branch ruleset, and pin the configured fallback to the same set with a module assertion.
  Also verify the separate App-owned `gitea-mq` gate, bypass actor, absence of linear-history and classic protection, and `allow_auto_merge = true`.
  Checking only `GITEA_MQ_REQUIRED_CHECKS` is insufficient because `internal/monitor/monitor.go::ResolveRequiredChecks` prefers the forge-derived set.
- Report batch SHA, landed PRs, and nixbot build identities using `web/api_routes.py::create_api_router`, `Build`, and `Attribute`.
  Query by branch, PR number, or commit prefix, compare returned `tree_hash` values, and count attributes with `cached = false` and `status != skipped_local` as an uncached-work proxy.
  This API has no tree-hash query or raw `notBuilt` count; failed or missing-status work requires log inspection rather than treating the proxy as a count of builders actually run.

Discharged, retained for traceability:

- V1. After a fast-forward landing, GitHub marks every landed PR merged rather than closed or left open, without any action by gitea-mq on lower stack members.
  The non-stack case is discharged empirically by Mic92/dotfiles #5887–#5890 (`head.sha == merge_commit_sha`, GitHub merged).
  The stacked case rests on operator confirmation of GitHub's mechanism: once the tip lands, GitHub retargets each remaining stack member to the trunk and marks a member merged when it detects that member's commit SHA on the default branch.
  No source citation supports that mechanism here; the basis is the operator's own experience of it.
  V1 no longer blocks promotion. Re-confirm it at the first live stacked landing by retaining head SHAs and `merged_at` for every member and checking that a subsequent mergify-cli sync recognizes them as merged.

Manual checks before promotion from Proposed (existing V identifiers retained for traceability):

- V2. Confirm in vanixiets that existing green checks on the selected head are accepted when authorization arrives later, including the single-entry shortcut.
  Source supports this: `internal/poller/poller.go::prCheckResult`, `pollMergeBranchChecks`, and `internal/batch/monitor.go::Engine.HandleCheck` have no arrive-after-enqueue timestamp requirement.
- V3. Confirm the selected SHA carries required contexts `nixbot/nix-eval`, `nixbot/nix-build`, and `nixbot/effects`, checking build-result replay separately from effect execution (`status.py::ForgeStatusReporter`; `build_reuse.py::replay_terminal_status`; `effects_run.py::enqueue_effects`).
- V4. Measure uncached derivations per batch after members' authors warm magnetite with `just check-fast auto off x86_64-linux`.
  Inspect the API proxy and logs to distinguish interaction inputs, cache misses, uploader failures, and unrelated-source invalidation; verify that unchanged filtered derivations substitute.
- V9. Confirm the deployed module exposes `batchMax` and `skipQueueIfUpToDate`, and the binary retains its default merge label.
  This is settled at the source pin (`nix/module.nix::services.gitea-mq`; `internal/config/config.go::Load`); validate the rendered unit, database provisioning, and reverse proxy in deployment.
- V10. Review needed PR previews before changing vanixiets' current `effects_on_pull_requests = true` and `effects_branches = ["*"]`.
  Scope PR effects through `effects_on_pull_requests` and queue-branch effects through `effects_branches`; changing the latter alone does not disable PR effects (`effects.py::should_run_effects`).
- V11. Measure actual nixbot executions per PR landed, including unconditional PR builds, batch retries/bisection, and tree reuse, against a comparable Mergify baseline.
  Record the sample window, cache state, and workload; savings remain unverified until measured.
- V12. Audit authorization samples across both risk classes and PR shapes: review precedes the signal where required, native registration and ancestry hold, and no stack member has auto-merge enabled.
  This is manual governance of E1, not a queue-enforced review guarantee.

## Notes

Author: Cameron Ray Smith with Claude, 2026-09-07.
Approval date and approved by: not yet approved.
Superseded date: not applicable.

Source basis: nixbot `25df5fb`, gitea-mq `d44c455`, mergify-cli `d393fe7`, nix-fast-build `8f0c351`, rust-lang/bors `43a7baa`, MADR template `ba75bb1`, vanixiets `edc85b40` (original source baseline).
Claims about component behaviour must be reverified when these pins move; upstream commit dates were not established by the verification reports.
Evidence: `logs/adr-verify/{gitea-mq,nixbot,mergify-cli,nix-fast-build,bors,gitea-mq-enqueue-and-landing,gitea-mq-consumers-mic92,gitea-mq-consumers-third-party}.md`, supplemented by the session GitHub GET observations described in Context.
Those ignored logs are working evidence; the source symbols and API observation scope above preserve the basis in this ADR.

Last modified: 2026-09-09, by the implementation assistant for Cameron Ray Smith.
Revision 2 replaces orchestrator rollups with queue-only batching on two authorization axes, based on verified source, four consumer configurations, and live GitHub ruleset, signal, and landing observations.
It distinguishes pending stack hints from completion; the current revision records V1 as discharged on operator confirmation of GitHub's retarget-and-mark behaviour, for re-confirmation at the first live stacked landing.
The appendices remain temporary transfer material outside the seven-section ADR structure.

---

## Appendix A. Candidate requirements (to become OpenSpec deltas)

Source filtering and cache warming are the core; process policies and upstream world assumptions must be classified separately from machine requirements when transferred.

- R1. Every filterable `checks.*` derivation depends only on its filtered source; unrelated file changes preserve its derivation hash, with `gitleaks` as the declared whole-tree allow-list exception (`filter-check-sources-for-substitution`).
- R2. Authors warm the cache by building the CI system's check set on magnetite: `just check-fast auto off x86_64-linux 2>&1 | tee logs/checks-linux-$(date +%Y%m%d-%H%M%S).log`.
  The recipe's parameters are positional (`nom push system`) and it computes `--remote magnetite.zt --no-download --retries 2` whenever the requested system differs from the native one (`justfile::check-fast`); the fleet's developers work from aarch64-darwin laptops while nixbot builds x86_64-linux.
  The outputs therefore stay in magnetite's own store, which nixbot reports as `local` through `nix-eval-jobs --check-cache-status` and skips entirely with status `skipped_local` (`build_scheduler.py::JobScheduler._classify`) — cheaper than substituting from niks3, with neither fetch nor upload.
  `push=on`, that is `just check-fast auto on`, serves a different purpose: it populates niks3 so that other machines, notably peer aarch64-darwin laptops, can substitute from the shared cache.
  It is not needed to warm CI, because nixbot uploads what it builds through its own warn-only uploader.
  `--no-download` returns nothing to the laptop, so a developer wanting local feedback still runs the plain native `just check-fast` separately; this warming covers x86_64-linux only, which is the whole of nixbot's `buildSystems`.
  nixbot builds the post-merge tree (`gitrepo.py::WorkTree.tree_hash`), so a moving base can still require rebuilds: warming is a strong optimisation, not a guaranteed reduction.
- R3. Each independently shippable change is one commit and one PR; mergify-cli renders stack PR title and body from its commit message.
- R4. Each stack commit carries a `Change-Id` matching `^I[0-9a-f]{40}$`.
- R5. Each commit must build on its own; nixbot's unconditional PR builds provide per-member feedback, while the queue gates the selected head and tested batch rather than all lower members separately.
- R6. Commit bodies retain the Linear issue id for traceability, without a rollup-specific transport bookmark or dependency-assembly contract.
- R7. Set `build_branches = []` to suppress arbitrary non-default branch builds; queue patterns remain admitted independently.
- R8. Keep unconditional PR builds without orchestrator-controlled publication timing.
- R9. Required external contexts are `nixbot/nix-eval`, `nixbot/nix-build`, and `nixbot/effects` in both the authoritative ruleset and the configured fallback.
  This extends the original eval/build pair after the operator added effects to ruleset `16212553` so landing waits for effect completion; `openspec/changes/stand-up-gitea-mq-on-magnetite/design.md::D2` records the reason and the coupled invariant.
  Requiring effects depends on default-branch `nixbot.toml::effects_on_pull_requests = true` and a non-empty effect set: `effects_run.py::enqueue_effects` returns before `effects_started` on an empty set, leaving a required context unposted and a PR blocked indefinitely.
  The ruleset, configured fallback, and effect-production configuration must move together.
- R10. Scope PR previews with `effects_on_pull_requests` and non-default branch effects with `effects_branches`, preserving the previews identified in V10.
- R11. Serve `mq.scientistexperience.net` with `batchMax = 20`, `skipQueueIfUpToDate = true`, and the default `merge-queue` label; provision its database and reverse proxy.
- R12. Publish stacks with `--github-native` and verify registration and selected-head ancestry before enqueue; `Depends-On:` alone does not enable queue stack resolution.
- R13. Use a separate GitHub App from nixbot's, with the permissions in gitea-mq `README.md`, “GitHub setup”: Checks read/write, Commit statuses read, Contents read/write, Pull requests read/write, Administration read/write, Metadata read.
  The required subscribable event set is exactly `check_run`, `pull_request`, `status`, and our registered App `sciexp-gitea-mq` (id 4875422) carries exactly those (`GET /apps/sciexp-gitea-mq`: `events: ["check_run", "pull_request", "status"]`).
  The README list also names `installation` and `installation_repositories`, which GitHub does not expose as subscribable events: GitHub delivers them to every App automatically, and they are absent from a correctly configured App's API `events` array.
  Treating their absence as a defect blocked a live gate earlier; verify this requirement against the `events` array, not against the README list.
- R14. Maintain our deletion/non-fast-forward/nixbot-check ruleset and the App's `gitea-mq` ruleset, with queue App bypass; enable `allow_auto_merge`, with no linear-history rule or classic protection.
- R15. Apply E1: classify risk and obtain required review before authorization; the enqueue signal is merge authorization, enforced by convention and manual audit.
- R16. Enable auto-merge only for ordinary trunk-based PRs; label only the topmost intended registered-stack member and never enable auto-merge on any stack member.

## Appendix B. Operating procedure (to move into instructions and skill)

After cache warming and any review required by E1, authorize by shape:

1. Ordinary trunk-based PR: enable GitHub native auto-merge; gitea-mq waits for required checks and handles landing asynchronously.
2. Stack: publish with `mergify stack push --github-native`, verify native registration and selected-head ancestry, then label the topmost PR intended to land `merge-queue`.

Never enable auto-merge on any stack member, even when its top PR is correctly labelled; the auto-merge enqueue path runs first and does not resolve the stack base.

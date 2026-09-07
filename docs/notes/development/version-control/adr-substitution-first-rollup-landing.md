---
title: "ADR-XXXX: Substitution-first rollup landing of mergify stacks through nixbot and gitea-mq"
---

## Status

Proposed, 2026-09-07. Unimplemented.

Filed as a working note under `docs/notes/development/version-control/`. Promotion to `docs/development/architecture/adrs/` with a sequence number is decided after the verification items in Compliance have been discharged in vanixiets. Supersedes the working note `stacked-landing-settings-review.md` as the description of the landing mechanism; that note's validation of the fast-forward push remains valid.

Scope: every repository built by the `sciexp-nixbot` GitHub App. First deployment: vanixiets.

Related: OpenSpec change `stand-up-gitea-mq-on-magnetite` (to be opened; carries the requirements in Appendix A and the deployment tasks); agent instructions `030-stacked-landing-protocol` and skill `git-stacked-pr-integration` (to be updated from Appendix B); `stand-up-nixbot-on-magnetite` (In Review, not yet archived).

## Context

### The naming

Three ecosystems meet in this decision and each has a word the others lack.

- Nix: a *derivation* is content-addressed by its inputs; a *substituter* is a binary cache that supplies a derivation's output instead of building it; *substitution* is the act of taking it from there. Whether a derivation is rebuilt is decided by hash, not by who last touched the source.
- bors: a *rollup* is several approved changes landed as one tested unit; `staging` is the branch CI runs on before the base is fast-forwarded; `try` is a CI run that lands nothing; approval is `r+`.
- mergify-cli: a *stack* is one branch published as a chain of pull requests, one commit per PR, each carrying a `Change-Id` trailer that survives rebases.

The decision is named for the property it buys: when a rollup is built in CI, every derivation that any single author could have built is *substituted* from the cache that author already populated, and the only derivations CI builds are the ones whose input closure spans more than one change in the rollup. CI's job is reduced to interaction testing. Hence *substitution-first rollup landing*.

### The situation

Each independently shippable step of an OpenSpec change is one commit and one PR. Workers prepare commits in their own jj clones and return a ref; an orchestrator publishes and lands (`030-stacked-landing-protocol`). Landing today is `stack-land`, a synchronous fast-forward push that requires every member PR's checks to be green, which means nixbot builds every PR in full before anything lands.

The check suite runs three times per change in that model: once locally by the author, once by nixbot on the PR, and once more by whatever gates the landing. Every rebase invalidates the PR-level result. For a rollup of N changes the count is at least 2N + 1 CI invocations, and the author waits on all of them.

The target is one CI invocation per rollup whose *uncached* work is only what no author could have tested alone, with the author's wait bounded by their own local build.

### Constraints established from source

Read from local clones under `~/ghq/github.com/` at the revisions in Notes.

nixbot:

- Builds every PR on open, synchronize, reopen, and base retarget; there is no configuration to disable this and draft status is ignored (`webhooks.py`: "All pull requests build"). `[skip ci]` is applied to branch pushes only and is deliberately withheld from PRs.
- Always builds pushes to `staging`, `trying`, `gh-readonly-queue/*`, and `gitea-mq/*` (`MERGE_QUEUE_PATTERNS`), regardless of `build_branches`.
- Build identity is the post-merge tree hash. A PR, a branch, and main with the same tree share one build record and the terminal statuses are replayed to each new context (`db.py`, `build_reuse.py`).
- Evaluates with `nix-eval-jobs --check-cache-status`; derivations reported `cached` are scheduled so that nix substitutes them, `local` ones are skipped, and everything else, including `notBuilt` and jobs with no cache status, is built (`build_scheduler.py::JobScheduler._classify`). The server pushes everything it builds to niks3 through a warn-only uploader (`services.nixbot.niks3`).
- Posts check runs `nixbot/nix-eval` and `nixbot/nix-build` on the commit SHA (`status.py`; prefix `nixbot` in vanixiets).
- Cancels a PR's in-flight builds when the PR closes unmerged; a PR closed as merged is not cancelled, because the merge commit shares its tree and reuses the build (`service.py::CIService._submit_pr_closed`, `canceller.py`).

nix-fast-build (the `just check-fast` recipe in vanixiets):

- `--skip-cached` builds only derivations absent from the configured substituters; `--niks3-server https://niks3.scientistexperience.net` uploads the outputs of every successful build, whether built or substituted, and of every `local` derivation, and an upload failure fails the run (`workers.py::run_evaluation`, `run_upload_worker`; `push=on` in the recipe, opt-in). `--select` narrows the evaluated attribute set with a Nix function. The recipe already pins `--flake .#checks.$system` and `--eval-workers 4`.

gitea-mq (GitHub backend):

- Enqueues on the `merge-queue` label or on a PR with GitHub auto-merge enabled (`poller.go::enqueueLabeledPRs`, `enqueueAutoMergePRs`); on GitHub these are the only ways to enqueue a stacked PR, and it resolves the stack through GitHub's Stacks API (`ResolveStack`). `Depends-On:` headers are not read.
- With `GITEA_MQ_BATCH_MAX ≠ 1`, a batch with exactly one entry whose head already contains the target tip is landed by non-force `UpdateRef` of the target to that head, with no batch branch and no extra CI run (`headIfUpToDate`, `HandlePass`). A raced fast-forward is rebuilt and retried up to `MaxFFRetries = 3`, then ejected with a comment.
- Two or more entries are merged in sequence through GitHub's repository merge API into `gitea-mq/batch/<id>` and land as a chain of merge commits; the README states repositories that mandate squash or rebase merges should leave `BATCH_MAX=1`.
- Required checks come from branch protection, else `GITEA_MQ_REQUIRED_CHECKS`, else any single success. State is one Postgres row per batch; a crash resumes. After fast-forward it waits about 10 s for GitHub to mark members merged and otherwise closes them with a "✅ Merged as `<sha>` via batch #<id>." comment. Auto-setup creates a `gitea-mq` ruleset with the App as bypass actor.

mergify-cli:

- `mergify stack push --github-native` opens one PR per commit with title and body from the commit message, force-pushes every head branch on each push or sync so heads stay ancestors of the tip, and registers the stack with GitHub's Stacks API (opt-in per repository via `git config mergify-cli.stack-github-native true`). GitHub returns 403 on the classic merge endpoint for registered stacks; landing by ref update is a different path.

GitHub:

- A PR is marked merged when its head SHA becomes reachable from the base. Rebased heads that are not pushed leave PRs open.

### Considered options

1. Keep `stack-land`: synchronous fast-forward after every member PR is green in nixbot. Current state.
2. Mergify server merge queue with `batch` and fast-forward. Licensed per repository; unavailable on private repos; its draft-PR batches are still full nixbot PR builds.
3. Bespoke orchestrator queue: push a candidate to a `queue/*` ref, wait on nixbot, fast-forward, bisect, all in the agent. Revision 1 to 3 of this design.
4. rust-lang/bors: detects CI completion only through GitHub Actions `workflow_run` webhooks (`docs/design.md`, `server/webhook.rs`), so it cannot observe nixbot check runs; fast-forwards the base onto a merge commit it built on its own branch (`merge_queue.rs::handle_successful_build`), so main receives merge commits by construction; no stack awareness; rust-lang's permission model and operational footprint.
5. bors-ng: archived.
6. GitHub native merge queue: rulesets conflict with direct ref update; no stack awareness; nixbot supports its `gh-readonly-queue/*` branches but nothing else fits.
7. gitea-mq as the queue role, one labeled stack at a time, with the orchestrator building the rollup and nixbot building it once on `staging` before the PRs exist. Chosen.

## Decision

We will land changes as bors-style rollups: an orchestrator knits ready changes into one linear mergify stack, nixbot builds the stack tip exactly once on `staging` before any PR exists, the stack is then published with `mergify stack push --github-native` and its top PR labeled `merge-queue`, and gitea-mq fast-forwards main to the tip through GitHub's non-force ref update. Authors run `just check-fast push=on` on their own change before pushing a transport bookmark, so their derivations are already in niks3 when the rollup is built, and nixbot's `--check-cache-status` evaluation substitutes them. The uncached work in the rollup build is the set of derivations whose inputs span more than one change.

Technical justification:

- nixbot's tree-hash identity makes the `staging` build, the tip PR build, and the post-landing main build one record. Fast-forward landing keeps that identity exact; a merge commit would create a tree nixbot never saw whenever main had moved.
- gitea-mq's non-force `UpdateRef` is a compare-and-swap: a raced landing is rejected by the transport and retried, so main never receives an untested tree. nixbot hardcodes gitea-mq's branch pattern (`webhooks.py::MERGE_QUEUE_PATTERNS`; nixbot's own repository lands through `Mic92/auto-merge`, not gitea-mq), and gitea-mq reads check runs by name, which rust-lang/bors cannot.
- nix-fast-build `--skip-cached` against the same niks3 that nixbot pushes to and reads from means "affected checks" is not computed; it is whatever the cache does not already hold. This holds only when each check's `src` is filtered to the files it depends on; with `src = self` every rebase rehashes every check and the property is lost.
- nixbot's unconditional PR builds are kept. They are the evidence that each stack member builds on its own, which is what makes a red rollup attributable without probes once PRs exist. Their cost is bounded by ordering: PRs are opened only after the `staging` build is green and are merged by the landing seconds later. nixbot does not cancel a PR closed as merged (`service.py::CIService._submit_pr_closed`), so the intermediate builds run to completion, substituting from niks3 what the authors' `check-fast` runs and the `staging` build already pushed; they gate nothing, because gitea-mq reads checks on the tip SHA only.

Business justification:

- Cost: one uncached CI build per rollup instead of 2N + 1 full builds; gitea-mq is self-hosted with no per-repository license, which also removes the Mergify server queue from every repository and makes the queue available on private repositories where no queue existed.
- Time to market: the author's wait is their own `check-fast` run; landing is asynchronous, so an agent or person enqueues and takes the next task.
- Strategic positioning: every component is a maintained, general-purpose project in the Nix ecosystem the fleet already depends on (nixbot, niks3, nix-fast-build, gitea-mq are all Mic92 projects; mergify-cli is Mergify's supported client), with no bespoke queue to maintain.

## Consequences

### Positive

- Uncached CI work per rollup is bounded by interaction derivations; a rollup of unrelated changes with well-filtered sources builds close to nothing.
- Main is never in an untested state, enforced by the transport rather than by orchestrator discipline.
- The queue state machine, race retry, ejection comments, merged-or-close fallback, dashboard, and ruleset setup are gitea-mq's, not ours. The orchestrator is reduced to assembly, publication, labeling, and bisection.
- Each stack member still gets a nixbot build, so per-commit buildability (R3) is checked, not assumed.
- Provenance of the tested unit is preserved in a linear history through landing refs and a `Landed-With:` trailer.

### Negative

- N − 1 nixbot PR builds are dispatched per rollup and run to completion, since nixbot does not cancel a PR closed as merged. Each evaluates in full; its uncached work is whatever neither the author's `check-fast` run nor the `staging` build pushed to niks3. Removing this requires a nixbot PR-build gate, which we will not request; unconditional PR builds are the posture we want.
- Linear history is available only in gitea-mq's single-entry path. Labeling two stacks at once produces merge commits. Serialization is an orchestrator rule, not a gitea-mq setting.
- Author signatures do not survive the rebase; the orchestrator signs.
- Bisection of a red `staging` build is the orchestrator's job (probe pushes to `trying`); gitea-mq bisects only multi-entry batches, which this design does not use.
- A second GitHub App with Contents and Administration write permissions, a Postgres database, and a public endpoint are added to magnetite.
- The substitution property depends on discipline in every flake: per-check source filtering and `push=on` when the author's build is worth publishing. The `check-fast` recipe keeps push opt-in deliberately.

### Neutral

- `stack-land` remains as a dry-run assertion tool and manual fallback; it no longer performs the landing.
- The Mergify server queue is no longer configured; mergify-cli is used for stacks only.
- `gitea-mq`'s multi-entry batch mode remains available if bisecting production regressions ever makes merge-commit landings preferable; nothing else changes.

## Compliance

Automated:

- A flake check asserts no `checks.*` derivation depends on `self` unfiltered (compare each check's `src` against an allow-list of filtered sources, or measure: a rebase of an unrelated file must not change the check's derivation hash).
- A flake check or NixOS module assertion pins gitea-mq configuration: `GITEA_MQ_BATCH_MAX ≠ 1`, `GITEA_MQ_SKIP_QUEUE_IF_UP_TO_DATE = true`, `GITEA_MQ_REQUIRED_CHECKS` equal to nixbot's two contexts, `GITEA_MQ_MERGE_LABEL = merge-queue`.
- A repository check asserts `landing.toml` exists and `mergify-cli.stack-github-native` is set in the orchestrator's clone.
- nixbot's API (`web/api_routes.py`) lists builds by branch, PR number, or commit prefix and returns each build's `tree_hash` and each attribute's `status` and `cached` flag; a periodic report resolves each `refs/landings/*` ref to its commit, fetches the builds for that commit, confirms `staging`, tip PR, and main share one `tree_hash`, and counts attributes with `cached` false and `status` other than `skipped_local` as the uncached work.

Manual, before promotion from Proposed (verification items):

- V1. GitHub marks members of a natively registered stack merged after a non-force `UpdateRef` fast-forward of main. If not, gitea-mq closes them with a comment and they read as closed; decide whether that is acceptable or whether native registration is dropped, which also removes gitea-mq's stack resolution and requires labeling each PR.
- V2. gitea-mq accepts check runs that were posted on the tip SHA before the label was applied (the `staging` build's runs replayed to the tip PR); confirm no arrive-after-enqueue assumption in the poller for the single-entry path.
- V3. The replayed check runs on the tip PR are named exactly `nixbot/nix-eval` and `nixbot/nix-build`.
- V4. A `staging` build of a rollup whose members were all built with `check-fast push=on` shows only interaction derivations as uncached in nixbot's build record (attributes with `cached` false and `status` other than `skipped_local`; nixbot's API does not expose the `notBuilt` status itself).
- V5. Intermediate PR builds, which nixbot does not cancel when the PR closes as merged, substitute rather than rebuild: for each, record the uncached attribute count and wall-clock time against the `staging` build, and confirm they never delay a landing.
- V6. Rulesets accept `refs/landings/*` from the orchestrator identity and protect them from deletion.
- V7. mergify-cli preserves the `Landed-With:` trailer and orchestrator signature across `stack push`, `sync`, and `drop`.
- V8. mergify-cli's stack branch prefix is configurable per repository, and `stack push` from an orchestrator-created branch does not require the invoking user to be the commit author.
- V9. The gitea-mq NixOS module at the pinned revision exposes batch size and merge label, or the unit's environment is set directly.
- V10. Scoping `effects_branches` in vanixiets (currently `["*"]` with `effects_on_pull_requests = true`) to keep effects off intermediate PR builds does not remove an effect the fleet relies on for PR previews.

## Notes

Author: Cameron Ray Smith with Claude, 2026-09-07. Not yet approved.

Source basis: nixbot `25df5fb` (2026-09-06), gitea-mq `d44c455` (2026-09-03), mergify-cli `d393fe7` (2026-09-07), nix-fast-build `8f0c351` (2026-09-06), rust-lang/bors `43a7baa` (2026-09-03), MADR template `ba75bb1` (2026-08-28), vanixiets `edc85b40` (2026-09-07). Claims about component behavior should be re-verified against upstream when these pins move.

Structure follows the repository's ADR conventions (seven sections, Richards/Ford qualification test) with MADR's considered-options and confirmation elements folded into Context and Compliance.

---

## Appendix A. Candidate requirements (to become spec deltas in the OpenSpec change)

Commits and PRs

- R1. One change is one commit is one PR; PR title and body are rendered from the commit message by `mergify stack push`.
- R2. Every commit carries a `Change-Id` trailer matching `^I[0-9a-f]{40}$`; jj templates emit it so a transport bookmark already has one.
- R3. Each commit builds on its own; checked by nixbot's unconditional PR build.
- R4. Commit bodies carry the Linear issue id and any `Depends-On: <Change-Id>`; the transport bookmark is named by the Linear issue id.

Nix

- R5. Every `checks.*` derivation depends only on its own filtered source; `src = self` in a check closure is a defect.
- R6. Authors run `just check-fast push=on` (nix-fast-build `--skip-cached --niks3-server`) before pushing a bookmark; nixbot reads and writes the same niks3.
- R7. Root-touching changes (globs in `landing.toml`: `flake.nix`, `flake.lock`, `nix/**`, shared library roots) form single-member rollups.

nixbot

- R8. `build_branches` unset or empty; `staging`, `trying`, `gitea-mq/*` build regardless.
- R9. PR builds unconditional; the procedure controls when PRs exist.
- R10. Required-check names are `nixbot/nix-eval` and `nixbot/nix-build`.
- R11. vanixiets `effects_branches` scoped so effects do not fire on intermediate PR builds unless wanted.

gitea-mq

- R12. `mq.scientistexperience.net`; `GITEA_MQ_BATCH_MAX=0`, `GITEA_MQ_SKIP_QUEUE_IF_UP_TO_DATE=true`, `GITEA_MQ_REQUIRED_CHECKS=nixbot/nix-eval,nixbot/nix-build`, `GITEA_MQ_MERGE_LABEL=merge-queue`.
- R13. Stacks are published with `--github-native`; `Depends-On:` alone is invisible to gitea-mq.
- R14. One labeled stack per repository at a time (orchestrator-enforced).
- R15. Separate GitHub App from nixbot's: Contents rw, Administration rw, Checks rw, Pull requests rw, Commit statuses r, Metadata r; events `pull_request`, `check_run`, `status`, `installation`, `installation_repositories`.
- R16. Rulesets: linear history; `gitea-mq` check required; bypass actors gitea-mq App and orchestrator identity; no PR-level check requirement; no Actions workflows.

mergify-cli

- R17. Orchestrator stack branch prefix set to the orchestrator identity; workers never `stack push`.
- R18. History rewrites on a published stack only through `mergify stack drop|sync|reorder`, and only inside the landing sequence.
- R19. Upstream `skills/mergify-stack/SKILL.md` installed with its per-PR-CI and draft-PR guidance overridden.

Provenance

- R20. `refs/landings/<batch-id>` pushed at each landed tip.
- R21. `Landed-With: <batch-id>` trailer written during assembly, before publication.
- R22. Orchestrator signs rebased commits; `Author` preserved.
- R23. Batch revert is the range delimited by consecutive landing refs, exposed by batch id.

Orchestrator

- R24. `Depends-On:` edges order the rollup; a member whose dependency is neither landed nor present is refused.
- R25. Batch ids are ULIDs shared by ref name and trailer.
- R26. One candidate in flight per repository from `staging` push to landing; no speculative pipelining.
- R27. Candidate branch `landing/<batch-id>`.
- R28. State reconstructible from forge state (`staging` head and checks, open PRs with `Landed-With:` and label, gitea-mq API, newest landing ref).
- R29. Ready signal is on the Linear issue; bookmark name is the join key.
- R30. Orchestrator is the sole pusher of `staging`, `trying`, stack heads, and the sole applier of `merge-queue`.

## Appendix B. Operating procedure (to move into agent instructions)

Worker, per change:

1. One commit in own jj clone; `Change-Id`; Linear id and `Depends-On:` in the body.
2. `just check-fast push=on`. Only derivations absent from niks3 build; outputs upload.
3. `jj git push` the transport bookmark. No PR; nixbot idle.
4. Mark the Linear issue ready; move on.

Orchestrator, one round:

1. Wait for a non-empty ready set and no candidate in flight.
2. Collect ready bookmarks; join to Linear; split root-touching changes into single-member rollups.
3. `landing/<batch-id>` at main; cherry-pick in `Depends-On:` order; append `Landed-With:`; sign. Conflicts eject to the author.
4. Push the tip to `staging`. nixbot evaluates with cache status; substitutes author-built derivations; builds interaction derivations only.
5. Poll `nixbot/nix-eval` and `nixbot/nix-build` on the `staging` SHA.

Green:

6. `mergify stack push --github-native`. PRs open; nixbot enqueues per-PR builds; the tip PR dedupes to the `staging` record.
7. Optionally `stack-land --dry-run --tip <sha> <prs…>`.
8. Label the top PR `merge-queue`. gitea-mq: one up-to-date entry, checks present, non-force `UpdateRef` of main.
9. Race: gitea-mq retries thrice, then ejects; orchestrator rebases, re-pushes the stack, re-labels.
10. GitHub marks members merged; nixbot cancels intermediate builds; main attaches to the existing record.
11. Push `refs/landings/<batch-id>`; transition Linear; delete bookmarks.

Red (before PRs exist):

12. Read the failing attribute on the `staging` SHA. Attribute directly, or bisect with `trying` pushes of intermediate commits (probes substitute everything unchanged).
13. Drop the culprit from `landing/<batch-id>`; comment its Linear issue with the excerpt and build URL; clear its ready state.
14. New batch id, rewrite trailers, return to step 4.

Red after publication (race retry rebuilt on a moved main): every member has a PR build; the first red member in stack order is the culprit; `mergify stack drop`, new batch id, re-push, re-label.

Ejected author: amend the same `Change-Id`; re-run `check-fast push=on`; re-push the bookmark; re-mark ready.

Accounting per rollup of N: one `staging` build whose uncached work is interaction derivations; N − 1 cancelled PR builds; author wait is their own `check-fast`. Red adds up to log2 N `trying` probes.

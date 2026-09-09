---
title: "Review: substitution-first rollup landing ADR against source and conventions"
created: 2026-09-07
---

## Summary

The ADR follows the seven-section structure, states the decision in commanding voice with technical and business justification, and passes the Richards/Ford qualification test; it deviates on file location, the unnumbered title, and one-sentence-per-line, all of which its Status section already acknowledges or which are cosmetic.
Of 17 source claims checked against the five verification reports, 9 are verified, 4 partly verified, 3 contradicted, and 1 unverified (a world claim about GitHub that V1 exists to test).
Two findings change the ADR's accounting: nixbot does not cancel a PR closed as merged (`service.py::CIService._submit_pr_closed`), so the N − 1 intermediate PR builds run to completion rather than being cancelled; and mergify-cli classifies a commit as merged only when its PR has `merged_at` set and a head SHA equal to the local commit (`sync_status.rs::classify`), which makes V1 decisive for the whole design rather than a cosmetic choice.
Fourteen factual corrections were applied to the ADR in place (Related line, six source-constraint bullets, option 4, two Decision bullets, one Negative consequence, one automated Compliance item, V4, V5); Appendix A and B were left untouched, so Appendix B step 10 and its accounting line still state the disproved cancellation.

## Source verification

| Claim (ADR location) | Verdict | Anchor | Note |
|---|---|---|---|
| nixbot builds every PR on open/synchronize/reopen/retarget; no opt-out; draft ignored; `[skip ci]` withheld from PRs | verified | `webhooks.py::_pr_action_builds`, `_parse_pr_event`; `canceller.py::has_skip_ci_marker` | `repo_config.py::BranchConfig` has no PR switch |
| nixbot always builds `staging`, `trying`, `gh-readonly-queue/*`, `gitea-mq/*` | verified | `webhooks.py::MERGE_QUEUE_PATTERNS`; `service.py::CIService._process_change` | guard runs before `build_branches` is read |
| nixbot build identity is post-merge tree hash; terminal statuses replayed | verified | `gitrepo.py::WorkTree.tree_hash`; `db.py::get_or_create_build`; `build_reuse.py::replay_terminal_status` | PR merge is against the current base tip, not the frozen `base.sha` |
| nixbot cache-status scheduling: `cached` substituted, `local` skipped, only `not_built` built | partly | `build_scheduler.py::JobScheduler._classify`; `models.py::CacheStatus` | wire value is `notBuilt`; everything not `local` and not a cached failure runs (F-E) |
| nixbot posts `nixbot/nix-eval`, `nixbot/nix-build` on the commit SHA | verified | `status.py::ForgeStatusReporter`; `GitHubCheckRunPoster.post` | SHA is the PR head, never the local merge commit |
| nixbot cancels in-flight builds when the PR closes | partly | `service.py::CIService._submit_pr_closed`; `canceller.py::CancellationManager.cancel_pr` | only when `event.merged` is false (F-A) |
| nix-fast-build `--skip-cached` builds only uncached; `--niks3-server` uploads what it built; upload opt-in | partly | `processes.py::nix_eval_jobs`; `workers.py::run_evaluation`; `run_upload_worker` | uploads substituted and `local` outputs too; upload failure fails the run (F-F) |
| gitea-mq enqueues on the label only; Stacks API; no `Depends-On:` | verified | `poller.go::enqueueLabeledPRs`, `enqueueAutoMergePRs`; `forge.go::ResolveStack` | a PR with GitHub auto-merge enabled is a second trigger |
| single up-to-date entry lands by non-force `UpdateRef`; three FF retries then eject | verified | `batch.go::headIfUpToDate`, `HandlePass`, `MaxFFRetries`; `forge.go::FastForward` | `BatchMax` default 1, 0 means unlimited |
| two or more entries land as merge commits; README says linear-history repos should not batch | verified | `batch.go::stack`, `mergeHead`; README "Batching (bors-style)" | README says squash/rebase, `BATCH_MAX=1` (F-H) |
| required-check fallback; one Postgres row; ~10 s then close with comment; auto-setup ruleset | verified | `monitor.go::ResolveRequiredChecks`; `004_batches.sql`; `batch.go::ensureMergedOrClose`; `setup.go::EnsureRepoSetup` | comment is "✅ Merged as `<sha>` via batch #<id>." (F-H) |
| mergify-cli one PR per commit, force-push per head, native registration opt-in; GitHub 403 on classic merge | partly | `plan.rs::plan`; `notes_push.rs::push_branches`; `stack_context.rs::resolve_default_github_native` | push is `--force-with-lease`; the 403 claim appears in no report (unverified) |
| GitHub marks a PR merged when its head becomes reachable from the base | unverified | none | world claim; `pr_upsert.rs::neutralize_stale_bases` records the same observation as motivation only |
| nixbot's own repository lands through gitea-mq batches (Decision) | contradicted | `.github/workflows/auto-merge.yaml`; root `nixbot.toml` | uses `Mic92/auto-merge` (F-C) |
| nixbot cancels the in-flight builds at landing (Decision) | contradicted | `service.py::CIService._submit_pr_closed` | merged PRs are not cancelled (F-A) |
| nixbot's build record is queryable by tree hash; report counts uncached builds (Compliance) | partly | `web/api_routes.py::create_api_router`, `Build`, `Attribute` | no tree-hash query, no `not_built` count (F-D) |
| bors observes only `workflow_run`; lands merge commits by construction (option 4) | verified | `server/webhook.rs::parse_webhook_event`; `merge_queue.rs::handle_successful_build` | `WorkflowType::External` never constructed; landing is a fast-forward onto a pre-built merge commit |

### F-A: merged PRs are not cancelled

`service.py::CIService._submit_pr_closed` calls `canceller.cancel_pr` and `supersede_pending_changes` only under `if not event.merged`, with the comment "A merged PR is not cancelled: the merge commit has the same tree, so its push reuses the PR build."
On the path where V1 holds, every intermediate PR closes as merged and its build runs to completion; on the path where gitea-mq closes members instead, they close unmerged and are cancelled, but that path breaks mergify-cli (F-B).
Corrected accounting per rollup of N: one `staging` build whose uncached work is the interaction derivations; the tip PR build dedupes to that record; N − 1 intermediate PR builds each run a full evaluation and then substitute whatever the authors' `check-fast push=on` runs and the `staging` build already pushed, rebuilding only derivations whose inputs differ from both; none of them gates the landing because gitea-mq evaluates checks on the tip SHA only (`poller.go::pollMergeBranchChecks`).
V5 should measure, per intermediate build, the count of attributes with `cached` false and `status` other than `skipped_local`, the wall-clock time, and whether any landing waited on one; it should no longer assert cancellation.
The Decision, Negative consequence, and V5 were corrected; Appendix B step 10 ("nixbot cancels intermediate builds") and the accounting line ("N − 1 cancelled PR builds") still carry the disproved claim and are the orchestrator's to amend.

### F-B: V1 decides whether mergify-cli's bookkeeping survives a landing

`sync_status.rs::classify` and `changes.rs::classify` treat a commit as merged only when `merged_at` is non-null and the PR head SHA equals the local commit; there is no Change-Id-reachability or trunk-containment check.
`remote_changes::group_by_change_id` drops PRs with `state == "closed"` and null `merged_at`, so a commit whose PR gitea-mq closed looks PR-less and is planned as `Create` on the next `stack push` or `sync`.
The report states the consequence directly: a land performed by fast-forward ref update that leaves `merged_at` null is not classified as merged, and the commit is re-pushed or re-created.
So if V1 fails, the gitea-mq merged-or-close fallback is not an acceptable degradation: every later `stack sync` on a branch containing landed commits reopens PRs for them.
V1 should be treated as a go/no-go for native registration and for fast-forward landing of stacks generally, and its "decide whether that is acceptable" clause should be resolved to "not acceptable" unless the orchestrator never runs `stack sync` or `stack push` on a branch containing landed commits.
Note that when V1 holds, the head SHA condition is met by construction, since fast-forward leaves each member's pushed head SHA in place.

### F-C: nixbot's own repository does not land through gitea-mq

`.github/workflows/auto-merge.yaml` runs `Mic92/auto-merge@main` on `pull_request_target`; root `nixbot.toml` names only `build_branches = ["flakelet"]` and `effects_branches = ["flakelet"]`; no in-repo reference to gitea-mq exists outside `MERGE_QUEUE_PATTERNS`, its test, and `examples/nixbot.toml`.
The "co-designed" claim rested on this and was reduced to what the source shows: nixbot hardcodes the branch pattern.

### F-D and F-E: what nixbot's API and scheduler expose

`web/api_routes.py` lists builds by `status`, `branch`, `pr_number`, or commit prefix; `Build` carries `tree_hash`; `Attribute` carries `status` and a boolean `cached` written by `db.py::complete_attribute` as `job.cache_status == CacheStatus.cached`.
There is no query by tree hash and no `not_built` count.
`JobScheduler._classify` returns `skip` for `local`, `skip-failed` for a cached failure, and `run` for everything else, including `cached` (so nix substitutes) and a missing status.
The Compliance item and V4 were reworded to the queryable quantities.

### F-F: nix-fast-build uploads more than it built

`workers.py::run_evaluation` queues `local` outputs for upload without building; `run_builds` queues every successful `nix build` result, which may have been substituted; only `--push-build-closure` is restricted to derivations nix ran a builder for.
`run_upload_worker` reports a non-zero uploader exit as a failed result and `run()` sets `rc = 1`, so `push=on` turns an upload failure into a failed `check-fast`.

### F-G: V9 settled from source

`nix/module.nix` exposes `batchMax` (default 1), `requiredChecks` (default `[]`), and `skipQueueIfUpToDate` (default `true`) as first-class options, and does not expose the merge label; `config.go::Load` defaults `GITEA_MQ_MERGE_LABEL` to `merge-queue`, so R12's label value holds without configuration.
The module has no `extraEnv`, no database provisioning (the operator supplies `databaseUrl`, default `postgres:///gitea-mq?host=/run/postgresql`), runs with `DynamicUser = true`, and listens on TCP only via `listenAddr`; `mq.scientistexperience.net` therefore needs a reverse proxy and a `services.postgresql.ensureDatabases` entry in this repo's module.
The Compliance assertion for `GITEA_MQ_MERGE_LABEL` can only assert that no override exists.

### F-H and bors: wording

README wording is "Repos that mandate squash/rebase should leave `BATCH_MAX=1`"; the close comment is "✅ Merged as `<sha>` via batch #<id>."; `GITEA_MQ_BATCH_MAX` defaults to 1 and 0 means unlimited (`queue/batch.go::FormBatch`).
bors builds a merge commit on `automation/bors/auto-merge` and then `set_branch_to_sha(&pr.base_branch, &commit_sha, ForcePush::No)` in `merge_queue.rs::handle_successful_build`; the rejection holds, and the wording was changed from "lands merge commits by construction" to fast-forward onto a pre-built merge commit.

### V-items settled from source, pending runtime confirmation

V2: `poller.go::prCheckResult` reads existing check states at enqueue, and `pollMergeBranchChecks` re-reads them for each `testing` batch on the head SHA; `Engine.HandleCheck` compares only context name and state, with no timestamp comparison and no arrive-after requirement.
V3: `status.py::ForgeStatusReporter` posts `{prefix}/nix-eval` and `{prefix}/nix-build`, and `build_reuse.py::replay_terminal_status` re-posts both on the reusing event's SHA; per-attribute failure contexts `nixbot/nix-build <forge>:<project>#<name>` also exist and are ignored by an explicit required list.
V7: `stack push` never runs `git commit`; `sync`, `drop`, and `reorder` rebase through `git::spawn_rebase*` with no `-S`, `--gpg-sign`, or `--reset-author`, so the trailer survives as commit-message text and the signature after rebase is whatever the orchestrator's git defaults produce.
V8: nothing reads commit author or committer; the prefix is read from `mergify-cli.stack-branch-prefix` (`stack_context::configured_branch_prefix`); `--author` (default `GET /user` login) is used only for the PR search filter `author:{a}` and the default prefix, so it must equal the identity that opened the PRs.
V9: above.

## ADR conventions review

Sections: Title (frontmatter), Status, Context, Decision, Consequences, Compliance, Notes are present and in order, followed by two appendices; the appendices are outside the seven-section structure and are addressed under single-copy below.
Title carries the placeholder `ADR-XXXX`; Status explains that numbering follows promotion, which the conventions accept for a working-note ADR under the `docs/notes/` lifecycle.
Status includes the date, Scope, and Related.
Decision is in commanding voice ("We will land changes as bors-style rollups") with a technical justification and business justifications under cost, time to market, and strategic positioning; user satisfaction is not named, though the bounded author wait under "time to market" is that category's content.
Consequences carry Positive, Negative, and Neutral.
Compliance names automated checks (flake check, module assertion, repository check, API report) and manual verification items.
Qualification test: pass; the decision changes deployment topology (a second GitHub App, a Postgres database, a public endpoint on magnetite) and platform selection (gitea-mq over the Mergify queue), and both technical and business rationale are stated.
Notes carry author, approval state, and source pins but no last-modified fields; the in-place corrections in this review warrant a "last modified" line.
Status lifecycle: Proposed ADRs are modified in place rather than superseded, which is what permits the corrections applied here.
Two style deviations: multiple sentences per line throughout, and several source citations by file only (`db.py`, `status.py`, `canceller.py`) where the citing convention asks for a symbol.

## WRSPM classification of Appendix A

| id | stratum | reason |
|---|---|---|
| R1 | world-goal; machine: mergify-cli | the one-commit-one-PR unit is a process policy; title/body rendering is `plan.rs::plan` behaviour we rely on, not specify |
| R2 | machine: flake/repo | jj template emits the trailer; testable by regex on the commit |
| R3 | world-goal | "builds on its own" is a quality goal; nixbot's PR build is its discharge, not the requirement |
| R4 | machine: orchestrator | body and bookmark format at the worker/orchestrator interface; lintable |
| R5 | machine: flake/repo | `src` filtering is testable by derivation-hash stability |
| R6 | world-assumption; machine: nixbot | the author running `check-fast push=on` is human behaviour; the shared niks3 is nixbot configuration |
| R7 | machine: orchestrator | globs in `landing.toml` drive batching; testable |
| R8 | machine: nixbot | repo config value; merge-queue behaviour is verified upstream fact |
| R9 | world-assumption; machine: orchestrator | nixbot has no PR-build switch (`repo_config.py::BranchConfig`), so unconditional builds are a fact about the tool; PR timing is orchestrator behaviour |
| R10 | machine: nixbot | `statusContextPrefix` and the two contexts |
| R11 | machine: nixbot | `effects_branches` repo config |
| R12 | machine: gitea-mq | module options; label holds by `config.go::Load` default |
| R13 | machine: orchestrator; world-assumption | pushing with `--github-native` is ours; gitea-mq not reading `Depends-On:` is a tool fact |
| R14 | machine: orchestrator | serialization rule at the labeling interface |
| R15 | machine: GitHub | App permissions and events; checkable against the App settings |
| R16 | machine: GitHub | ruleset contents; checkable through the rulesets API |
| R17 | machine: orchestrator; world-goal | `mergify-cli.stack-branch-prefix` is config; "workers never push" is a role rule |
| R18 | world-goal | a procedural constraint on people and agents, not observable at an interface |
| R19 | machine: flake/repo | skill installation and override; the `first-party-skill-distribution` capability already covers this shape |
| R20 | machine: orchestrator | ref pushed; testable |
| R21 | machine: orchestrator | trailer written; testable |
| R22 | machine: orchestrator | signing and author preservation; testable on the landed commits |
| R23 | world-goal | a property wanted of history, delivered by R20 and R25 |
| R24 | machine: orchestrator | ordering and refusal at assembly |
| R25 | machine: orchestrator | id format shared by ref and trailer |
| R26 | machine: orchestrator | one candidate in flight |
| R27 | machine: orchestrator | branch name |
| R28 | machine: orchestrator | reconstructibility; testable by a restart scenario |
| R29 | machine: orchestrator | the Linear ready signal is a shared phenomenon read at the orchestrator interface |
| R30 | world-goal; machine: GitHub | sole-pusher is a role rule; its enforcement is the ruleset bypass list in R16 |

World-side statements filed as requirements: R1 (unit clause), R3, R6 (author clause), R9 (unconditional-build clause), R13 (`Depends-On:` clause), R18, R23, R30 (role clause).
Each belongs in Context as narrative or, where it is a fact about an upstream tool the design depends on, as a `world-assumptions` entry with a violation scenario in the shape of A9 through A12 in `openspec/changes/stand-up-nixbot-on-magnetite/specs/world-assumptions/spec.md` (an indicative statement, "Any requirement whose discharge depends on this fact SHALL name it explicitly", and a WHEN/THEN scenario naming which requirements lose their discharge).

Spec deltas (machine-side, testable at an interface): R2, R4, R5, R7, R8, R10, R11, R12, R14, R15, R16, R17 (prefix clause), R19, R20, R21, R22, R24, R25, R26, R27, R28, R29.
World-assumption entries: nixbot builds every PR with no switch (R9); gitea-mq resolves stacks only through the Stacks API (R13); GitHub marks a fast-forwarded stack member merged (the V1 claim, currently the GitHub bullet in Context); mergify-cli classifies merged by `merged_at` and head SHA (F-B, absent from the ADR today); nixbot does not cancel a merged PR's build (F-A).
Context prose: R1 (unit), R3, R6 (author discipline), R17 (role), R18, R23, R30 (role).

## Single-copy analysis

Once the OpenSpec change carries Appendix A as spec deltas, the 30 requirement lines and their five group headings (about 55 lines) leave the ADR; the world-assumption candidates above go with them into a `world-assumptions` delta.
Once `030-stacked-landing-protocol.instructions.md` and the `git-stacked-pr-integration` skill carry Appendix B, the worker and orchestrator procedures, the red paths, and the accounting line (about 37 lines) leave too, which also disposes of the two disproved cancellation statements without a further ADR edit.
What stays: Status, Context (naming, situation, constraints from source with pins, considered options), Decision, Consequences, Compliance with automated items pointing at capability names (for example `landing-queue`, `world-assumptions`) rather than restating requirement text, and Notes.
The "Constraints established from source" subsection is the rationale for the decision and stays in Context; its citations are the ADR's, not a second copy of the world-assumption entries, which state violation conditions rather than mechanisms.
Suggested end state: about 150 lines against 240 today.
`stacked-landing-settings-review.md` is superseded by this ADR's Status section but has no frontmatter at all (it opens with a `#` heading); it should receive `superseded-by: adr-substitution-first-rollup-landing.md` now, or be deleted when the first change archives, per the provenance conventions' 30-day rule.

## Corrections applied to the ADR

1. Related: "`stand-up-nixbot-on-magnetite` (archived)" → "`stand-up-nixbot-on-magnetite` (In Review, not yet archived)".
2. nixbot bullet 4: "derivations reported `cached` are scheduled for substitution, `local` ones are skipped, only `not_built` ones are built (`build_scheduler.py`). The server pushes everything it builds to niks3 (`services.nixbot.niks3`)." → "derivations reported `cached` are scheduled so that nix substitutes them, `local` ones are skipped, and everything else, including `notBuilt` and jobs with no cache status, is built (`build_scheduler.py::JobScheduler._classify`). The server pushes everything it builds to niks3 through a warn-only uploader (`services.nixbot.niks3`)."
3. nixbot bullet 6: "Cancels a PR's in-flight builds when the PR closes (`canceller.py`)." → "Cancels a PR's in-flight builds when the PR closes unmerged; a PR closed as merged is not cancelled, because the merge commit shares its tree and reuses the build (`service.py::CIService._submit_pr_closed`, `canceller.py`)."
4. nix-fast-build bullet: "uploads what it built (`push=on` in the recipe, opt-in)" → "uploads the outputs of every successful build, whether built or substituted, and of every `local` derivation, and an upload failure fails the run (`workers.py::run_evaluation`, `run_upload_worker`; `push=on` in the recipe, opt-in)".
5. gitea-mq bullet 1: "Enqueues on the `merge-queue` label; on GitHub the label is the only way to enqueue a stacked PR" → "Enqueues on the `merge-queue` label or on a PR with GitHub auto-merge enabled (`poller.go::enqueueLabeledPRs`, `enqueueAutoMergePRs`); on GitHub these are the only ways to enqueue a stacked PR".
6. gitea-mq bullet 3: "the README states repositories that mandate linear history should not batch" → "the README states repositories that mandate squash or rebase merges should leave `BATCH_MAX=1`".
7. gitea-mq bullet 4: "closes them with a "Merged as `<sha>`" comment" → "closes them with a "✅ Merged as `<sha>` via batch #<id>." comment".
8. Option 4: "lands merge commits by construction" → "fast-forwards the base onto a merge commit it built on its own branch (`merge_queue.rs::handle_successful_build`), so main receives merge commits by construction".
9. Decision technical bullet 2: "gitea-mq is co-designed with nixbot (nixbot hardcodes `gitea-mq/*`; nixbot's own repository lands through gitea-mq batches) and reads check runs by name" → "nixbot hardcodes gitea-mq's branch pattern (`webhooks.py::MERGE_QUEUE_PATTERNS`; nixbot's own repository lands through `Mic92/auto-merge`, not gitea-mq), and gitea-mq reads check runs by name".
10. Decision technical bullet 4: "Their cost is neutralized by ordering: PRs are opened only after the `staging` build is green and are closed by the landing seconds later, at which point nixbot cancels the in-flight builds." → "Their cost is bounded by ordering: PRs are opened only after the `staging` build is green and are merged by the landing seconds later. nixbot does not cancel a PR closed as merged (`service.py::CIService._submit_pr_closed`), so the intermediate builds run to completion, substituting from niks3 what the authors' `check-fast` runs and the `staging` build already pushed; they gate nothing, because gitea-mq reads checks on the tip SHA only."
11. Negative consequence 1: "N − 1 nixbot PR builds are dispatched and cancelled per rollup. They may begin evaluation." → "N − 1 nixbot PR builds are dispatched per rollup and run to completion, since nixbot does not cancel a PR closed as merged. Each evaluates in full; its uncached work is whatever neither the author's `check-fast` run nor the `staging` build pushed to niks3."
12. Compliance automated item 4: "nixbot's own record per landing (one build record shared by `staging`, tip PR, and main) is queryable through its API; a periodic report counts uncached builds per `refs/landings/*` ref." → "nixbot's API (`web/api_routes.py`) lists builds by branch, PR number, or commit prefix and returns each build's `tree_hash` and each attribute's `status` and `cached` flag; a periodic report resolves each `refs/landings/*` ref to its commit, fetches the builds for that commit, confirms `staging`, tip PR, and main share one `tree_hash`, and counts attributes with `cached` false and `status` other than `skipped_local` as the uncached work."
13. V4: "shows only interaction derivations as `not_built` in nixbot's eval report" → "shows only interaction derivations as uncached in nixbot's build record (attributes with `cached` false and `status` other than `skipped_local`; nixbot's API does not expose the `notBuilt` status itself)".
14. V5: "Intermediate PR builds are cancelled on close and release worker capacity." → "Intermediate PR builds, which nixbot does not cancel when the PR closes as merged, substitute rather than rebuild: for each, record the uncached attribute count and wall-clock time against the `staging` build, and confirm they never delay a landing."

## Open items for the orchestrator

1. Appendix B step 10 and the accounting line still state cancellation of intermediate builds; the task excluded Appendix B from edits.
2. V1's "decide whether that is acceptable" clause should be resolved per F-B; whether to amend V1's text now or when Appendix A becomes spec deltas is a wording decision.
3. gitea-mq also enqueues any PR with GitHub auto-merge enabled, and `setup.go::EnsureRepoSetup` turns `allow_auto_merge` on; R14 and R30 therefore need the orchestrator to be the sole enabler of auto-merge as well, or the repository setting to be turned back off.
4. The mergify-cli bullet's "GitHub returns 403 on the classic merge endpoint for registered stacks" appears in no report; the gitea-mq report shows `MergePR` using `merge-async` with a 404 fallback to the classic endpoint, and the mergify-cli report records a 422 on PATCHing `base` for a registered stack. The claim is unverified and was left in place.
5. `--author` for `stack push` must equal the login that opened the PRs, or `remote_changes` discovery misses them; the ADR does not name the orchestrator's GitHub identity for mergify-cli.
6. Signature survival across `sync`/`drop` (V7) depends on the orchestrator's `commit.gpgsign` setting during rebase, which no report checked; V7 remains a runtime item.
7. Notes lacks a last-modified entry for this in-place revision; adding one is a conventions fix, not a factual correction, so it was not applied.
8. `stacked-landing-settings-review.md` has no frontmatter; adding `superseded-by:` requires adding a frontmatter block.

## Revision 2

Reviewed and rewritten in place, 2026-09-09; the ADR remains Proposed.
The preceding review is a historical record of revision 1, including its old requirement numbers and open items; this section records the replacement design.
The title is now “Substitution-first landing through nixbot and gitea-mq batching”; the filename stays unchanged for existing links.
The central correction is that queue merge commits are built before landing: `internal/batch/batch.go::Engine.HandlePass` fast-forwards to the tested SHA, so the orchestrator rollup onto `staging` is unnecessary.
The decision uses `batchMax = 5`, like all three surveyed GitHub deployments, with our nixbot-check ruleset alongside the App's `gitea-mq` ruleset and no linear-history or classic protection.
Risk class controls when authorization is allowed; shape controls whether to enable ordinary-PR auto-merge or label the topmost intended registered-stack PR.
E1 explicitly chooses review-before-signal by convention: `internal/poller/poller.go::enqueuePR` is review-blind, and the App bypasses approving-review rules when updating refs.
`PollOnce` attempts auto-merge enqueue first without stack resolution; no stack member may have auto-merge enabled, even if correctly labelled.
In batch mode, `Engine.HandlePass` and `Engine.ensureMergedOrClose` finalize only actual queue entries, which for a labelled stack means its selected top PR.
Lower members receive no queue completion status or explicit close; their pending hint comes from `internal/poller/poller.go::hintStackedPRs`, called without a batch-mode guard.
`finalizeLabeledMerge` and “Merge queue passed (stack)” are legacy paths, reachable here only for persisted non-batch entries surviving a configuration change.
V1 now requires GitHub to mark every registered-stack member merged without queue repair, blocks promotion, and remains unverified; #5887–#5890 discharge only the observed non-stack case.
Appendices remove assembly, serialization, `staging`, landing refs/trailers, and orchestrator-only publication; R1–R16 replace R1–R30, with the complete mapping in `logs/adr-verify/adr-rewrite-report.md`.
Compliance retains V1–V4, V9, and V10, drops V5–V8, and adds execution-per-PR measurement (V11) and a manual E1/shape audit (V12).
Source corrections also preserve the source-filtering change's `gitleaks` allow-list, use the positional command `just check-fast auto on`, and scope PR effects with `effects_on_pull_requests` rather than branch globs alone.
Unsupported universal reachability, fixed CI-count savings, native-stack classic-merge 403, and universal signature-loss claims were removed; commercial and alternative-queue assumptions are marked unverified.
Standards review: seven ADR sections remain in order, both justifications and labelled consequences are present, citations use paths and symbols, and modification metadata is recorded.
Spec review: the queue-only decision, deployment evidence, enqueue asymmetry, pending/completion distinction, and blocking V1 are represented; runtime verification and OpenSpec/instruction transfer remain follow-up work.

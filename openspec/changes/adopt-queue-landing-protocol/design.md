## Context

This design is for an implementation agent and the operator coordinating App installation.
The authority is `docs/notes/development/version-control/adr-substitution-first-rollup-landing.md` §Decision, Appendix A R15/R16, and Appendix B.
The current first-party documents route publication to `mergify-stack` and landing to `stack-land` or Mergify's server queue.
`030-stacked-landing-protocol.instructions.md` reaches user-level harness context through `modules/home/tools/agents-md.nix::fragments` and root context in full composition through `modules/apps/apm-context-compile.sh`.
Its routing therefore needs verification beyond the source fragment.

The supervisor reports an active service at https://mq.scientistexperience.net on magnetite: App 4875422, batch maximum 5, and required checks `nixbot/nix-eval` and `nixbot/nix-build`.
The App is deliberately not installed and the service manages zero repositories.
These are supplied context, not observations from this planning run.
App installation and ruleset verification remain owned by `stand-up-gitea-mq-on-magnetite`.

The sibling change's `specs/world-assumptions/spec.md` supplies A22–A28.
A22 covers native registration, A23 member bookkeeping, A24 auto-merge enqueue precedence, A25 forge-first required checks, A26 tested-SHA batch landing, A27 review blindness and bypass, and A28 chained member bases.
Do not renumber or duplicate those assumptions in this change.
The current canonical `world-assumptions` designation table remains the shared vocabulary home; no behavioral-stratum requirements are introduced here.
Requirements about delivered instructions, files, commands, and configuration belong to the interface stratum.

## Goals / Non-Goals

Goals:

- Deliver one first-party authorization procedure and replace every scoped caller's retired landing instruction with a pointer to it.
- Preserve worker return-by-ref, Change-Id identity, independently shippable stack commits, and local jj development-join and worktree rules.
- Keep the upstream skill unmodified and expose the fleet overrides alongside it.
- Make `stack-land` incapable of performing a remote landing while retaining diagnostic assertions.
- Coordinate instruction delivery before installation and Mergify queue removal within the installation window.
- Record the formal ADR audit and require explicit supersession for any conflicting commitment.

Non-goals:

- R11/R13/R14 service, App, ruleset, database, proxy, or deployment implementation.
- R1/R2 check-source filtering or changes to the warming recipe.
- A new queue, orchestrator-built rollup, `landing.toml`, or transport-ref protocol.
- Upstream skill patches or manual changes to generated context and delivered skills.
- Reclassifying all generic buildbot documentation or replacing local jj authoring mechanics.

## Decisions

### D1: Keep one first-party owner for queue authorization

Boundary: first-party policy versus upstream mechanism, and documented policy versus externally enacted authorization.
`modules/home/ai/plugins/version-control-and-forge/.apm/skills/git-stacked-pr-integration/SKILL.md` will own a section named `Queue authorization` that applies to ordinary PRs and registered stacks in repositories using this queue.
Extend its description to include ordinary-PR authorization so discovery reaches the new content.
The `skill-corpus-interface` delta's `Queue authorization has one documented owner` requirement defines that section's content once.
All ten other scoped files point to this section rather than reproducing its full command sequence or inventing an alternative gate.

The fleet role fragment still assigns ordering and stack publication to the orchestrator for delegated worker refs.
Its terminal role becomes authorization followed by handoff to the queue, with no synchronous landing wait.
An independent human author's use is not restricted to an orchestrator role.
The jj references retain local chain manipulation, development joins, return-by-ref, and cleanup mechanics; their external submission phase routes to the same policy.
For queue-managed GitHub repositories, legacy N+1 aggregate-PR and direct-trunk integration recipes must not override the ordinary-versus-registered-stack split.
Generic examples for other forges may remain only when explicitly outside this protocol's scope.

A new policy skill was rejected because it would duplicate the established owner.
Eight copies of the procedure were rejected because callers would drift independently.

### D2: Layer fleet overrides over an unchanged upstream skill

Boundary: unedited apm-installed upstream content versus authored first-party policy.
Keep `mergify-stack` and `git-stacked-pr-integration` separately addressable.
The first-party override section states the mandatory native-registration flag, verifies actual registration rather than trusting command success, and explains the configured branch namespace.
`crates/mergify-stack/src/stack_context.rs::configured_branch_prefix`, `default_branch_prefix`, and `resolve_default_branch_prefix` read `mergify-cli.stack-branch-prefix`, defaulting to `stack/<author>`.
Preserve that namespace and the PR-opening identity across a published stack; a local branch name alone does not redefine its remote identity.
Do not impose an invented fixed fleet prefix.

Override the upstream advice to sync an existing stack after landing: never resync or repush a landed stack as the normal author workflow; start a fresh stack for subsequent work.
The reason is the ADR's `crates/mergify-stack/src/sync_status.rs::classify`, `changes.rs::classify`, and `remote_changes.rs::group_by_change_id`: merged detection requires a matching head and merge timestamp, and closed-unmerged PRs can be recreated.
The sibling first-live V1 re-confirmation is a controlled verification activity, not the author procedure.

Patching the upstream skill was rejected because future apm refreshes would overwrite policy and obscure provenance.
Release alignment and the existing offline dependency pin remain unchanged.

### D3: Verify source-to-delivered text explicitly

Boundary: authored plugins versus Nix-composed and harness-delivered output.
`~/.claude/skills/<skill>/SKILL.md` is a read-only Nix store symlink.
Edits belong in `modules/home/ai/plugins/`, reach composition through `pkgs/by-name/apm-skills-compose/`, and reach harnesses through `modules/home/ai/skills/`.
Other harnesses can receive generated writable copies; that does not make them authoring sources.
Each skill task checks the source and the corresponding file under a freshly built `apm-skills-compose` output.
A source-only grep is insufficient evidence of delivery.

Evaluate `darwinConfigurations.stibnite.config.home-manager.users.crs58.programs.agents-md.settings.body` to observe the fleet fragment in generated user context.
Build the relevant home configuration before operator-approved activation, then inspect the delivered user context and skill owner at the cutover prerequisite gate.
Exercise both `just agents-context` and `just agents-context-full` in disposable copies during apply, because the default composition includes the repository tier and the full mode also includes the fleet fragment.
Do not hand-edit the root `AGENTS.md` or a delivered user-level file.

Treating the existing delivered symlink as current was rejected: it can retain old bytes until rebuild and activation.
The root producer lock and repository-local `.agents/` are separate delivery paths; do not claim that a Nix output refresh updates them.
If they are used for cutover, refresh them through their generator after the source reaches main and verify their bytes explicitly.

### D4: Demote the tool without retaining a landing fallback

Boundary: observable CLI behavior and remote side effects.
In `pkgs/by-name/stack-land/stack-land.sh`, preserve the explicit `--dry-run` assertion path and reject invocations that omit it before any GitHub or git operation.
Keep the command name and arguments for explicit diagnostics; update `usage` and `package.nix::meta.description` to say assertions only.
Remove the real push and post-push merged-state loop rather than merely hiding them behind a default flag.
The optional diagnostics retain ancestry, trailer, and reported-check assertions, including nonempty `SUCCESS`/`NEUTRAL`/`SKIPPED` sets.
These assertions are not a prerequisite for queue authorization and are not equivalent to the queue's selected-head check gate.
Fetching a target for inspection may update local fetch state; assertion-only means no remote ref update or forge mutation, not zero local I/O.

Use the existing `test-stack-land.sh` harness as the TDD seam.
Add failing tests for omitted `--dry-run` and forbidden mutating traces before removing production effects, then retain the existing assertion negative cases.
Check both remote target stability and the absence of push/merge/API-write operations; an unchanged ref alone could hide an attempted rejected push.
Delete no package or home-manager wiring.
Keeping an unused real mode was rejected because it would remain a bypass available to stale instructions.

### D5: Stage configuration retirement with the operator's installation window

Boundary: committed queue configuration versus live App installation controlled outside this change.
The pre-install group contains all instruction and skill edits and their built-output checks.
Its owner section includes a transition hold for repositories not yet managed by gitea-mq: stop before authorization and request coordinated cutover, without a direct-push fallback.
The old Mergify queue configuration remains intact while these edits land and reach harnesses.

The cutover group removes `.github/mergify.yml::pull_request_rules` entries `queue human PRs` and `queue bot PRs`, `.github/mergify.yml::queue_rules` entries `default` and `bot-updates`, and the now-unused `merge_queue` block and queue-only anchors.
Preserve `self-assign PRs` and `auto-approve owner-authored PRs with label`; the latter is review automation, not authorization under the adopted protocol.
Parse YAML and inspect rule names, not just textual absence of the word queue.
The removal lands only in the same operator-coordinated window as App installation.
Service and ruleset writes stay in the sibling change.
Do not remove the working Mergify queues during pre-install documentation work.

Removing queue configuration first was rejected because it would leave no working landing path before installation.
Installing first was rejected because stale agents could bypass the queue through a bypass actor or stall on obsolete checks.

### D6: Audit ADR commitments before implementation acceptance

Boundary: architectural decisions versus operational guidance.
The planning audit enumerated 21 numbered files plus `index.md` under `packages/docs/src/content/docs/development/architecture/adrs/`.
Case-insensitive `mergify|buildbot|queue|landing` search found zero matching files.
ADR-0012 §Decision and ADR-0016 §Decision address GitHub Actions and caching, with no commitment to either retired landing gate.
This is a scoped negative finding, not a claim that all historic CI documentation matches the present deployment.

Repeat the inventory and search during apply, inspect any matching decision and consequence sections, and save the count and findings in this change.
A hit requires a proposed superseding ADR and an operator decision before contradictory guidance is accepted.
Do not quietly rewrite an accepted ADR or expand this change into unrelated historical CI cleanup.

### D7: Verification modalities and satisfaction boundary

All four capabilities are interface-stratum: the requirements constrain observable documents, configuration, and command effects.
The source/delivery and configuration cases use integration-smoke checks; the tool command cases use executable CLI contract tests through its existing package test derivation.
No new domain lifecycle or pure-function law is introduced, so no `.feature` or EST artifact is required for this planning change.

| Requirement group | Modality | Evidence and limit |
| --- | --- | --- |
| Distinct policy distribution and caller routing | integration-smoke | Source inventory, composed skill bytes, evaluated and generated context; no claim about harness selection |
| Canonical authorization and upstream overrides | integration-smoke | Owner-section content matrix and dangling-pointer review; no proof of E1 compliance |
| Assertion-only tool | CLI contract tests | Non-dry-run rejection, negative assertions, no mutating traces, unchanged remote target in isolated fixtures |
| Coordinated queue retirement | integration-smoke plus operator gate | YAML semantics, pre-install delivery evidence, and installation-window record; no inference of timing from git order alone |

The ADR and sibling assumptions explain why the documented signals are appropriate; neither OpenSpec validation nor text matching proves those world facts.
Manual E1 auditing remains necessary after cutover.

## Risks / Trade-offs

- [Risk] Auto-merge on a stack member takes precedence over a correct label. → Mitigation: explicit prohibition and precedence rationale in the owner, plus an all-member auto-merge absence check before stack authorization.
- [Risk] A successful native push degrades to headers without registration. → Mitigation: require native membership evidence and selected-head ancestry before signalling.
- [Risk] Risk classification or required review is omitted. → Mitigation: name E1's convention boundary and record review-before-signal evidence in manual samples; do not claim ruleset enforcement.
- [Risk] A caller retains a direct-trunk, aggregate-PR, or Mergify terminal path. → Mitigation: one task per file, targeted negative content review, and rebuilt output inspection.
- [Risk] A live harness still sees old guidance. → Mitigation: block installation on delivered-output confirmation, including repository-local materialization where used.
- [Risk] Tool tests observe unchanged state despite an attempted write. → Mitigation: fail on mutating command traces as well as remote ref changes.
- [Trade-off] Pre-install text includes a temporary authorization hold. → It allows documentation to land first while retaining the working old queue until the operator's window.

## Migration Plan

1. Recheck the path inventory, source ownership, and formal ADR audit.
2. Implement the owner and every caller, build the composed skills, evaluate user context, and test root composition modes.
3. Land and deliver those instruction and skill edits before App installation; retain `.github/mergify.yml` queue behavior through this group.
4. Exercise and deliver the assertion-only tool; it has no fallback landing mode.
5. Present the Mergify YAML diff and pre-install evidence to the operator coordinating the sibling App-installation gate.
6. In that window, remove Mergify queue behavior and let the sibling change install the App and verify live rulesets; hold author authorization until its readiness evidence exists.
7. Run read-only authorization audits and collect asynchronous rejection/completion evidence without making authors wait on a synchronous landing handler.

Before installation, an orchestrator can roll back the instruction group if delivery checks fail while Mergify still works.
After installation, stop new authorization and ask the operator to coordinate any queue rollback with the sibling change; reverting YAML alone could activate competing queues.
Do not restore real `stack-land` as incident recovery.
Acceptance of this planning change is complete artifacts and strict structural validation; implementation, delivery, live cutover, and E1 samples remain unchecked apply tasks.

## Open Questions

No unresolved planning decision.
App installation timing and live authorization evidence remain explicit operator gates, not facts inferred from this plan.

## MODIFIED Requirements

### Requirement: Stacked landing guidance is conditioned by role and repository mode

The delivered corpus SHALL assign preparation and verification of one independently shippable change to a worker and SHALL require that worker to return its ref and evidence without publishing or landing.
For delegated stacks, the delivered corpus SHALL reserve ordering refs and publishing the pull-request stack for the orchestrator and SHALL describe its terminal action as authorization under `Queue authorization has one documented owner`, followed by asynchronous queue ownership of landing.
The first-party stacked-PR skill SHALL refer to the upstream `mergify-stack` skill for authoring and publication mechanics, subject to the first-party overrides in `Fleet overrides remain separate from the upstream Mergify skill`.
The fleet `Stacked landing protocol` fragment SHALL keep the OpenSpec change, normally bound to one Linear story, as the dispatch unit and encode each independently shippable delivery step as one commit and one pull request.
Repository-mode detection SHALL select local authoring and working-copy mechanics without changing stack identity, pull-request bookkeeping, or the authorization protocol.
The protocol SHALL narrowly override the generic atomic-commit rule for a stacked delivery unit: corrections update that delivery commit without rewriting unrelated history.
The existing jj development-join, hazard, recovery, worktree-interop, and return-by-ref contracts SHALL remain authoritative for local operations.
The text SHALL retain Git as baseline, jj as an upgrade path when integration conflict volume warrants it, and the shared `Change-Id` format.
The fragment SHALL remain fleet-tier guidance: user-level composition includes it, full root composition includes it where user context is absent, and default repository-tier composition SHALL NOT repeat fleet context.
No scoped caller SHALL instruct an author to invoke real `stack-land`, trigger a Mergify server queue, or push the default branch directly as the landing mechanism for a queue-managed repository.

Trust boundary: these properties establish visible role and routing statements, not authority grants, forge topology, review compliance, or successful landing.

#### Scenario: Worker prepares one stack step

- **WHEN** the worker contract is read in the delivered corpus
- **THEN** it requires one verified delivery ref and evidence, without publication or landing
- **AND** it preserves corrections within that delivery unit and the existing local VCS safety contracts

#### Scenario: Orchestrator prepares a Git-native landing

- **WHEN** the orchestrator contract is read in the fleet fragment and policy skill
- **THEN** both assign ordering and publication to the orchestrator
- **AND** both route authorization to the canonical owner and landing to the asynchronous queue rather than a checked push handler

#### Scenario: Repository is jj-managed

- **WHEN** the delivered jj guidance describes the chain-to-ref-to-stack handoff for a queue-managed repository
- **THEN** local development joins and worktree return-by-ref remain unchanged
- **AND** the external landing phase references the same owner without offering a direct-trunk or N+1 aggregate-PR alternative for that protocol

#### Scenario: OMP composes user and project context

- **WHEN** default repository context, full repository context, and user-level context are generated from their selected fragments
- **THEN** the default repository context contains its repository-specific route without repeating fleet-tier paragraphs
- **AND** full repository and user-level context contain the fleet role fragment with the same authorization route

#### Scenario: Landing policy evaluates reported check conclusions

- **WHEN** the policy describes the optional `stack-land --dry-run` diagnostic
- **THEN** it describes nonempty `SUCCESS`, `NEUTRAL`, or `SKIPPED` sets as passing that diagnostic and all other sets as blocking it
- **AND** it does not require that diagnostic for authorization or identify it with the queue's selected-head gate

#### Scenario: Stacked delivery narrows the generic commit rule

- **WHEN** the fleet protocol is read with its surrounding VCS instructions
- **THEN** each independently shippable stack step remains one delivery commit and one PR within the dispatched OpenSpec change
- **AND** corrections update only that delivery unit, workers return refs, and existing jj safety and worktree-ownership rules remain authoritative

## ADDED Requirements

### Requirement: Queue authorization has one documented owner

`git-stacked-pr-integration` SHALL own a `Queue authorization` section covering ordinary trunk-based PRs and registered stacks in repositories managed by gitea-mq.
Its trigger description SHALL admit ordinary-PR authorization as well as stacked delivery.
The section SHALL describe the following policy and procedure; these are requirements on the document's content, not claims that the machine enforces human conduct:

- Risk class determines when to authorize: CI-sufficient changes need no additional review by policy, while review-required changes need review of all intended changes before the signal, including all members selected by a stack's top label.
- PR shape determines how to enqueue independently of risk class; human or agent authorship determines neither axis.
- The enqueue signal is merge authorization under E1, a convention subject to manual audit: the queue is review-blind and its App bypasses rulesets, so approving-review rules do not constrain its ref update.
- An ordinary trunk-based PR is authorized by enabling GitHub native auto-merge with the button or `gh pr merge --auto`.
- A registered stack is published with `mergify stack push --github-native`; the author verifies native registration, selected-head ancestry, and absence of auto-merge on every member before labelling only the topmost intended PR `merge-queue`.
- Auto-merge is prohibited on every stack member, including the bottom member, even with a correct top label.
- The prohibition's rationale names gitea-mq `internal/poller/poller.go::enqueueAutoMergePRs`, which targets `pr.BaseBranch` without resolving a stack; `labeledTargetBranch`, which calls `ResolveStack`; and `PollOnce`, whose auto-merge path runs first while `enqueueLabeledPRs` skips already-queued PRs, allowing a member's auto-merge to silently override the correct stack target.
- A successful push or `Depends-On:` header alone is insufficient evidence of native registration.
- Before publication from an aarch64-darwin laptop, CI warming uses `just check-fast auto off x86_64-linux 2>&1 | tee logs/checks-linux-$(date +%Y%m%d-%H%M%S).log`.
- `justfile::check-fast` takes positional `nom push system` parameters; a non-native system adds `--remote magnetite.zt --no-download --retries 2`, leaving outputs on magnetite for nixbot's local-store reuse.
- `just check-fast auto on` populates niks3 for peer darwin laptops and is not needed to warm CI; native laptop feedback is separate, and changed trees can still require new builds.
- After authorization, the author does not wait for landing and can begin other work; queue rejection arrives as a comment on the PR.
- Before repository installation readiness is confirmed, authors stop before authorization and request the coordinated cutover rather than using direct-push or real `stack-land` fallback.

The first-party callers listed below SHALL point to this owner and SHALL remove contradictory terminal landing instructions for queue-managed repositories rather than restating the complete procedure:

- `agent-context-vcs/.apm/instructions/030-stacked-landing-protocol.instructions.md`
- `nix-build-operations/.apm/skills/nix-flake-pr-cycle/SKILL.md`
- `preferences-code-and-collaboration-conventions/.apm/skills/preferences-git-version-control/SKILL.md`
- `preferences-code-and-collaboration-conventions/.apm/skills/preferences-git-version-control/03-jj-mode.md`
- `version-control-and-forge/.apm/skills/jj-version-control/SKILL.md`
- `version-control-and-forge/.apm/skills/jj-version-control/diamond-workflow.md`
- `version-control-and-forge/.apm/skills/jj-version-control/tiered-ceremony.md`
- `agent-context-vanixiets/.apm/instructions/10-repository-overview.instructions.md`
- `preferences-nix-and-secrets/.apm/skills/preferences-nix-ci-cd-integration/references/buildbot-nix-configuration.md`
- `preferences-nix-and-secrets/.apm/skills/preferences-nix-ci-cd-integration/references/migration-pattern.md`

All listed paths are relative to `modules/home/ai/plugins/`.
The PR-cycle skill SHALL route its warming step to the owner's CI-warming guidance and distinguish observed CI feedback from the ruleset-derived queue gate.
The repository overview SHALL describe Mergify queue retirement as coordinated with installation, retaining the existing queue during the pre-install interval.

Trust boundary: source and composed text can demonstrate the documented procedure and routing.
They cannot demonstrate risk judgment, review timing, native registration, availability of store outputs, queue implementation behavior, or compliance by any author.

#### Scenario: Risk and shape are independent

- **WHEN** the owner is inspected for CI-sufficient and review-required cases across ordinary PR and registered-stack shapes
- **THEN** review timing varies only by risk class and the enqueue method varies only by shape
- **AND** the text describes E1 as convention and does not infer authority from authorship or an approving-review rule

#### Scenario: Stack member has an auto-merge signal

- **WHEN** the documented pre-authorization procedure encounters auto-merge on any member, including a correctly labelled top or the bottom member
- **THEN** it forbids proceeding on that signal, requires its removal and queue-state inspection before authorization, and explains the auto-merge-first wrong-target failure
- **AND** it does not claim that adding a correct top label repairs an already queued entry

#### Scenario: Native registration is missing

- **WHEN** the documented stack publication procedure has command success or dependency headers but lacks native membership or selected-head ancestry evidence
- **THEN** it withholds the label and directs the author to resolve the missing evidence before authorization

#### Scenario: Laptop author warms CI

- **WHEN** the owner and the PR-cycle caller are inspected for the aarch64-darwin-to-x86_64-linux path
- **THEN** the owner contains the exact logged warming command and positional-argument explanation and the caller resolves to it
- **AND** neither claims that a native `auto on` run is required to warm Linux CI

#### Scenario: Authorization has been signalled

- **WHEN** the documented procedure reaches its authorized state
- **THEN** it hands landing to the queue without requiring the author to wait
- **AND** it identifies a PR queue comment as the rejection feedback surface

#### Scenario: A caller retains an obsolete route

- **WHEN** source or composed-output review finds a listed caller still prescribing a Mergify server queue, real `stack-land`, or direct-trunk landing for a queue-managed repository
- **THEN** that caller fails routing verification even if it also contains a link to the new owner

<!--
Procedural note: the interactive `superpowers:writing-plans` skill was unavailable to this subagent and was not invoked.
The supervisor explicitly authorized manual artifact creation from the ADR and brief, following the recorded brainstorming precedent.
This plan decomposes tasks.md directly; no delegated skill invocation is claimed.
-->

# Queue landing protocol implementation plan

For agentic workers: implement only assigned source edits and return evidence; the orchestrator owns delegation and every history operation.
The authoritative checkbox ledger is `tasks.md`; the steps here are its execution detail, not a second completion ledger.

Goal: deliver the queue-authorization procedure before installation, then retire competing landing paths in the coordinated window.

Architecture: one first-party policy owner feeds ten callers while upstream Mergify mechanics remain unchanged.
Nix rebuilds establish delivered bytes; isolated CLI tests establish the assertion tool's observable effects.
The operator coordinates App installation in the sibling service change.

Tech stack: Markdown instruction and skill sources, apm/Nix composition, Bash CLI tests, YAML configuration, OpenSpec, read-only GitHub evidence.

Read `design.md` D1–D7 and all four `specs/*/spec.md` files before implementation.
The full behavioral content is specified in `specs/skill-corpus-interface/spec.md` §Queue authorization has one documented owner; callers link to that owner instead of copying its recipe.

## Verification commands and evidence layout

During apply, retain a content matrix keyed by tasks 2.1–2.11, a source/delivered-path matrix, the ADR audit, isolated tool-test output, and the cutover record in this change's evidence directory or approved ignored logs.
Create no evidence that claims an unrun build or activation.
Existing source files are tracked; any new test fixture needs orchestrator registration before a flake build can see it.
All commands below are planned apply commands, not evidence that this planning run executed them.

Build the corpus after each edit group, then compare each revised skill/reference file with its two composed counterparts:

```sh
COMPOSE=$(nix build .#apm-skills-compose --no-link --print-out-paths)
verify_skill() {
  source=$1
  relative=$2
  for target in .claude .agents; do
    test -f "$COMPOSE/$target/skills/$relative" || return
    cmp "$source" "$COMPOSE/$target/skills/$relative" || return
  done
}
```

If composition intentionally transforms a file, record the transformation and inspect the relevant section instead of silently discarding a failed byte comparison.
Do not use the installed `~/.claude/skills` output until the delivery gate.
A content search locates possible contradictions; read the surrounding section to distinguish diagnostic or historical mentions from operative commands.

```sh
rg --no-line-number 'stack-land|Mergify|mergify|author-approved|fast-forward|auto-merge' "$source"
nix eval --raw .#darwinConfigurations.stibnite.config.home-manager.users.crs58.programs.agents-md.settings.body
nix build .#checks.aarch64-darwin.structure-mergify-release-alignment \
  .#checks.aarch64-darwin.structure-mergify-release-alignment-neg --no-link
```

## Task 1.1: Verify the source inventory

1. Expand each exact group-2 source path below with `test -f`; inspect `.github/mergify.yml` and the three existing tool files.
2. Read `modules/home/ai/README.md` and `modules/home/ai/plugins/README.md` for ownership and delivery constraints.
3. Confirm `mergify-stack` is absent from the first-party source tree and present as the existing upstream dependency.
4. Return the inventory to the orchestrator; checkpoint message: `docs(landing): record source inventory and scope` if it is retained as tracked evidence.

## Task 1.2: Repeat the ADR-cross-impact audit

1. Enumerate numbered ADRs and index files separately with Python `Path.glob('[0-9][0-9][0-9][0-9]-*.md')` and `Path.glob('index.md')` in `packages/docs/src/content/docs/development/architecture/adrs/`.
2. Run `rg -i --no-line-number 'mergify|buildbot|queue|landing' packages/docs/src/content/docs/development/architecture/adrs/`; exit 1 means no matches, while an I/O error does not.
3. Inspect matched decision/consequence sections, plus `0012-github-actions-pipeline.md` §Decision and `0016-per-job-content-addressed-caching.md` §Decision.
4. Write `openspec/changes/adopt-queue-landing-protocol/adr-cross-impact.md` with count, criteria, and hits; a new conflicting commitment triggers an operator decision and explicit supersession proposal.
5. Orchestrator checkpoint: `docs(landing): audit formal ADR cross-impact`.

## Task 1.3: Capture the red content baseline

1. Convert the owner and override requirements into rows for risk/shape, E1 boundary, registration, ancestry, every-member auto-merge prohibition, poller precedence, warming, async handoff, and transition hold.
2. Add one row per caller that fails if an old operative route remains even when an owner pointer exists.
3. Record current failures and the exact PR 2738/2739/2740 evidence sentence from the source owner.
4. Orchestrator checkpoint the verification baseline with the first affected document; no claim of completed delivery yet.

## Task 2.1: Implement the owner

File: `modules/home/ai/plugins/version-control-and-forge/.apm/skills/git-stacked-pr-integration/SKILL.md`.

1. Read its description, role contracts, map, checked-landing section, VCS routing, and protected evidence sentence.
2. Replace the real handler contract with `Queue authorization` and the first-party override section specified by the two deltas; extend the description for ordinary-PR authorization.
3. Run the content matrix against the source, including an exact-string check for the logged Linux warming command and all four poller symbols.
4. Rebuild and run `verify_skill "$source" git-stacked-pr-integration/SKILL.md`; inspect the owner and overrides in both targets.
5. Orchestrator commit point: `docs(landing): define queue authorization and Mergify overrides`.

## Task 2.2: Repoint the fleet instruction fragment

File: `modules/home/ai/plugins/agent-context-vcs/.apm/instructions/030-stacked-landing-protocol.instructions.md`.

1. Replace the final landing verb and real-handler route with an owner pointer and queue handoff.
2. Keep the worker ref-return paragraph, local jj rules, shared identity, and context-tier qualification intact.
3. Evaluate `programs.agents-md.settings.body` with the command above and inspect `Stacked landing protocol`; full root composition is checked in task 3.2.
4. Orchestrator commit point: `docs(agents): route stacked delivery to queue authorization`.

## Task 2.3: Repoint the flake PR cycle

File: `modules/home/ai/plugins/nix-build-operations/.apm/skills/nix-flake-pr-cycle/SKILL.md`.

1. Read description, overview, local validation, CI monitor, terminal phase, and guardrails as one procedure.
2. Replace the terminal Mergify/author-approved route, connect warming to the owner, and separate CI feedback monitoring from forge-derived required gates.
3. Confirm targeted local feedback remains, with no mandatory synchronous post-authorization wait or legacy buildbot gate for this queue.
4. Rebuild and run `verify_skill "$source" nix-flake-pr-cycle/SKILL.md`; verify description length stays within 1024 characters.
5. Orchestrator commit point: `docs(nix): hand validated PRs to queue authorization`.

## Task 2.4: Repoint the VCS preference entry point

File: `modules/home/ai/plugins/preferences-code-and-collaboration-conventions/.apm/skills/preferences-git-version-control/SKILL.md`.

1. Locate VCS detection and the external publication/landing route.
2. Add the owner-section pointer without changing mode detection or local commit handling.
3. Rebuild and run `verify_skill "$source" preferences-git-version-control/SKILL.md`; confirm modes share the external protocol.
4. Orchestrator commit point: `docs(vcs): separate local mode from queue authorization`.

## Task 2.5: Preserve the jj preference handoff

File: `modules/home/ai/plugins/preferences-code-and-collaboration-conventions/.apm/skills/preferences-git-version-control/03-jj-mode.md`.

1. Read shared working-copy and worktree handoff paragraphs before changing their external route.
2. Add the authorization owner pointer; leave return-by-ref and restricted local operations unchanged.
3. Rebuild and run `verify_skill "$source" preferences-git-version-control/03-jj-mode.md`; inspect for an unintended direct-trunk exception.
4. Orchestrator commit point: `docs(jj): route verified refs to queue policy`.

## Task 2.6: Repoint the jj skill's external submission phase

File: `modules/home/ai/plugins/version-control-and-forge/.apm/skills/jj-version-control/SKILL.md`.

1. Locate stacked submission, the Stack-Aware Base footnote, and `Worktree interop`.
2. Route queue-managed GitHub external submission to the owner while preserving local development-join and return-by-ref mechanics.
3. Read every remaining aggregate-PR/Mergify reference and scope generic other-forge recipes explicitly away from this queue.
4. Rebuild and run `verify_skill "$source" jj-version-control/SKILL.md`; review local safety paragraphs for unintended changes.
5. Orchestrator commit point: `docs(jj): replace external landing handoff`.

## Task 2.7: Repoint diamond workflow integration

File: `modules/home/ai/plugins/version-control-and-forge/.apm/skills/jj-version-control/diamond-workflow.md`.

1. Read Phase 4 and the Stack-Aware Base footnote together with local linearization steps.
2. Replace the buildbot-to-Mergify terminal route for queue-managed repositories, preserving chain and returned-ref mechanics.
3. Rebuild and run `verify_skill "$source" jj-version-control/diamond-workflow.md`; verify no operative N+1 aggregate route bypasses the owner.
4. Orchestrator commit point: `docs(jj): hand diamond delivery to queue authorization`.

## Task 2.8: Separate ceremony from landing authorization

File: `modules/home/ai/plugins/version-control-and-forge/.apm/skills/jj-version-control/tiered-ceremony.md`.

1. Inspect tier 1 direct-trunk and tier 2 manual/Mergify merge advice.
2. Keep local tier mechanics but route all external landings for queue-managed repositories to the owner.
3. Rebuild and run `verify_skill "$source" jj-version-control/tiered-ceremony.md`; verify local ceremony does not redefine risk or shape.
4. Orchestrator commit point: `docs(jj): remove ceremony-based landing exceptions`.

## Task 2.9: Correct the repository overview

File: `modules/home/ai/plugins/agent-context-vanixiets/.apm/instructions/10-repository-overview.instructions.md`.

1. Locate the human-fast-forward/bot-rebase Mergify account and current check-set description.
2. Replace its queue account with the policy owner and installation-window qualification without claiming present repository management.
3. Run source review now and default/full root generation in task 3.2; both outputs must retain the repository route.
4. Orchestrator commit point: `docs(agents): describe the staged repository queue transition`.

## Task 2.10: Scope buildbot's legacy gating example

File: `modules/home/ai/plugins/preferences-nix-and-secrets/.apm/skills/preferences-nix-ci-cd-integration/references/buildbot-nix-configuration.md`.

1. Read `Mergify gating` and its surrounding generic configuration.
2. Mark the legacy gate example's applicability and route this protocol to the owner without changing generic buildbot configuration.
3. Rebuild and run `verify_skill "$source" preferences-nix-ci-cd-integration/references/buildbot-nix-configuration.md`; ensure an author cannot read the example as current queue policy.
4. Orchestrator commit point: `docs(ci): scope legacy buildbot gating guidance`.

## Task 2.11: Scope the migration pattern's legacy queue

File: `modules/home/ai/plugins/preferences-nix-and-secrets/.apm/skills/preferences-nix-ci-cd-integration/references/migration-pattern.md`.

1. Read the phase summary and Mergify example for duplicated gate claims.
2. Route adopted queue authorization to the owner and retain unrelated migration history with explicit legacy scope.
3. Rebuild and run `verify_skill "$source" preferences-nix-ci-cd-integration/references/migration-pattern.md`; review both summary and example, not only the added link.
4. Orchestrator commit point: `docs(ci): separate migration history from queue authorization`.

## Task 3.1: Verify the full composed corpus

1. Rebuild `apm-skills-compose` and run all nine skill/reference comparisons and content rows on both targets.
2. Build `agent-plugins-mergify-cli` and compare its `skills/mergify-stack/SKILL.md` with both delivered upstream files.
3. Run the positive and negative release-alignment checks; record store paths and exact results.
4. Orchestrator evidence checkpoint: `test(landing): verify composed policy and upstream provenance`.

## Task 3.2: Verify generated context

1. Evaluate the stibnite user-context body using the named command; ensure the new fleet fragment is selected by `modules/home/tools/agents-md.nix::fragments`.
2. In an orchestrator-prepared disposable repository copy with the changed source, run `just agents-context` and inspect generated `AGENTS.md` for the repository route and absence of duplicate fleet paragraphs.
3. In another disposable copy, run `just agents-context-full` and inspect the fleet and repository routes together; these commands generate outputs, so do not run them in the shared planning worktree.
4. Orchestrator evidence checkpoint: `test(agents): verify default and full queue-policy context`.

## Task 3.3: Land the instruction group before installation

1. Review all group-2 source and group-3 delivery evidence together.
2. Parse the current Mergify YAML and confirm both `default` and `bot-updates` queues and queue actions remain.
3. The orchestrator lands this instruction group while the old queue remains the working path; workers run no VCS writes.
4. Record the pre-install revision and keep the sibling App-installation gate pending.

## Task 3.4: Confirm actual harness delivery

1. Build `nix build .#darwinConfigurations.stibnite.config.system.build.toplevel --no-link`; retain output rather than activating automatically.
2. Request operator-approved activation through the established workflow; inspect delivered user context and the Claude owner symlink after activation.
3. For any repository-local `.agents/` consumer used at cutover, have the orchestrator generate post-main relock/materialization through its existing producer path and inspect bytes separately.
4. Record stale or unactivated consumers as a hold; orchestrator evidence checkpoint marks pre-install readiness only when actual consumers carry the new text.

## Task 4.1: Add red CLI effect tests

Files: `pkgs/by-name/stack-land/test-stack-land.sh` and its existing isolated fixture structure.

1. Add a legacy operational invocation case expecting nonzero assertion-only rejection and an empty git/gh operation trace.
2. Add explicit dry-run cases that permit target fetch/read operations but fail on push, forge merge, API writes, or merged-state polling.
3. Record remote target before and after each case; retain missing/duplicate/malformed trailers, ancestry failures, and check-state cases including empty and pending sets.
4. Run the focused harness against the old subject in a disposable test environment and record the expected failures; never point fixture remotes at production.
5. Orchestrator checkpoints red evidence; keep the intentionally failing test change paired with the production fix before landing.

## Task 4.2: Remove the real effect

File: `pkgs/by-name/stack-land/stack-land.sh`.

1. Keep help available; after argument parsing, reject operational calls without `--dry-run` before git or GitHub operations.
2. Delete the real push and post-push merged-state loop; retain the existing pre-push diagnostics as standalone assertions and update help.
3. Run `bash -n pkgs/by-name/stack-land/stack-land.sh` and `shellcheck pkgs/by-name/stack-land/stack-land.sh`.
4. Re-run the focused harness until every task-4.1 case passes; retain the absence-of-write trace evidence.
5. Orchestrator commit point for the tested pair: `refactor(stack-land): retain assertions without remote landing`.

## Task 4.3: Preserve package delivery and tests

File: `pkgs/by-name/stack-land/package.nix`.

1. Update `meta.description` to assertion-only language without renaming the package or deleting its installation wiring.
2. Run `nix eval --raw .#packages.aarch64-darwin.stack-land.meta.description`.
3. Run `nix build .#stack-land .#packages.aarch64-darwin.stack-land.tests.integration --no-link`; this executes the complete existing package-test seam with the revised subject.
4. Orchestrator commit point: `chore(stack-land): describe assertion-only package`.

## Task 4.4: Verify the package and caller boundary

1. Inspect packaged help and complete integration-test output after the final source update.
2. Re-run the per-caller content matrix: diagnostics may be mentioned only as optional checks, never as authorization or the terminal landing operation.
3. Confirm existing home-manager wiring is unchanged and the installed command, once delivered, cannot use a real mode.
4. Orchestrator evidence checkpoint: `test(stack-land): record assertion-only delivery boundary`.

## Task 5.1: Obtain the installation-window gate

1. Present `.github/mergify.yml`'s exact semantic before/after with surviving rules identified.
2. Attach group-3 actual delivery evidence and link the sibling service change's App-installation gate.
3. Ask the operator to approve the common window; stop without editing queue configuration if approval or readiness evidence is absent.
4. Orchestrator checkpoint the cutover record; this task performs no App, ruleset, or deployment writes.

## Task 5.2: Remove only Mergify queue behavior

File: `.github/mergify.yml`.

1. In the approved window, remove the two named queue actions, two queue definitions, unused `merge_queue` block, and unreferenced queue-only anchors.
2. Preserve the complete assignment and owner-auto-approval rules.
3. Verify parsed semantics with the following checks; compare preserved rule bodies with the pre-cutover snapshot.

```sh
yq -e '(has("queue_rules") | not) and (has("merge_queue") | not)' .github/mergify.yml
yq -e '[.pull_request_rules[].actions | has("queue")] | any | not' .github/mergify.yml
yq -r '.pull_request_rules[].name' .github/mergify.yml
```

4. Orchestrator commit point, held for that window: `chore(landing): retire Mergify server queues at App cutover`.

## Task 5.3: Record the coordinated cutover

1. The orchestrator coordinates landing of task 5.2 with the sibling's operator-owned installation.
2. Record the removal revision and time, installation evidence, and sibling read-only readiness confirmation for the managed repository and both rulesets.
3. Keep author authorization held if readiness is missing; do not compensate with a direct push or real `stack-land`.
4. Orchestrator checkpoint: `docs(landing): record coordinated queue readiness`.

## Task 6.1: Run the complete affected suite once at the end

1. Run strict OpenSpec validation and every group-2 content/source/output row against the final source revision.
2. Re-run composition, release-alignment positive/negative checks, user-context evaluation, both disposable root-context generations, the complete stack-land integration suite, and YAML checks.
3. Record exact successes and failures; no broad typecheck is applicable to the Markdown-only planning artifacts, while Bash syntax/ShellCheck and Nix evaluation/build cover the implementation seam.
4. Orchestrator evidence checkpoint after green results: `test(landing): verify integrated authorization surfaces`.

## Task 6.2: Review standards and specification separately

1. Review source ownership, one-owner routing, description lengths, sentence-per-line prose, and path-plus-symbol citations.
2. Map each delta requirement to fresh evidence and each old landing route to a negative check; preserve canonical scenario names during delta replacement.
3. Write the apply-phase verification artifact without treating structural validation as vocabulary or entailment validation; §8 remains non-blocking agent review.
4. Record that this change has no local world-assumptions delta, identify the canonical designation table and sibling A22–A28 context, and report any undischarged dependency.
5. Orchestrator review checkpoint contains separate standards and spec outcomes rather than a claim that the plan itself proves runtime behavior.

## Task 6.3: Audit E1 samples after cutover

1. Collect available read-only authorization evidence for ordinary PR and registered-stack shapes in both risk classes.
2. Compare recorded reviews and authorization timestamps where review is required; for stacks retain native membership, selected-head ancestry, and all-member auto-merge absence evidence.
3. Record queue rejection comments and asynchronous handoff; do not create live signals just to fill the sample matrix and do not require authors to wait.
4. Report unsampled cells as unverified follow-ups; this audit evaluates convention adherence and does not establish queue-enforced review.
5. Orchestrator evidence checkpoint: `docs(landing): record initial authorization audit`.

## Task 6.4: Final scope and rollback check

1. Compare the implementation path list with the exact files in this plan and identify foreign edits separately.
2. Verify upstream skill bytes, service configuration, source-filter implementation, and local jj return-by-ref mechanics were not changed by this work.
3. Confirm the cutover record requires an operator-coordinated queue rollback; never restore real `stack-land` as recovery.
4. Orchestrator performs final history operations only after reviewing all evidence; workers return their assigned changes without commits or pushes.

## Stop conditions and ordering

Tasks 1–3 complete and their instruction/skill revisions land before App installation.
Task 4 demotes the diagnostic tool without depending on live queue signals.
Tasks 5.1–5.3 are the installation-window group and cannot be folded into the pre-install instruction release.
Task 6's static checks can run before installation, but live sample and cutover acceptance remains pending until operator evidence exists.
Any unexpected missing path, ambiguous risk policy, conflicting ADR, stale delivered corpus, or failed App readiness condition returns to the operator as a question.

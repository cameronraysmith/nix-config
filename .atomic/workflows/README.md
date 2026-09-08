# Atomic workflows

Only top-level TypeScript files are discovered by Atomic's `/workflow <name>` command.
Helpers live in subdirectories; `runs/` is git-ignored and holds observations and stage artifacts.

## Bump derivation

`bump-derivation.ts` generalizes package bumps under `pkgs/by-name/<package>/` without letting a model invent hashes or declare its own work verified.
Inputs are required `package`, optional `target_version` (latest when omitted), `plan_only` (false), `max_repair_attempts` (2), and `build_timeout_minutes` (45).
In this jj repository, `splice_after` is required and identifies the change after which delivery changes are inserted.
The workflow never moves `@`, pushes, changes bookmarks, activates a system, or runs the whole flake check surface.
Do not run the workflow or package builds as part of slice A authoring; execution belongs to slice B.

`plan_only=true` resolves the release, maps and validates the derivation, writes the plan and observations, and returns before `run-updater`.
It makes no tracked-file edits and cannot reach landing.
Ignored artifacts under `.atomic/workflows/runs/bump-derivation/<package>/` are permitted even in plan-only mode.

## An assertion must be derived from a tool observation

**An output that asserts something happened must be derived from a tool node's observation of the world.**
The original Atomic-only workflow once reported `landed: true` while its land stage had explicitly created nothing.
A hardcoded success literal could not disagree with reality.

`Witness<T>` is branded, and `witness()` constructs it only from a tool outcome and a projection of its observation.
`completedRun()` requires both `landed: Witness<boolean>` and `changes: Witness<string[]>`; callers cannot substitute a boolean or a list of guessed identifiers.
The external outputs contain the witnessed boolean and list, preserving the original result fields while adding `package`, `changes`, `skill_deps_verified`, and `self_maintained_repaired`.
Blocked exits and deliberate plan-only or operator-declined exits assert no positive landing claim and carry `landed: false` and `changes: []`.
A tool witness is evidence of what that tool checked, not an end-to-end guarantee that the specification matched intent.

## The three ADTs

`bump/types.ts` declares TypeBox schemas and derives their TypeScript types.
Unrecognized structured constructors fail validation rather than falling through to a permissive default.
Every constructor switch has an exhaustive `never` default that blocks.

- `ReleaseSource`: `GitHubRelease { owner, repo, tagPrefix }` or `Npm { name }`.
- `Updater`: `PassthruScript { storePathOrRepoPath, acceptsVersionArg }`, `NixUpdate { flakeAttr }`, or `Manual`.
  Manual updating is blocked; a model never substitutes hand-written hashes.
  Latest-only scripts accept an omitted target or an explicitly latest target, but block a specific non-latest version.
  Explicit release lookup does not depend on latest metadata; only a discovered latest-only script triggers the additional latest check.
- `SkillDep`: `Vendored { deliveryExpr, upstreamSubtree, pinKind }` or `SelfMaintained { skillPath, dependsOn, citedClaims }`.
  `pinKind` distinguishes `SrcCarried`, `ApmGitDep`, and `NpmBundled`; `ApmGitDep` blocks as unsupported in slice C.
  Self-maintained dependencies name either the package or a vendored skill and cite claims with file, lines, text, and prior verification provenance.

The registry in `bump/packages.ts` contains `atomic` and `linear-cli` skill dependencies and their static release sources, not updater guesses.
Recon discovers the updater from the derivation and verifies registry facts against the tree.
Unknown packages use deterministic, read-only release-source discovery and recon; anything unclassifiable blocks.
Atomic's npm distribution carries its builtin skill trees under `dist/builtin`.
Linear's source carries `skills/linear-cli`, delivered through `${pkgs.linear-cli.src}/skills` in the user's home module.
Its local linear-project-management and openspec-linear-sync skills are self-maintained, not vendored.

## Stages and evidence

1. `resolve-release` observes the requested release or resolves latest from the classified source.
2. `map-derivation` returns a schema-backed manifest and a prose artifact.
   Validation covers the whole manifest: pins, release source, updater, skill dependencies and build attributes.
   Every pin records whether it must change.
   Version-keyed source and release-binary hashes must change; dependency-closure FOD hashes may remain identical only when their pin names a `witnessAttr` whose build realizes that FOD.
   Each such attribute must appear in `gateAttrs.attrs`, including cross-system attributes when required; missing witnesses block validation.
   Pin observations follow the named source binding, including nested Nix attribute paths such as `src.hash` and `binaries.aarch64-darwin.hash`, and JSON manifest properties such as `version`.
   Comments and other fields are not pin evidence; ambiguous or computed bindings block as unclassifiable rather than falling back to file-wide matching.
   Pin gates return each observed literal and its expected baseline predicate (`changed` or `build-witnessed`), with the named build attribute for closure hashes; the baseline is not an independently expected new hash.
3. `run-updater` runs the classified updater with the resolved target and checks the pin and derivation-path diff boundaries.
4. `build` runs exactly the enumerated attributes with bounded, uniquely named repair stages only after failed builds.
   The gate owns build execution and exit-code observations; a repair report is not a build witness.
5. `verify-vendored-delivery` compares a built source or package subtree with upstream at the release tag or npm tarball.
   Git archives read local upstream tags without checking out or modifying the upstream repository.
   Vendored content is never repaired locally.
   Each successful comparison records the upstream subtree, delivered path, compared file count and `identical: true`.
6. `revalidate-self-maintained` plans read-only help/source/skill probes for every claim, executes them through tools, and then re-attests or minimally repairs prose and documented checks within the union of self-maintained skill directories.
   Source probes read the built package's `.src` store path; exact-quote validation reads claim-indexed observation artifacts rather than raw text in checkpoints.
   Contradictions receive evidence-backed fail-closed repairs, including example checks that miss accepted upstream forms; claims without a supported repair block.
   Validated old/new claim pairs are written to `registry-updates.json` for subsequent registry catch-up, without expanding the bump's tracked edit scope.
7. `review` uses a fresh maximum-reasoning context to falsify the bump against diffs and named tool evidence, not the worker's report.
   The read-only reviewer has no shell: it uses compact receipts and targeted artifact excerpts, and reports insufficient evidence as a workflow finding rather than reconstructing it or asking the controller.
   Unapproved or malformed review results block landing.
8. `land` requires operator confirmation, captures topology, then creates one derivation change and, when prose changed, a second skill change.
   The commands are `jj new --no-edit -A <splice_after>` followed, for change2, by `jj new --no-edit -A <change1>`.
   Each receives only its own paths with `jj squash --from @ --into <change> --use-destination-message --keep-emptied -- <paths>`.
   Verification requires exactly the ordered new chain, allowed path sets, unchanged `@`, preserved former children below the last new change, and no allowed paths left in `@`.
   Unrelated leftovers are reported, never squashed.

Every model stage writes the model and reasoning level actually observed in stage-result metadata to the package ledger, including fallback attempts.
Missing actual-model metadata blocks instead of being replaced with requested model pins.
Role constraints, prohibitions, and identifiers are protected with `<keepContext>`; bulk evidence is passed through files and `reads`.
Process callbacks use finite deadlines and forward the tool cancellation signal.
Repairs are bounded forward-only iterations with distinct node names.

## Limits and operating assumptions

Recon's well-formed attribute list can still be incomplete; independent review must challenge its coverage.
Topology checks compare observations, not locks; another writer changing the splice segment can make verification block.
The workflow preserves unrelated working-copy paths rather than treating them as part of the bump.
Scope snapshots include Git-relevant executable/file modes and symlink targets as well as file bytes; unchanged foreign paths remain outside the delta.
A blocked run can leave a partially updated working copy; it reports the evidence and never claims a verified land.
Local upstream repositories and the requested tags must already be available for GitHub subtree comparisons; source probes use the built `.src` store path.

The build gate intentionally runs `nix build` directly rather than `just build` or `just check-fast`.
Those recipes cover a wider check surface and do not forward the selected attributes and log format needed by this bounded package loop.
The direct gate is the narrow repeated check; repository-wide checks remain the human pre-PR lane.
Process output is written to package-local `.log` files with companion `.log.stream.jsonl` channel-labelled chunks for live inspection.
Each tool checkpoint separates its process receipts from domain evidence; receipts contain `command`, `exitCode`, `state`, `terminationSignal`, `logPath` and a `tail` bounded to 60 lines and 8 KB, never raw `stdout`/`stderr` fields.
Checkpoint strings over 8 KB block; source/help observations and pin baseline files are referenced by artifact path instead of embedded.
Cancellation or deadline interruption terminates the process group, drains its pipes, persists partial logs and a compact interruption receipt, then rethrows the process error rather than reporting success.

The graph is visible in the entry file from release resolution through landing.
Its realized shape depends on plan-only mode, bounded repairs, skill dependencies, review and human confirmation; a static diagram would describe only one possible run.

## deploy-omnigent

`deploy-omnigent.ts` runs S0–S3 as create/reuse → implement → scope → land → gate-sandbox → diff → review; repairs repeat scope/land/gates/review into the same change within `max_repair_attempts`.
Landing uses only attributed paths with `jj squash --from @ --into <change> --use-destination-message --keep-emptied -- <paths>`, checks topology, advances the bookmark, and resolves the exported commit SHA.
An empty attribution skips squash only when the change already has allowed content; ownership baselines, preexisting-path protection, and foreign-path human decisions remain enforced.
Each gate batch creates a detached temporary Git worktree at that SHA and removes it in `finally`, including after failure or cancellation; no jj workspace is created.
GrepAssert and Command gates run there; every Nix gate, including S2's extendModules fixture and remote builds, uses `git+file://<absolute-repo>?ref=<chain_name>&rev=<sha>` through the shared deployment-source helper.
The Linear readback script runs from its absolute primary-repository path with the worktree root as its argument; it requires Python/PyYAML and stored Linear workspace credentials, ignoring inherited `LINEAR_API_KEY`.
Reviews receive only the slice contract, SHA-bearing gate receipts, and `jj --ignore-working-copy diff -r <change>`; SHA observations before/after review and before repair landing block changes to the reviewed commit, not unrelated working-copy edits.
An unchanged repair after `changes_requested` reruns all gates once and blocks if review or gates still fail; these observations are not locks against concurrent same-path edits.
Every stage requests `openai-codex/gpt-6-astra`: high for implementation/repair/tracking, max for review, and medium for reporting, with no explicit fallbacks; actual model/thinking assertions block missing or off-policy metadata after the call.
Required `splice_after` names the seed parent; other inputs are `chain_name` (`omnigent-magnetite`), `start_at_slice` (0), `verified_changes` ([]), `max_repair_attempts` (2), `build_timeout_minutes` (60), `deploy` (true), and `linear_team` (`CAM`).
Resume validates bookmark/topology/path sets and runs preceding slices' gates in sandboxes at their own SHAs before marking them verified.
S0 recovery accepts only seed → join or seed → allowed-path (possibly empty) S0 → join with empty `verified_changes`, records `reused_change`, and skips tracking only when the proposal is observed in `@`; other interrupted shapes fail closed.
Secret generation touches only the two Omnigent generator directories, squashes into S3, and rechecks topology before resolving the deployment tip SHA.
Deployment requires the exported bookmark to equal that SHA (one export retry) and uses the same committed-source URL helper, never `@`.
Pinned `terraform.config` and argument-forwarding `terraform.terraform` use shared `terraform/` state and configured encryption; the default Terraform app does not forward arguments.
The saved DNS plan must contain exactly one create of `cloudflare_dns_record` named `omni.scientistexperience.net`; confirmation shows its summary and apply verifies its hash.
Plan/JSON files are mode 600 under the evidence root and may contain secrets; receipts retain only the summary and hash.
`clan machines update magnetite --flake "$SOURCE"` records URL/SHA and requires different before/after `/run/current-system` paths; server probes precede the operator wizard and POSIX runner-settings probes follow it.
Checklist responses remain verbatim human attestations: `failed` blocks, `not tested` leaves acceptance incomplete, and all-passed yields `human_attested`, never independently verified acceptance.
Evidence lives under `.atomic/workflows/runs/deploy-omnigent/<chain_name>/<run-key>/`; stop-for-replan preserves verified changes, landed-but-unverified slice content, and any unlanded edits.
Run `node .atomic/workflows/omnigent/check.mjs` for strict typing, negative fixtures, mocked execution, ShellCheck, and Nix parsing without evaluation, builds, deployment, or jj mutations.
The controlling session owns registry reload and launch; live replay, worktree execution, activation, authentication, and ACP acceptance remain untested by these checks.

## stand-up-gitea-mq (draft; do not launch)

`stand-up-gitea-mq.ts` authors the CAM-56 graph: preflight → proposed Nix patches/controller validation/evaluation/fresh review/routing → G1 App and credential witnesses → dedicated App-id/vars route → DNS source route/saved plan/apply/dig/ledger route → G2 approved ruleset PUT/readback → optional pinned deployment → V2/V3/V6/V9 observations and scratch rollback evaluation → documentation → witnessed verify.md → terminal roborev.
Linear T2/T3 tools are best-effort, retain separate command outcomes, post comments via `--body-file <artifact> --workspace cameronraysmith`, and route proposal frontmatter updates with the relevant changes.
Atomic 0.9.18's public `WorkflowRunContext` has no model-catalog port, although `RunOpts` does; absent catalog metadata does not block preflight, by explicit operator decision.
The host can implicitly fall back to its controller model before the workflow can inspect the attempt; this risk is accepted, not prevented by an empty fallback list.
After every stage and before using its output, the workflow records actual model/thinking metadata and rejects off-policy attempts or missing metadata with a blocked exit.
The latest author report, `logs/adr-verify/workflow-author-report-4.md`, records closure evidence and remaining launch limitations; report 3's prior limitations remain unless explicitly superseded.

Inputs are `change` (constant `stand-up-gitea-mq-on-magnetite`), required `splice_after` (current `rollup-landing` tip change id), `deploy` (true), `max_repair_attempts` (3; range 1–3), `build_timeout_minutes` (45), and optional `app_slug_hint`.
There is no `start_at`; Atomic resume is the only re-entry mechanism, and a fresh run requires empty `@` and no preexisting aspect.
Completed tool/prompt nodes replay; tool outcomes are normalized before ledger insertion and hashing to exclude Atomic's replay-only `cached` flag.
Interruption inside an unfinished external effect still requires reconciliation before retrying it, not an assumption of exactly-once effects.
Each gate uses forward-only attempt ids with the exact batch tuple `[1, 2]` and `attemptsFor(1 | 2 | 3)` bounded tuples; G3 authorizes exactly one additional bounded batch, and second exhaustion blocks.
Every workflow-owned process/network effect belongs to a finite `ctx.tool` callback forwarding its cancellation signal.
Run evidence lives outside the repository, under `$XDG_STATE_HOME/atomic/gitea-mq/run-*` (default `~/.local/state/atomic/gitea-mq/run-*`); in-tree evidence roots are rejected.
Build, deployment and Terraform commands stream to disk with only an 8 KiB diagnostic tail in memory; parsed command responses fail beyond 1 MiB, and parsed artifact reads are bounded too.

All model stages request only `openai-codex/gpt-6-astra`: high for implement/repair/replan/diagnose, medium for render/docs/verify-writer, and max for reviewers.
When a catalog port is available, missing required levels blocks; otherwise native stage resolution is used, with the accepted implicit-fallback risk and mandatory post-call rejection above.
Role constraints, paths, failed gate/receipt identifiers, review acceptance criteria and ruleset requirements are protected with `<keepContext>`; structured stage outputs use TypeBox schemas and exhaustive constructor switches.
Diagnosis/replan artifacts travel through stage `reads`, not inline JSON; an S1 rejection receipt retains findings, reviewer artifact and diff path.
Completion requires four branded tool witnesses for implemented changes, deployment, validation results, and report writing; blocked/declined exits expose no positive technical claims.
Human gates are authorizations, not evidence that the technical checks passed.

The workflow never moves or describes `@`, pushes to main, deletes a ref without G5, applies the `merge-queue` label, runs `linear auth`, or ticks operator tasks 1.1/8.2.
All model stages are read-only and submit full-file proposals with exact before/after contents.
The controller validates the entire proposal's canonical allowlisted paths, absence of symlink traversal, before-content preconditions and operator/task-box invariants before applying any write; an invalid proposal applies nothing, including earlier valid edits.
Writers are restricted to their slice paths plus the change directory; build-service aspects remain untouched.
The post-G1 exception permits exactly `vars/per-machine/magnetite/gitea-mq-github-app-secret-key` and `vars/per-machine/magnetite/gitea-mq-github-webhook-secret`, plus shared vars/sops paths only if the imported Omnigent helper enumerates them (currently none).
Every process receives `CLAN_NO_COMMIT=1`, including nested Python/Terraform Clan calls; controlled generation/list/update commands and G1's operator `clan vars set` instructions also state it explicitly.
Installed Clan uses this environment variable, not a `--no-commit` option; it still registers paths with Git intent-to-add, but skips content staging and commits.
The post-effect topology/commit/path checks remain a backstop, not the primary prevention mechanism.
The App-id patch, generated envelopes, tasks.md and proposal.md route as one dedicated post-G1 change.
Secrets remain inside opaque subprocesses; the leak scan reports counts only across working files including ignored paths, HEAD and history with a positive hostname control.

G2 approves a saved JSON body and its hash, never a regenerated request.
Every V6 create attempt requires its own durable G5 authorization; a write-ahead create intent prevents an incomplete-node replay from creating twice under one authorization.
Readback/leased cleanup have a separate bounded retry loop with no create capability; interruption before a durable create result can still require operator reconciliation.
G1/G2/G4/G5 declines terminate the run via the declined path with no positive outputs; NotRun is reserved for genuinely unrunnable probes with reasons.
V6 records push acceptance/refusal separately from its falsified deletion-protection claim; V2 branch polling cannot exclude transient refs between observations.
`deploy=false` skips machine activation and live/ref validation, not the earlier G1, DNS or ruleset operations; it is not a dry run.
Run `node .atomic/workflows/gitea-mq/check.mjs` for strict typing, negative witness/batch/schema fixtures, pure contracts, local Nix parsing (never evaluation), Python parsing, in-memory graph execution, and mocked command boundaries.
The four required graph scenarios are success, G2 decline, two-batch G3 exhaustion, and completed-node replay; replay asserts zero repeated callbacks, model calls, or human prompts.
Additional tests cover no-op repairs, Nix invalidation/reactivation, repair-eval failure reaching G3, interrupted relock, DNS saved-plan intent reconciliation, classic protection before/after PUT, paginated/per-App installation checks, runtime table/ACME controls, and Linear readback/comment outcomes.
These are local authoring checks, not real Atomic persistence/recovery, topology mutation correctness, live credentials, deployment, or end-to-end acceptance.

Task 11.5 now uses the authorized C6 deterministic recomputation from live effective branch rules, classic `.contexts` and `.checks[].context`, and the running MainPID's non-secret fallback environment.
The evidence and report must call it a recomputation, not queue journal/dashboard output.
Task 8.4 uses owner-authenticated paginated installation/repository inventory, per-App installation checks for both Apps, and write-capable human collaborators; token restrictions can hide installations, so this is not an unrestricted-universe proof.
DNS uses one bounded plan/approval/apply/dig budget, with fresh confirmation after changed plans; replay validates intent content against the saved-plan identity and reconciles only a zero-change refresh without output changes.
DNS resolves the routed chain tip through Omnigent's `resolveSource`, which verifies the exported bookmark and returns `git+file://<repo>?ref=rollup-landing&rev=<commit-sha>`.
Never use `path:<cwd>`: path sources can ingest ignored secrets and prior plan evidence into the Nix store.
Hostname/repair source edits are therefore routed before planning; the later route carries the witnessed DNS task ledger.
All evidence and plan files remain outside the source tree, even though the committed Git source already excludes untracked/ignored files.
Rollback reconstructs the real flake module tree from `f.outPath`, replacing only the queue aspect via `lib.mkForce {}` and asserting that queue enablement disappears; it never copies the host module to `builtins.toFile`, so relative policy imports keep their original directory.
Any later scope-approved repair touching `modules/terranix/**` invalidates DNS receipts and re-enters that gate; this does not expand any writer's path allowlist.
`Repair(Noop)` re-probes without routing an empty change.
Changed tracked Nix invalidates deployment/validation receipts, routes actual pending paths, and reactivates and probes the pinned source before retrying validation; previously completed dependent validations become NotRun until witnessed again.
Gate/repair/Linear outcomes are tagged unions; the verify writer supplies exact task-to-receipt claims checked against the controller ledger, and the controller appends its authoritative ledger.
G1, rollback, docs, V2 and V6 observations have explicit receipts.
Each S1 task has named required observation arms; only completely observed tasks enter the passed ledger.
Credential-file bindings, ensureUsers ownership, App-id equality after G1, and landing environment now have explicit checks.
Tasks 2.1 (input/follows/lock delta), 3.1 (generator scripts/source owner), 4.2 (module-wide label assignment scan), 4.4 (header/lint), and 5.1 (import/aspect ordering) remain unverified where those arms are unobserved; implementation ticks are not verification.
Free-form report prose still requires roborev; structural claim binding cannot establish semantic truth by itself.
The following prior caveats remain explicitly out of scope: gap 2, same-path concurrent ownership/review-hash attribution during routing; gap 8, transient batch refs between V2 samples and stale candidate/head/label authorization across retries; gap 9, SSH transport identity equivalence to the gh identity and interrupted V6 cleanup recovery.
Authenticated webhook redelivery remains NotRun, table presence is not a direct latest-migration log witness, and interrupted Linear comments lack reconciliation.
Do not launch until the orchestrator reviews these boundaries and remaining gaps.

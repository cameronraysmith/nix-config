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

`deploy-omnigent.ts` runs S0–S4 as create/reuse → implement → scope → land → gate-sandbox → diff → review; repairs repeat scope/land/gates/review into the same change within `max_repair_attempts`.
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
S4 `declarative-config` derives one ACP agent definition in Nix for both config carriers: the server unit gets a read-only store `OMNIGENT_CONFIG_HOME`, and `programs.omnigent.settings` merges into the runner's runtime-written `~/.omnigent/config.yaml` through `modules/home/ai/omnigent/merge-config.sh` without clobbering `host.host_id`; its gates read the server file with yq-go, rehearse the merge over a fixture in a temp dir, and build the magnetite closure remotely.
Secret generation touches only the two Omnigent generator directories, squashes into S3, and rechecks topology before resolving the deployment tip SHA; the deploy phase is numbered 5 in `resume_at_slice`.
Deployment requires the exported bookmark to equal that SHA (one export retry) and uses the same committed-source URL helper, never `@`.
Pinned `terraform.config` and argument-forwarding `terraform.terraform` use shared `terraform/` state and configured encryption; the default Terraform app does not forward arguments.
The saved DNS plan must contain exactly one create of `cloudflare_dns_record` named `omni.scientistexperience.net`; confirmation shows its summary and apply verifies its hash.
Plan/JSON files are mode 600 under the evidence root and may contain secrets; receipts retain only the summary and hash.
`clan machines update magnetite --flake "$SOURCE"` records URL/SHA and requires different before/after `/run/current-system` paths; server probes precede the operator wizard and POSIX runner-settings probes follow it.
`probe-harness-catalog` reads only the agent `name`/`command` lines of the serving process's config file over SSH; `GET /v1/harnesses` needs a session JWT, so the `acp:atomic` dropdown row stays a human checklist item rather than a tool observation.
Checklist responses remain verbatim human attestations: `failed` blocks, `not tested` leaves acceptance incomplete, and all-passed yields `human_attested`, never independently verified acceptance.
Evidence lives under `.atomic/workflows/runs/deploy-omnigent/<chain_name>/<run-key>/`; stop-for-replan preserves verified changes, landed-but-unverified slice content, and any unlanded edits.
Run `node .atomic/workflows/omnigent/check.mjs` for strict typing, negative fixtures, mocked execution, ShellCheck, and Nix parsing without evaluation, builds, deployment, or jj mutations.
The controlling session owns registry reload and launch; live replay, worktree execution, activation, authentication, and ACP acceptance remain untested by these checks.
+++++++ osurqvnx 03cae280 "current wip" (rebased revision)
## stand-up-gitea-mq (draft; do not launch)

`stand-up-gitea-mq.ts` authors the CAM-56 graph: preflight → proposed Nix patches/controller validation/evaluation/fresh review/routing → G1 App and credential witnesses → dedicated App-id/vars route → quarantined DNS candidate/content-pin/saved plan/apply/dig/acceptance → G2 approved ruleset PUT/readback → optional pinned deployment → V2/V3/V6/V9 observations and scratch rollback evaluation → documentation → deterministic verify.md → terminal roborev.
Linear T2/T3 tools are best-effort, retain separate command outcomes, post comments via `--body-file <artifact> --workspace cameronraysmith`, and route proposal frontmatter updates with the relevant changes.
Atomic 0.9.18 supplies a model catalog at runtime, but the installed public `WorkflowRunContext` declaration omits `models` (`RunOpts` declares it as optional). A narrow `catalogPort` compatibility guard accepts an object with a `listModels` function without augmenting Atomic declarations. `listModels()` returns readonly entries with `provider`, `id`, `fullId`, and optional `model`, not thinking-level metadata. An unavailable catalog port does not block preflight, by explicit operator decision.
The host can implicitly fall back to its controller model before the workflow can inspect the attempt; this risk is accepted, not prevented by an empty fallback list.
After every stage and before using its output, the workflow records actual model/thinking metadata and rejects off-policy attempts or missing metadata with a blocked exit.
The latest author report, `logs/adr-verify/workflow-author-report-6.md`, records closure evidence and remaining launch limitations; prior limitations remain unless explicitly superseded.

Inputs are `change` (constant `stand-up-gitea-mq-on-magnetite`), required `splice_after` (current `rollup-landing` tip change id), `deploy` (true), `defer_installation` (false), `adopt_working_copy` (false), `adopt_routed_s1` (false), `max_repair_attempts` (3; range 1–3), `build_timeout_minutes` (45), and optional `app_slug_hint`.
There is no `start_at`; Atomic resume replays the existing run. By default, a fresh run requires no preexisting aspect or `@` changes within any workflow slice's allowed paths (including the change directory and both vars generator directories). Unrelated `@` paths are listed as `foreign` in preflight evidence and retained in full-tree stage baselines. Proposal application, post-review S1 stability, routing, and DNS plan/apply guards reject only drift within the current slice's allowed paths, the change directory, or either vars generator directory. Other paths (including other slices' exclusive paths) are recorded as sorted `foreignDrift` paths in each tool's evidence and do not block. Relocking similarly records foreign drift while pinning S1 inputs other than its intentional `flake.lock` output. Apply evidence also retains `tree` and an `effect` computed from the immediate pre-apply snapshot, so foreign drift is not mistaken for a repair. Routing still requires no allowed paths remain in `@`; the post-Clan check protects magnetite vars and the landing/join topology while recording unrelated changes as evidence.
For an interrupted run's S1 edits already in the shared working copy, an explicitly authorized **fresh** run may set `adopt_working_copy=true`. Preflight permits the existing aspect and pending workflow paths only within S1: `flake.nix`, `flake.lock`, `modules/nixos/gitea-mq.nix`, `modules/machines/nixos/magnetite/default.nix`, and `openspec/changes/stand-up-gitea-mq-on-magnetite/`. Pending DNS/docs/vars scope still blocks; unrelated edits remain foreign. All other preflight checks remain, including tip/join/sole-child topology and the human task baseline. Build-service lock baselines come from `@-`, not the adopted lock edits.
Preflight saves external `adopted-s1.json` with pending paths, SHA-256 values (`null` for deletion), mode/hash S1 baseline and path-filtered `jj diff -r @ --stat`. The `adopt-s1` tool observation rechecks scoped disk hashes, records `adopted: true` in the ledger, and replaces only the initial `implement` stage. A separate idempotent `adopt-s1-reset-tasks` tool clears stale S1 implementation ticks without ticking tasks or changing human rows: only subsequent `s1-ledger` gate observations earn ticks. S1 evaluation, fresh review, routing and downstream stages still run; adoption reviews receive an S1-filtered diff, and repairs still use proposals. Adoption is neither gate bypass nor a deployment dry run. Reconcile any interrupted effects before abandoning the old run; do not run both controllers concurrently.
For an S1 already **routed onto the chain** by a prior run, an explicitly authorized fresh run may instead set `adopt_routed_s1=true`. `adopt_working_copy` and `adopt_routed_s1` are mutually exclusive: passing both blocks with a clear message before any preflight observation. In routed mode preflight accepts the existing aspect on disk but then requires it to come from the chain: exactly one change described `feat(gitea-mq): s1` among `::rollup-landing & mutable()`, that change an ancestor of `rollup-landing`, `splice_after` still the chain tip with the join as its sole child (unchanged topology check), and, by content, the routed revision containing `modules/nixos/gitea-mq.nix`, `modules/machines/nixos/magnetite/default.nix`, `flake.nix` with the `gitea-mq` input declaration, and `flake.lock`, with each working-copy file's `git hash-object` equal to the routed blob and the routed change's single parent not containing the aspect. Preflight saves external `routed-s1.json` with the change id, commit id, parent commit, `git+file:…?ref=rollup-landing&rev=<commit>` source, per-path blob ids and aspect/flake SHA-256 values; the pre-S1 forge baseline is evaluated at that parent. Only pending change-directory paths are tolerated; any pending S1 implementation path blocks.
In routed mode the S1 implementation stage, S1 gate, S1 review and `route-s1` are all skipped. The distinct `adopt-routed-s1` tool re-verifies change/commit identity, ancestry and blob equality, then evaluates task 5.3's resource arms from the immutable routed source (failure is `NotRun`, not a block), and records the adoption as an `Unverified` ledger row that claims no task. Committed S1 ticks are left exactly as routed: nothing is re-ticked and no S1 reset runs. `s1-committed-forge-pre` then runs against that routed change and its parent exactly as it would have immediately after routing, and may tick 5.3. The run continues at G1 with `defer_installation` behaviour, and the App-id patch micro-stage is routed as its own change after `splice_after`, followed by S2, G2, S4, G6 and S5.
`forge-pre-unchanged` (task 5.3) is **deferred by design for both `adopt_working_copy=true` and `false`**: the S1 candidate is always the mutable working copy, regardless of baseline provenance. The S1 gate records only `Deferred` partial evidence from a best-effort separate projection (including its receipt or evaluation failure), never `Passed`, leaves 5.3 unticked, and does not fail on this observable. The S1 review prompt explicitly excludes this intentional deferral from missing pre-route observables. Preflight baseline evidence is informational only (unavailable evaluation is `NotRun`).
After `route-s1` succeeds, the distinct `s1-committed-forge-pre` controller tool resolves the routed commit through Omnigent's shared revision-source helper and reads that immutable commit's single parent. It evaluates BOTH parent baseline and routed candidate via revision-pinned `git+file:///Users/crs58/projects/vanixiets?ref=rollup-landing&rev=<sha>` sources with the identical `--apply` projection. Both revisions, both evaluation receipts/values, and the comparison are recorded. Only this node may mark `forge-pre-unchanged` `Passed` and tick 5.3 (with the remaining S1 resource arms witnessed). Either evaluation failing records `NotRun(reason)`, retains available receipts, leaves 5.3 unticked, and continues without gate diagnosis/repair; unequal values remain non-passing `Failed` evidence. The verify report renders these outcomes honestly. Later working-copy gates cannot overwrite the distinct committed result; subsequent Nix repairs invalidate it and clear its tick.
For the registered but deliberately uninstalled App `sciexp-gitea-mq` (id `4875422`, owner `sciexp`), set **`defer_installation=true`** on the fresh run. G1 explicitly says not to install yet. `G1-witnesses` makes only the two public, JWT-free App GETs (`/apps/sciexp-gitea-mq` and `/apps/sciexp-nixbot`), retaining id/slug/owner/permission/event evidence and permitting only tasks 1.2/1.4 for registration. The controller clears stale 1.3/11.2/8.4 ticks after adoption hash validation and records each installation, App-JWT webhook-config and write-capable-identity observable as `NotRun("installation deferred by operator until after deployment")`; these are not gate failures. No installation token is minted for either App and no installation-scoped endpoint or App-JWT hook read is called while deferred, including S4 repairs. Other deployment probes still run.
After successful S4 deployment probes and rollback evaluation, **G6** persists `G6.md`, `G6-pending.json` and `gate-ledger-G6.json` under the external evidence root and waits for a durable human confirmation. Its prompt lists passed observations and NotRun items, requires manual installation on `cameronraysmith/vanixiets` alone, and forbids starting V2/V3/V6 first. Confirm only after that installation is complete. Affirmative G6 authorizes distinct non-retrying `G6-mint-token`, `G6-witnesses`, `G6-webhook-config` and `G6-identity-mint-token-*` / `G6-write-capable-identities` nodes. Tool-confirmed installation and identity observations must succeed before S5; only their receipts tick 1.3/8.4. Hook URL proof alone never ticks full task 11.2: authenticated redelivery remains NotRun. Declining G6 exits domain status `declined` (Atomic `cancelled`) with no positive outputs. Resume the same waiting run rather than launch a second controller; completed effects and answers replay.
`deploy=false` never asks G6 and never attempts V2/V3/V6; with installation deferral it also never mints tokens, and the deferred observables remain NotRun through the caveated report. It is not a dry run for the earlier DNS/ruleset effects. `defer_installation=false` preserves the original G1 text, token/identity/deployment command sequence, gate order and validation outputs.
Completed tool/prompt nodes replay; tool outcomes are normalized before ledger insertion and hashing to exclude Atomic's replay-only `cached` flag.
Fatal non-gate tool calls use throwing failure mode so failed callbacks have no replayable return-failure checkpoint; non-Stop Blocked exits use Atomic `{status:"failed", resumable:true}`.
Only `read-rulesets` enables `retriesAllowed:true, maxAttempts:3`; `G1-witnesses`, `write-capable-identities`, and every mint/create/apply/push/deploy node have no automatic retries.
App installation-token POSTs belong to separate non-retrying `G1-mint-token` / `identity-mint-token-<id>` effect nodes. They pass opaque private-file references to GET-only installation probes, never token values in commands or checkpoints. Those probes can be safely retried without reminting; the two composite App witnesses conservatively remain non-retrying.
Token files are mode 0600 outside the repository. A file is reserved before POST, so an interrupted mint leaves a fail-closed sentinel rather than automatically creating another credential. Successful mint replay reuses the file; expired, missing or incomplete credentials require explicit operator reconciliation/replacement at that same private path before resume. Never paste these files into stage reads or evidence reports.
Only explicit `{status:"failed", resumable:true}` exits retain token artifacts. Completion and every non-resumable termination (declined, blocked, needs_rework, unexpected/abort and terminal-record failures) await local deletion of all `*.token.json` files, including incomplete sentinels. This idempotent finalizer deliberately bypasses `ctx.tool` replay/cancellation, memoizes success or failure without retries, attempts every artifact and fails loudly on deletion errors; ordinary evidence remains. Abrupt process death cannot execute a JavaScript finally block: reconcile/remove private artifacts before abandoning such a run.
Bounded gates, proposal validation and best-effort Linear observations retain return-mode failures as durable data; declines remain cancelled, while G3 exhaustion/roborev rejection remain deliberate non-resumable stops.
Interruption inside an unfinished external effect still requires reconciliation before retrying it, not an assumption of exactly-once effects.
Each gate uses forward-only attempt ids with `Batch = 1 | 2`, `nextBatch(1) = 2`, `nextBatch(2) = null`, and `attemptsFor(1 | 2 | 3)` bounded tuples; G3 authorizes exactly one additional bounded batch, and second exhaustion blocks. Both gate and proposal controllers persist the authorization with `nextAttempt` and explicitly return the next batch execution after the durable answer, rather than relying on outer-loop fallthrough. Mocked graph regressions cover successful batch-2 first stages after proposal exhaustion, gate exhaustion and a Blocked diagnosis, plus completed-node replay. The reported live "running with no stages" stall was not reproduced by these local mocks; this continuation hardening does not establish an Atomic runtime scheduler root cause.
Every workflow-owned process/network effect belongs to a finite `ctx.tool` callback forwarding its cancellation signal.
Run evidence lives outside the repository, under `$XDG_STATE_HOME/atomic/gitea-mq/run-*` (default `~/.local/state/atomic/gitea-mq/run-*`); in-tree evidence roots are rejected. Allocation and every token mint canonicalize both repository and evidence roots with `realpath`; an external ancestor symlink into the repository rejects before POST, and accepted mints use the canonical destination.
Build, deployment and Terraform commands stream to disk with only an 8 KiB diagnostic tail in memory; parsed command responses fail beyond 1 MiB, and parsed artifact reads are bounded too.
Flake evaluations retain `--no-write-lock-file` but must not disable import-from-derivation (IFD): `modules/home/ai/skills/default.nix` uses `builtins.readDir` on the composed apm skill tree, realizing `aiSkills.composed` during evaluation, including Magnetite's toplevel derivation. Omnigent's `runGate` likewise evaluates the host check's `.drvPath` without disabling IFD; the justfile's `nixos-build` and `build-machine` recipes build `nixosConfigurations.<host>.config.system.build.toplevel` without that override. This applies to preflight, S1 host/config/negative-control evaluations and both rollback probes; it does not change their timeouts or lock-file protection.

All model stages request only `openai-codex/gpt-6-astra`: high for implement/repair/replan/diagnose, medium for render/docs/verify-writer, and max for reviewers.
Preflight saves the catalog to `model-catalog.json` before validation. When the port is available, absence of `openai-codex/gpt-6-astra` blocks; extra catalog properties are allowed and thinking levels are not validated there. Otherwise native stage resolution is used, with the accepted implicit-fallback risk and mandatory post-call model/thinking rejection above.
Role constraints, paths, failed gate/receipt identifiers, review acceptance criteria and ruleset requirements are protected with `<keepContext>`; structured stage outputs use TypeBox schemas and exhaustive constructor switches.
Diagnosis/replan artifacts travel through stage `reads`, not inline JSON; an S1 rejection receipt retains findings, reviewer artifact and diff path.
Completion requires four branded tool witnesses for implemented changes, deployment, validation results, and report writing; blocked/declined exits expose no positive technical claims.
Human gates are authorizations, not evidence that the technical checks passed.

The workflow never moves or describes `@`, pushes to main, deletes a ref without G5, applies the `merge-queue` label, or runs `linear auth`.
All model stages are read-only and submit `{path,baseSha256,after}` proposals; a controller-produced scoped bases artifact supplies hashes, null denotes an absent base or deleted result, and the controller compares hashes with disk before any writes.
Every implementation/replan/docs proposal executes inside its own bounded attempt loop; rejected schemas or applications persist the reason and re-invoke the stage with fresh IDs, fresh bases and rejection artifacts via `reads`, escalating to G3 after `max_repair_attempts` and permitting only one further bounded batch.
Atomic has a **separate native structured-output correction budget**: the initial prompt plus up to three corrective follow-ups per model candidate, then fallback candidates (if configured) each receive a fresh budget. Only exhaustion of all candidates rejects `ctx.task`; invalid structured output is never a successful checkpoint. At that throwing boundary, the controller bridges Atomic 0.9.18's recognized contract-error diagnostics into one `ProposalRejected` attempt, including the exact missing-output prefix + space + each native turn detail (assistant text without tool, empty assistant text, no assistant message). These native turns do not consume separate authored attempts. Provider/abort/runtime faults are not proposal feedback and propagate unchanged; unknown future diagnostics fail closed instead of being broadly caught.
Unified diff hunks are not supported: hash plus full after content halves duplicated baseline payload without adding a second patch parser and its context/offset ambiguity.
Before allowlist and task checks, the controller resolves existing proposal components with `lstat`/`realpath`, compares canonical spelling byte-for-byte, and compares device/inode identities with tasks.md, proposal.md and every other proposed file.
Symlink parents/leaves, case aliases, protected hardlinks, duplicate identities, absolute paths and traversal are rejected before any write, including earlier valid edits.
Absent paths also require consistent component spelling across the proposal; a proposed file cannot be another proposed file's parent.
Task rows have unique canonical IDs; malformed/duplicate rows and any row change outside the slice are rejected, including during replan.
Model edits and controller technical ticks compare operator rows with the current human baseline; only affirmative G1/G2 receipts authorize the controller to tick 1.1/8.2 and refresh that baseline, and repeated interrupted operator ticks are idempotent.
G1/G2 material says "do not edit tasks.md until the run terminates"; those ticks are Operator attributions, never technical passes.
Replan may only revise in-slice descriptions without changing checkbox states and explicitly forbids nested bullets or new non-task rows in tasks.md.
Writers are restricted to their slice paths plus the change directory; build-service aspects remain untouched.
An applied proposal touching the change directory queues its apply receipt for `validate-change-<gate-attempt>`, a controller tool running `openspec validate stand-up-gitea-mq-on-magnetite --strict` inside the same bounded gate, before evaluation/deployment repair or the gate body. Success binds the process receipt and covered proposal receipts into the gate ledger; failure follows normal gate diagnosis/repair and prevents routing. A later change-directory proposal invalidates prior strict-validation ledger entries and requires a fresh receipt, including replan/repair proposals. Preflight/final validation is not a substitute for this post-proposal check.
The post-G1 exception permits exactly `vars/per-machine/magnetite/gitea-mq-github-app-secret-key` and `vars/per-machine/magnetite/gitea-mq-github-webhook-secret`, plus shared vars/sops paths only if the imported Omnigent helper enumerates them (currently none).
Every process receives `CLAN_NO_COMMIT=1`, including nested Python/Terraform Clan calls; controlled generation/list/update commands and G1's operator `clan vars set` instructions also state it explicitly.
Installed Clan uses this environment variable, not a `--no-commit` option; it still registers paths with Git intent-to-add, but skips content staging and commits.
Before any credential generation, `generateVars` observes `CLAN_NO_COMMIT=1 clan vars list magnetite`. The installed CLI help describes key/value rows and masked secrets; its installed `Var.__str__` implementation supplies the exact `generator/file: ********` (present) and `generator/file: <not set>` (missing) forms. Only an explicit missing webhook row permits generation, with `--generator gitea-mq-github-webhook-secret --no-regenerate`; an existing webhook secret is recorded as `already-present` with the listing receipt and is not regenerated. Empty/malformed listings, duplicate rows, unknown target statuses, or omitted credential rows block. The App PEM must already be populated and is never generated or set by the workflow. Generated credentials require a fresh populated listing and both paths retain encrypted-envelope checks.
The post-effect backstop compares `@`'s change identity and ordered parent commit identities, the exact `rollup-landing` revision, and the join's complete ancestor revision/parent set. It deliberately ignores `@`'s content commit ID, which may change when the shared working copy is snapshotted. New/re-written non-`@` commits are inspected at immutable commit IDs: any modified path under `vars/per-machine/magnetite/**` blocks; all others are recorded as `foreignChanges` (change ID, commit ID, paths) without blocking, including unrelated siblings. Unrelated disk edits are `foreignDrift`; magnetite vars disk changes are allowed only in the webhook generator directory during successful missing-secret generation. No global Git/JJ commit-set equality remains. Checks run in `finally`, including on list/generation failures; they are a backstop, not the primary prevention mechanism.
The App-id patch, existing/generated envelopes, tasks.md and proposal.md route as one dedicated post-G1 change.
Secrets remain inside opaque subprocesses; the leak scan reports counts only across working files including ignored paths, HEAD and history with a positive hostname control.

G2 approves a saved JSON body and its hash, never a regenerated request.
Ruleset rendering and return-mode `approveDraft` semantic validation share `propose("render-ruleset-diff")` with attempt-specific stage/validator names. A schema-valid wrong integration ID/before/reverse body persists rejection feedback and re-renders before G2; exhaustion reaches G3, never a repeatedly cached invalid draft.
The post-review `stable-*` guard is a return-mode gate inside the S1 bound: in-scope drift invalidates the attempt, diagnoses/repairs and requires another fresh review; foreign drift is evidence only. `verify-structural-input-b*-a*` likewise runs inside a bounded change-report repair loop before deterministic report rendering; repeated structural failures reach G3 and then stop without positive outputs.
Every V6 create attempt requires its own durable G5 authorization; a write-ahead create intent prevents an incomplete-node replay from creating twice under one authorization.
Readback/leased cleanup have a separate bounded retry loop with no create capability; interruption before a durable create result can still require operator reconciliation.
G1/G2/G4/G5 declines terminate the run via the declined path with no positive outputs; NotRun is reserved for genuinely unrunnable probes with reasons.
V6 records push acceptance/refusal separately from its falsified deletion-protection claim; V2 branch polling cannot exclude transient refs between observations.
`deploy=false` skips machine activation and live/ref validation, not the earlier G1, DNS or ruleset operations; it is not a dry run.
Run `node .atomic/workflows/gitea-mq/check.mjs` for strict typing, negative witness/batch/schema fixtures, pure contracts, local Nix parsing (never evaluation), Python parsing, real temporary APFS proposal-boundary tests, in-memory graph execution, and mocked command boundaries.
The graph fixture separates disk contents from jj snapshots and resolved revision trees; completed-node replay asserts zero repeated callbacks, model calls, or human prompts. Schema-backed mock tasks validate each initial/corrective turn and throw native-shaped contract errors after the correction budget rather than returning malformed successful stages.
Nested-command checks follow retryable callbacks through helpers and embedded scripts, reject effectful command families (POST/PUT/DELETE, jj, git push, clan, terraform, ssh/systemctl), and execute the real credential Python against a closed subprocess fake to prove failed GET/retry cannot remint or expose a token.
Credential-generation regressions run separately with `node .atomic/workflows/gitea-mq/check.mjs --vars-only` (real controller, closed command/filesystem/VCS ports): present/missing/unparseable listings, receipt binding, foreign commits/disk drift, new magnetite-vars commits, protected topology movement, and failures. The full check includes the same cases.
Real temporary token files are checked for absence after completion and every non-resumable controller path, retention only on explicit resumable failure, and loud/non-retrying deletion failure. Physical symlink regressions call the real mint helper against a closed command port and assert rejection before any POST. All three exact native missing-output diagnostics throw at the mock `ctx.task` boundary through proposal exhaustion/one G3, with provider/abort identity negative controls.
DNS rejection/decline/exhaustion fixtures assert durable quarantine, unchecked committed DNS tasks and same-change repair; roborev rejection, G3 cancellation, DNS decline and exhaustion omit all four positive outputs, including with throwing `ctx.exit`.
Additional checks retain the earlier repair, relock, DNS intent, ruleset, installation, runtime, process and Linear cases.
These are local authoring checks, not real Atomic persistence/recovery, topology mutation correctness, live credentials, deployment, or end-to-end acceptance.

Task 11.5 now uses the authorized C6 deterministic recomputation from live effective branch rules, classic `.contexts` and `.checks[].context`, and the running MainPID's non-secret fallback environment.
The evidence and report must call it a recomputation, not queue journal/dashboard output.
Task 8.4 uses owner-authenticated paginated installation/repository inventory, per-App installation checks for both Apps, and write-capable human collaborators; token restrictions can hide installations, so this is not an unrestricted-universe proof.
DNS uses one bounded plan/approval/apply/dig budget, with fresh confirmation after changed plans; replay validates intent content against the saved-plan identity and reconciles only a zero-change refresh without output changes.
DNS resolves the routed chain tip through Omnigent's `resolveSource`, which verifies the exported bookmark and returns `git+file://<repo>?ref=rollup-landing&rev=<commit-sha>`.
Never use `path:<cwd>`: path sources can ingest ignored secrets and prior plan evidence into the Nix store.
Every proposal application is followed by a durable, signal-forwarding `jj debug snapshot` node; `land` snapshots again before consulting pending paths or taking a no-op branch.
DNS candidates reset tasks 6.1/6.2 before routing and persist `chain_state: quarantined(<change id>)` before planning.
Before any plan, `git show <resolved rev>:modules/terranix/cloudflare.nix` must match the reviewed content hash, and `git grep` must find the mq hostname record in that same revision.
Repairs use `jj squash --into <candidate>` rather than append another DNS change; only successful plan/apply/dig permits an accepted state and witnessed task ticks.
Every caught error kind, including unexpected exceptions and Atomic-style aborts, attempts terminal persistence with the DNS recovery string before deliberate exit or rethrow; a quarantined candidate remains blocked in domain outputs and is not landable.
The record cannot be guaranteed if evidence allocation/storage fails or Atomic has already closed tool admission; native cancellation still governs the run.
The durable ledger is the quarantine authority; this is not an isolated bookmark or an automatic rollback of a partially applied external effect.
All evidence and plan files remain outside the source tree, even though the committed Git source already excludes untracked/ignored files.
Rollback reconstructs the real flake module tree from `f.outPath`, replacing only the queue aspect via `lib.mkForce {}` and asserting that queue enablement disappears; it never copies the host module to `builtins.toFile`, so relative policy imports keep their original directory.
Only s2 permits Terranix edits; the unreachable cross-slice `recheckDns` callback was removed rather than expanding later repair scopes.
The same-candidate DNS repair fixture exercises an actual s2 plan rejection, not a fabricated later-slice Terranix edit.
`Repair(Noop)` re-probes without routing an empty change.
Changed tracked Nix invalidates deployment/validation receipts, routes actual pending paths, and reactivates and probes the pinned source before retrying validation; previously completed dependent validations become NotRun until witnessed again.
Gate/repair/Linear/DNS-chain outcomes are tagged unions; expected verification claims are computed solely from the controller ledger, never supplied by the verify writer.
The commentary-only writer retries malformed/extra structured claims inside the same bounded proposal loop; model commentary is escaped and cannot create positive task verdicts.
Stage `reads` use `ledger-index.json` (node, ok, evidence path), not the growing payload ledger; full `ledger.json` and individual receipts remain on disk for targeted inspection.
The preflight task-ID inventory seeds unverified ledger rows, so every task receives a deterministic verdict even without a later receipt.
The controller renders report sections 1–8, every task verdict and the attribution ledger; model output contributes only escaped analysis/caveats in fixed non-verdict slots.
The report includes Change/Verified at/Verifier metadata and nixbot's section headings; its Overall Decision tri-box checks `(warn)` normally and `(fail) FAIL` on roborev Reject by replacing the existing section, never appending a competing disposition or checking `(pass)`.
V6 remains Fail and authenticated webhook redelivery remains NotRun, so roborev approval is not an overall unqualified pass.
G1, rollback, docs, V2 and V6 observations have explicit receipts.
Each S1 task has named required observation arms; only completely observed tasks enter the passed ledger.
Credential-file bindings, ensureUsers ownership, App-id equality after G1, and landing environment now have explicit checks.
Tasks 2.1 (input/follows/lock delta), 3.1 (generator scripts/source owner), 4.2 (module-wide label assignment scan), 4.4 (header/lint), and 5.1 (import/aspect ordering) remain unverified where those arms are unobserved; implementation ticks are not verification.
Roborev still checks implementation and evidence quality; arbitrary model markdown can no longer supply or inject report verdict/attribution sections.
Proposal validation is not a cross-file transaction against I/O interruption or a lock against concurrent path swaps after validation.
The following prior caveats remain explicitly out of scope: gap 2, same-path concurrent ownership/review-hash attribution during routing; gap 8, transient batch refs between V2 samples and stale candidate/head/label authorization across retries; gap 9, SSH transport identity equivalence to the gh identity and interrupted V6 cleanup recovery.
Authenticated webhook redelivery remains NotRun, table presence is not a direct latest-migration log witness, and interrupted Linear comments lack reconciliation.
Do not launch until the orchestrator reviews these boundaries and remaining gaps.
>>>>>>> conflict 1 of 1 ends

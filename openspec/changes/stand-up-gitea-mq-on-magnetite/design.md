## Context

Magnetite is the Hetzner CX53 host that carries this fleet's server-side services: gitea, nixbot, buildbot-nix, niks3, kanidm, matrix, cognee, the SSO gateway, and omnigraph.
Its composition is the repository's deferred-module pattern: `flake.nix` hands `modules/` to `import-tree`, each aspect file assigns a deferred module into `flake.modules.nixos.<aspect>`, `modules/machines/nixos/magnetite/default.nix` imports upstream modules and names the aspects the host takes, and `modules/clan/inventory/machines.nix` binds the result into `clan.machines.magnetite`, which `clan machines update magnetite` deploys.
nixbot sits in that pattern as `inputs.nixbot.nixosModules.nixbot` imported at the host plus the aspect `flake.modules.nixos.nixbot` in `modules/nixos/nixbot.nix`, and serves `cameronraysmith/vanixiets` and `sciexp/ironstar` under the App `sciexp-nixbot` (id `4743700`).

The ADR `docs/notes/development/version-control/adr-substitution-first-rollup-landing.md` decides that changes land through gitea-mq's own bors-style batching: up to twenty queue entries tested together, checks read from nixbot's three contexts, and `main` fast-forwarded by non-force `UpdateRef` to the exact commit CI tested.
Revision 2 of that ADR retired the earlier orchestrator rollup onto `staging`, because `internal/batch/batch.go::Engine.HandlePass` fast-forwards the target to the tested batch SHA, so a separately assembled linear candidate adds no substitution guarantee.
The ADR assigns this change R11 (the service and its four settings), R13 (a separate GitHub App), R14 (the two rulesets, App bypass, `allow_auto_merge`, no linear history, no classic protection), the second automated Compliance item (pinning the settings), and the world-assumption entries about gitea-mq and GitHub.
R15 and R16, the human-and-agent authorization procedure, and R1 and R2, source filtering and cache warming, belong to sibling changes; this change references them where a dependency needs stating and does not absorb them.
V9 is settled from source: `batchMax`, `requiredChecks`, and `skipQueueIfUpToDate` are first-class options of gitea-mq's NixOS module, the merge label is not exposed but defaults to `merge-queue` in `config.go::Load`, and the module has no environment escape hatch.

gitea-mq's module, `nix/module.nix` at `d44c455`, provides `services.gitea-mq.{github.{appId,privateKeyFile,webhookSecretFile,repos,pollInterval},databaseUrl,listenAddr,externalUrl,skipQueueIfUpToDate,requiredChecks,batchMax,bisectMaxSteps,hideRefFromClients,...}`, runs the unit with `DynamicUser = true`, reads both GitHub secrets through `LoadCredential`, listens on TCP only, and provisions no database.
`internal/github/setup.go::EnsureRepoSetup` enables `allow_auto_merge`, attempts to add App bypass to other branch-target rulesets, and creates its own `gitea-mq` ruleset only if none has that name; organization-owned rulesets or insufficient permissions can produce warnings (`ensureBypass`).
Its `App.SyncHookConfig` patches the App's webhook URL and secret to match the running configuration.

Two constraints frame the decisions below.
First, nixbot and buildbot keep running untouched; the queue is added beside them.
Second, the deliverable is a deployment provable by `clan machines update magnetite`, with the settings the ADR fixes provable by evaluation before deployment.

Stakeholders are the operator, who registers the App, supplies credentials, and approves G2, and people or agents authorizing ordinary PRs or registered stacks under the sibling R15/R16 procedure.
The earlier orchestrator-only labelling and bypass role is retired with the rollup.

## Goals / Non-Goals

**Goals:**

A gitea-mq instance on magnetite, served at `mq.scientistexperience.net` over TLS, deployed by `clan machines update magnetite`.
The four R11 settings in force and pinned by an assertion that fails host evaluation on drift.
A dedicated GitHub App with exactly the R13 permission and subscribable-event set, its credentials supplied through clan vars with no value in the repository.
The two-ruleset arrangement on `cameronraysmith/vanixiets` per R14: our ruleset requires `nixbot/nix-eval`, `nixbot/nix-build`, and `nixbot/effects`, the queue's own ruleset is created by its startup setup, and the `allow_auto_merge` question is settled.
Runtime confirmation of V2, V3, and V9, with discharged V1 re-confirmed at the first live stacked landing.

**Non-Goals:**

The R15/R16 authorization procedure, the `030-stacked-landing-protocol` instructions, the `git-stacked-pr-integration` skill, R1/R2 source filtering/cache warming, and `nixbot.toml` changes.
A second repository in the installation scope.
The retired `landing.toml` and `refs/landings/*` protocol, including its V6 probe.
Any change to nixbot's App, aspect, generators, vhost, or database, or to buildbot's.
Any upstream filing to gitea-mq.

## Decisions

### D1: Compose gitea-mq the way this repository composes nixbot

- **Choice**: add the `gitea-mq` flake input following `nixpkgs` and `treefmt-nix`, import `inputs.gitea-mq.nixosModules.default` at the host in `modules/machines/nixos/magnetite/default.nix` beside `inputs.nixbot.nixosModules.nixbot`, and put the site configuration in a new aspect `flake.modules.nixos.gitea-mq` at `modules/nixos/gitea-mq.nix`, named in the host's aspect list after `nixbot`.
- **Rationale**: this is the nixbot precedent line for line; the module's flake declares exactly `nixpkgs` and `treefmt-nix` as inputs, so both follow this repository's; and the deployed unit stays a function of the host's generation.
- **Alternatives considered**: clan-infra's wrapper form `flake.nixosModules.gitea-mq = [ upstream ./gitea-mq.nix ]`, rejected as a second composition convention beside an existing one.
- **Boundary**: vendored-versus-first-party. `nix/module.nix` is consumed through the input and never edited; the aspect is first-party and the only place site configuration lives.

### D2: The four settings are module options, the label is a default, and an assertion pins all four

- **Choice**: `batchMax = 20`, `skipQueueIfUpToDate = true`, `requiredChecks = [ "nixbot/nix-eval" "nixbot/nix-build" "nixbot/effects" ]`; no value for the merge label; `assertions` in the aspect that read `config.services.gitea-mq.batchMax`, `.skipQueueIfUpToDate`, and `.requiredChecks` from the merged configuration and compare them to those values, plus one asserting `!(config.systemd.services.gitea-mq.environment ? GITEA_MQ_MERGE_LABEL)`.
- **Reversal, zero to five**: the earlier design chose unlimited `batchMax = 0` while relying on orchestrator serialization to supply one rollup entry at a time; zero itself never guaranteed a singleton (`internal/queue/batch.go::Service.FormBatch`).
  The rollup rested on a false premise about queue-created merge commits.
  `internal/batch/batch.go::Engine.HandlePass` calls `internal/github/forge.go::FastForward` with the exact tested batch SHA, preserving nixbot's tested-tree identity (`gitrepo.py::WorkTree.tree_hash`) even with merge history.
  Revision 2 chose five to match the three surveyed GitHub deployments (`Mic92/dotfiles machines/eve/modules/gitea-mq.nix::services.gitea-mq`, `SBEE-Lab/infra modules/gitea-mq/default.nix::services.gitea-mq`, `mulatta/dots machines/cask/modules/gitea-mq.nix::services.gitea-mq`).
- **Reversal, five to twenty**: `batchMax = 20` supersedes revision 2's `batchMax = 5` and its fleet-matching rationale, retained in `brainstorm.md::Q3`.
  Our flake-update lane produces waves of 20–40 simultaneously-ready PRs, scheduled twice weekly (`.github/workflows/update-flake-inputs.yaml::on.schedule`); the reference deployments do not have this lane.
  Twenty can cover a twenty-entry wave; a forty-entry wave still needs multiple batches.
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
- **Rationale**: the module maps the three options straight to `GITEA_MQ_BATCH_MAX`, `GITEA_MQ_SKIP_QUEUE_IF_UP_TO_DATE`, and `GITEA_MQ_REQUIRED_CHECKS`; `GITEA_MQ_MERGE_LABEL` is not an option, the module's `environment` set is closed, and `config.go::Load` defaults the label to `merge-queue`, so the only drift possible is an override from another module, which is what the fourth assertion detects. The assertions read the merged configuration, so an `lib.mkForce` elsewhere or a one-sided edit fails `checks.x86_64-linux.nixos-magnetite` at evaluation. The ADR's Compliance item allows a flake check or a module assertion; the assertion needs no new check attribute.
- **Extension, two required contexts to three**: the original G2 decision added `nixbot/nix-eval` beside `nixbot/nix-build`; the operator subsequently added `nixbot/effects` to ruleset `16212553` so landing waits for herculesCI-style effects to conclude.
  The operator reported that this also fixed orphaned `gitea-mq/*` mirror check runs: they had been copied mid-flight and never updated after the queue entry finalized.
  The configured fallback and its assertion now include effects, superseding the two-context fallback rather than preserving a weaker gate merely because it is inactive.
- **Coupled invariant, forge and fallback**: the ruleset is authoritative, and `requiredChecks` must never be weaker than its required external contexts.
  `internal/github/forge.go::GetRequiredChecks` unions ruleset and classic-protection contexts minus queue-owned contexts; `internal/monitor/monitor.go::ResolveRequiredChecks` prefers that non-empty list, so the fallback does not fire in this configuration.
  If the forge returns an empty list, the fallback must still require `nixbot/nix-eval`, `nixbot/nix-build`, and `nixbot/effects`: a fallback that silently reduces the gate is worse than no fallback.
  Forge-read errors propagate from `ResolveRequiredChecks`; they do not activate the fallback.
  D2's assertion pins the configured list during magnetite evaluation; D7's read-only forge verification checks the authoritative list, which the assertion cannot inspect.
- **Coupled invariant, effects gate and effect production**: nixbot posts `nixbot/effects` only when at least one effect runs.
  In nixbot's `nixbot/nixbot/effects_run.py::enqueue_effects`, an empty effect set returns before `effects_started` is called, so no context is posted.
  A required context that is never posted blocks a PR indefinitely rather than failing it (`internal/monitor/monitor.go::EvaluateChecks`).
  Requiring `nixbot/effects` is therefore safe only while the default branch keeps `nixbot.toml::effects_on_pull_requests = true` and a non-empty effect set that runs for each gated candidate.
  `nixbot.toml`, the effect declarations, the authoritative ruleset, and this required-check list must move together; disabling PR effects or removing the last effect requires a coordinated gate change, not an isolated configuration edit.
- **Alternatives considered**: setting `GITEA_MQ_MERGE_LABEL` on the unit directly, rejected because it duplicates a default that already holds and creates the override the assertion exists to catch. A structure check under `modules/checks/structure/` evaluating the magnetite configuration, rejected as a second place to keep the same four values.
- **Boundary**: source-versus-delivered. The assertion is a property of evaluation and says nothing about the running process; the runtime tasks read the unit's environment on the host.

### D3: Database and role provisioned beside a dynamic user, authenticated by peer

- **Choice**: `services.postgresql.ensureDatabases = [ "gitea-mq" ]` and `ensureUsers = [ { name = "gitea-mq"; ensureDBOwnership = true; } ]` in the aspect; the module's `DynamicUser = true` and default `databaseUrl` unchanged.
- **Rationale**: the module provisions no database. The unit sets `DynamicUser = true` with no `User=`, so systemd names the transient user after the unit, `gitea-mq`; PostgreSQL's peer authentication over `/run/postgresql` maps that OS user name to the role of the same name, so no password and no static user are needed. Mic92's GitHub-backend deployment (`dotfiles/machines/eve/modules/gitea-mq.nix`) and clan-infra's (`modules/web01/gitea-mq.nix`) both use exactly these two lines. The host's single PostgreSQL instance is additively configured by five services already; this adds one database and one role.
- **Alternatives considered**: `DynamicUser = false` with a static `users.users.gitea-mq`, rejected because it overrides the vendored unit's `serviceConfig`, adds a user for no gain, and diverges from both reference deployments. A password role over loopback TCP as cognee does, rejected because the socket path is the module default and needs nothing.
- **Trade-off recorded**: the role name is coupled to the unit name; setting `User=` or renaming the unit silently breaks authentication, and the assertion does not cover it because the module owns the unit name.

### D4: Loopback listener and a hand-written vhost

- **Choice**: `listenAddr = "127.0.0.1:8092"`, `externalUrl = "https://mq.scientistexperience.net"`, and `services.nginx.virtualHosts."mq.scientistexperience.net" = { forceSSL = true; enableACME = true; locations."/".proxyPass = "http://127.0.0.1:8092"; }`.
- **Rationale**: the module listens on TCP only, with no socket activation and no nginx integration. Its default `:8080` binds every interface on a multi-homed host and collides with the LiveKit JWT service, which `modules/nixos/matrix.nix` binds at 8080. Port 8092 is clan-infra's choice for the same service and is unused on magnetite. The vhost matches every other vhost on this host and the ACME account they share.
- **Alternatives considered**: none competitive; the module offers no other listener shape.

### D5: Two generators, root-owned, consumed as systemd credentials

- **Choice**: `clan.core.vars.generators.gitea-mq-github-app-secret-key` with file `key.pem`, populated by `clan vars set`, and `gitea-mq-github-webhook-secret` with file `secret`, generated by `openssl rand -hex 32`; both files at the default owner `root` and mode `0400`; both naming `gitea-mq.service` in `restartUnits`; the aspect passes their `.path` to `github.privateKeyFile` and `github.webhookSecretFile`.
- **Rationale**: the module reads both through `LoadCredential`, which systemd performs as root before the dynamic user exists, so a root-owned file is the correct shape and `owner = "gitea-mq"` would fail at activation for want of a static user; this is the deliberate difference from `modules/nixos/nixbot.nix`, whose files are owned by the static `nixbot` user. The webhook secret needs no manual copy into GitHub: `App.SyncHookConfig` pushes the running configuration's URL and secret to the App at every startup. The private key has no such path; GitHub generates it and the operator sets it. The unit snapshots credentials at start, so `restartUnits` is not optional.
- **Boundary**: source-versus-delivered. The generator is source; the file the unit reads exists only after activation, so verification is on the host, not by reading the repository.

### D6: A dedicated GitHub App with the R13 set, registered at a human gate

- **Choice**: a second App with repository permissions Contents read and write, Administration read and write, Checks read and write, Pull requests read and write, Commit statuses read, Metadata read, and configured subscribable events `check_run`, `pull_request`, `status`; GitHub automatically delivers `installation` and `installation_repositories` to every App, and they cannot be subscribed to or required in the API `events` array; proposed name `sciexp-gitea-mq`, owner `sciexp`, public, installed on `cameronraysmith/vanixiets` alone; its numeric id written into the aspect as `github.appId`.
- **Rationale**: this is R13 and the README's "GitHub setup" permission set, with subscribable events distinguished from automatic GitHub deliveries rather than copying its event list literally. Contents write and Administration write are permissions the build service must never hold, and adding them to `sciexp-nixbot` would edit a registration a running service depends on. The name and owner mirror the sibling and are the operator's to change at the gate.
- **Correction**: the earlier five-event API expectation incorrectly required automatic installation deliveries as subscriptions and blocked a live gate; revised ADR R13 and `GET /apps/sciexp-gitea-mq` establish the exact three-event subscription set.
- **Alternatives considered**: reusing `sciexp-nixbot`, rejected above. Registering without Administration so that `EnsureRepoSetup` is skipped, rejected because R13 fixes the set and the ADR relies on setup to create the queue's own ruleset and to keep the App a bypass actor on ours.
- **Trust boundary**: the installation selection is externally maintained forge state, not a restriction enforced by this NixOS configuration. D11 requires complete external verification of the one-repository installation scope before deployment authorization.

### D7: Two rulesets — ours requires three contexts, the queue creates its own

- **Choice**: ruleset `16212553` on `cameronraysmith/vanixiets` keeps its name, its `deletion` and `non_fast_forward` rules, its `nixbot/nix-build` required check pinned to App `4743700`, and its repository-admin bypass, and also requires `nixbot/nix-eval` and `nixbot/effects`.
  Nothing is renamed, nothing is removed, no linear-history rule is added, and classic branch protection stays absent.
  The queue's `EnsureRepoSetup` creates a second ruleset named `gitea-mq` requiring only its own status pinned to the queue's App, and adds the queue's App as a bypass actor on ours.
  The original G2 approval covered only the eval addition; the subsequent operator-added effects requirement extends that decision for the reason recorded in D2 and is matched here without another forge mutation.
- **Reversal**: an earlier revision chose the opposite edit — rename `16212553` to `gitea-mq`, add `required_linear_history`, drop `nixbot/nix-build`, and require only the queue's status — so that the forge list would be empty and `GITEA_MQ_REQUIRED_CHECKS` would become operative. It is retired for two reasons. Linear history was a consequence of the abandoned one-entry rollup and no surveyed deployment mandates it. And `internal/github/setup.go::EnsureRepoSetup` returns early only when a ruleset *named* `gitea-mq` already exists, so pre-creating one was a way to suppress a second ruleset that is not needed: SBEE-Lab/infra and mulatta/dots both run two rulesets live, a human-owned one carrying `deletion`, `non_fast_forward`, and their build service's two contexts, beside the App-owned one carrying only `gitea-mq`.
- **Rationale**: `internal/monitor/monitor.go::ResolveRequiredChecks` prefers the forge's list whenever it is non-empty and consults `GITEA_MQ_REQUIRED_CHECKS` only when it is empty, and `internal/github/forge.go::GetRequiredChecks` unions ruleset and classic contexts minus the queue's own.
  Keeping all three nixbot contexts in our ruleset makes the forge authoritative; a non-empty proper subset would silently shrink the queue's gate despite the stronger fallback.
  D2 and D7 form one invariant: the inactive fallback must match the authoritative gate so an empty forge list cannot weaken it, and requiring effects remains coupled to default-branch PR-effect enablement and a non-empty effect set.
- **Alternatives considered**: leaving our ruleset unchanged and relying on `requiredChecks` was rejected because its non-empty `[nixbot/nix-build]` list suppressed the original fallback pair; it would likewise suppress today's three-context fallback.
  Pre-creating a disabled ruleset named `gitea-mq` remains optional, solely to choose when the queue context starts blocking.
  Setup returns early for that name without creating, repairing, or activating it, so the operator must separately approve activation; otherwise setup creates its own active second ruleset.
- **Retired verification**: V6's `refs/landings/*` probe is removed because the revised ADR retires that provenance protocol.

### D8: `allow_auto_merge` stays on, and the enqueue signal is the authorization

- **Choice**: keep `allow_auto_merge = true` and document the enqueue signal as merge authorization, without restricting it to an orchestrator.
- **Rationale**: R14 enables ordinary trunk PR auto-merge; `internal/github/setup.go::EnsureRepoSetup` restores that setting at startup. `internal/poller/poller.go::enqueuePR` gates only on check results and the App updates the ref with ruleset bypass, so approving-review rules cannot constrain queue landing. E1 orders risk-required review before authorization by convention, matching all three reference GitHub deployments; implementation and manual audit belong to sibling R15/R16 work.
- **Reversal**: the earlier framing treated auto-merge as an unwanted second enqueue path to be bounded, because the rollup premise made the label the only correct signal. Under the two-axis design, auto-merge is correct for ordinary trunk-based pull requests and wrong only on stack members, where `enqueueAutoMergePRs` queues against `pr.BaseBranch` with no stack resolution and `PollOnce` runs it before label enqueue. That shape rule belongs to the landing-protocol change; this change records the fact as world assumption A28.
- **Alternatives considered**: a post-start job that turns the setting off, rejected because it races the next restart and makes the state depend on timing. Removing Administration from the App, rejected under D6.
- **Trust boundary**: forge permissions govern who can set signals; this deployment neither enforces review nor proves E1 compliance by counting collaborators.

### D9: `hideRefFromClients` off

- **Choice**: `hideRefFromClients = false`.
- **Rationale**: the option defaults to `config.services.gitea.enable`, true on magnetite, and when true the module injects an `ExecStartPre` into `systemd.services.gitea` that edits the Gitea user's global git config (`nix/module.nix`, `mkHideRefsPre`). This instance manages GitHub repositories only and creates no branch on the local Gitea, so the injection would modify a running service's unit for no effect. Mic92's GitHub-only deployment sets the same value.
- **Boundary**: vendored-versus-first-party. The option is the module's; the aspect only sets it.

### D10: Hostname declared where every other one is

- **Choice**: an unproxied `mq` CNAME to `magnetite.scientistexperience.net` in `modules/terranix/cloudflare.nix`, declared the way `nixbot` is, applied with `just terraform-plan` and `just terraform-apply` before the host is deployed.
- **Rationale**: DNS for the zone is declarative in-repo, records are unproxied so ACME's HTTP challenge reaches the host, and issuance happens at activation, so the record must exist first.

### D11: Repository allowlist

- **Choice**: keep `github.repos = [ "cameronraysmith/vanixiets" ]` and require the App to be installed on `cameronraysmith/vanixiets` alone. The one-repository constraint applies to both the explicit configuration and the externally verified installation scope.
- **Rationale**: `github.repos` is additive explicit configuration, not a machine-enforced exclusion boundary. At `d44c45589fdb59e57b7996809526eac03811babe`, `internal/github/discovery.go::InstallationSource` returns installed repositories and `internal/discovery/discovery.go::DiscoverOnce` adds them independently of `ExplicitRepos`. A repository omitted from `github.repos` is therefore not excluded when the App is installed on it. Before deployment authorization, record complete enumeration of all App installations and the repositories available to each, with pagination where applicable, or equivalent complete operator-page evidence, establishing that the App is installed only on `cameronraysmith/vanixiets`. The target-repository installation endpoint alone cannot establish exclusivity. Missing or incomplete evidence prevents deployment authorization; broader installation violates the one-repository boundary and also prevents authorization. No filtering implementation or upstream change is authorized by this decision; machine-enforced filtering requires a separately approved design change.

### D12: No upstream filing

- **Discussion point, not a decision that alters any artifact**: no issue or pull request will be opened against gitea-mq anywhere in this work, per the maintainer, neither for a merge-label module option nor for database provisioning. The label holds by default and the database is provisioned here, so nothing in this change waits on upstream.

## Risks / Trade-offs

[Risk] A later edit changes batch size, skipping, the configured fallback, or the label → Mitigation: D2's assertions reject that drift during host evaluation; merge commits in tested batches are expected, not a configuration failure.

[Risk] A nixbot context disappears from our ruleset and the queue gates only on the remaining contexts → Mitigation: D7 and tasks 11.4/11.5 read both rulesets and classic-protection state to establish the exact forge-derived three-context set; visibility of the resolved list in logs or the dashboard is unverified.

[Risk] Peer authentication fails because the role name and the dynamic user name diverge → Mitigation: D3 records the coupling; the deployment task checks the unit's log for a successful migration rather than inferring from the role's existence.

[Risk] Certificate issuance fails at activation because the DNS record is absent or proxied → Mitigation: D10 applies and verifies the record before the host is deployed.

[Risk] The App's Contents write and Administration write are installed more broadly than intended → Mitigation: D11 requires complete external evidence of installation on `cameronraysmith/vanixiets` alone before deployment authorization. Missing or incomplete evidence blocks authorization, and broader installation is a boundary violation, not a condition filtered by `github.repos`. The explicit list remains one repository but supplies no machine-side confinement.

[Risk] An early signal lands review-required work unreviewed → Mitigation: D8 documents E1 and points to the sibling authorization procedure and manual audit; A27 records the review-blind/bypass boundary, which collaborator counts do not discharge.

[Risk] Our ruleset is edited by the queue's startup setup rather than left alone → Mitigation: `EnsureRepoSetup` adds only a bypass actor to other branch-target rulesets and creates its own ruleset when none is named `gitea-mq`; the runtime task lists both rulesets after startup and compares ours against the approved state.

[Risk] GitHub does not mark fast-forwarded stack members merged (V1) → Mitigation: the ADR discharges V1, empirically for the non-stack case and on operator confirmation of GitHub's retarget-and-mark behaviour for the stacked case, and marks it for re-confirmation at the first live stacked landing; carried here as world assumption A23 with its violation condition.

[Trade-off] The assertion guards evaluation only, not the running process → accepted; runtime tasks read the unit's environment on the host, and a process started outside the unit is not something a NixOS assertion can see.

[Trade-off] Native auto-merge is available as an authorization signal → accepted for ordinary trunk PRs, with no auto-merge on any registered-stack member under the sibling shape policy.

[Trade-off] A second App with write and administration permissions is a second high-privilege registration to hold → accepted, because the queue cannot update refs or maintain rulesets without them, and the build service must not hold them.

## Migration Plan

Deployment order, each step reviewable.
G1: present the App registration values and the credential commands, and wait for the operator to register the App, generate its private key, install it on `cameronraysmith/vanixiets`, and set the private key with `clan vars set`.
Add the flake input and lock it.
Write the aspect with both generators, the service configuration, the PostgreSQL provisioning, the vhost, and the assertions; name it in the host's aspect list and import the upstream module at the host.
Generate the webhook secret.
Instantiate the host's configuration as a check.
Apply the DNS record and confirm resolution.
G2 originally presented the single-context eval addition for `cameronraysmith/vanixiets` for approval before application; the operator's later effects addition extends the required set as recorded in D2/D7.
Deploy with `clan machines update magnetite`.
Confirm that setup created its own ruleset if absent and added App bypass to ours without changing our rules, that the App's webhook URL matches the service, and that V2, V3, and V9 hold.
Re-confirm discharged V1 at the first live stacked landing; the old V6 ref probe is retired.

Rollback is the ordinary one: remove `gitea-mq` from the host's aspect list and redeploy, which withdraws the unit, the vhost, and the assertions.
The database and role, the cache directory, the credential entries, the App registration, and both rulesets persist after such a rollback.
The App-owned queue gate still requires `gitea-mq` after service removal; an operator-approved disabling of that gate accompanies rollback so the branch is not left awaiting a stopped service.
Record that separately from the original G2 reverse diff, which removes only the added eval context from ours and preserves its build check and protection rules; the later effects requirement and fallback must remain coordinated under D2.

Acceptance is the integration verification in tasks.md: the hostname serves over TLS, the unit is running with the four settings visible in its environment, the database exists owned by its role and the schema is migrated, the App's webhook URL reads the service's endpoint, both rulesets read as approved and as created by startup, and an up-to-date pull request whose tip already carries all three nixbot contexts is landed by fast-forward.

## Gate 1 modality verdicts

This table is the pre-apply spec-and-feature alignment record.
It carries one row per requirement in this change's three delta specs, with the capability's stratum tag from the proposal and the modality that witnesses the requirement.

No row routes to a Gherkin scenario, so this change lays out no `.feature` file.
The repository has no BDD runner, and every observable this change asserts is either a property of the evaluated NixOS configuration, which `nix eval` witnesses, or an observation against a deployed host or the forge, which the integration verification witnesses as a smoke test.

| Requirement | Capability | Stratum | Modality | Witness |
|---|---|---|---|---|
| A merge queue is reachable at its own hostname | `merge-queue-service` | behavioral | smoke (deployment) | tasks 11.1 |
| Landing advances the default branch to a tested commit | `merge-queue-service` | behavioral | build gate (`nix eval`) and smoke (deployment) | tasks 4.2, 11.7 |
| The queue gates on the build service's verdicts and nothing else | `merge-queue-service` | behavioral | build gate (`nix eval`) and smoke (forge) | tasks 4.2, 8.3, 11.5 |
| The queue acts under its own identity | `merge-queue-service` | behavioral | smoke (forge) | tasks 1.2, 1.4 |
| The enqueue signal is exposed as merge authorization | `merge-queue-service` | behavioral | documentation and world-assumption boundary | tasks 8.4, 10.1 |
| Queue credentials are operator-supplied and never legible in the repository | `merge-queue-service` | behavioral | content search and build gate (`nix eval`) | tasks 3.3, 3.1 |
| One activation establishes the queue | `merge-queue-service` | behavioral | smoke (deployment) | tasks 9.1, 11.1 |
| Landing settings cannot drift unnoticed | `merge-queue-service` | behavioral | build gate (`nix eval`, negative control) | tasks 4.3 |
| A distinct hostname is served over TLS to a loopback listener | `merge-queue-interface` | interface | build gate (`nix eval`) and smoke (deployment) | tasks 4.1, 11.1 |
| The four landing settings are evaluated values guarded by an assertion | `merge-queue-interface` | interface | build gate (`nix eval`, negative control) | tasks 4.2, 4.3 |
| A database and role exist for the unit's dynamic user | `merge-queue-interface` | interface | build gate (`nix eval`) and smoke (deployment) | tasks 4.1, 11.3 |
| Credentials exist only as activation-resolved systemd credentials | `merge-queue-interface` | interface | build gate (`nix eval`) and smoke (deployment) | tasks 3.1, 9.1 |
| The forge application holds exactly the queue's permission and event set | `merge-queue-interface` | interface | smoke (forge) | tasks 1.2 |
| The default branch is governed by two rulesets | `merge-queue-interface` | interface | smoke (forge) | tasks 8.3, 11.4 |
| The service registers its own webhook endpoint | `merge-queue-interface` | interface | smoke (forge) | tasks 11.2 |
| The service is a consequence of the host's declared configuration | `merge-queue-interface` | interface | build gate (`nix eval`) | tasks 7.1 |
| This capability states its own trust boundary | `merge-queue-interface` | interface | capability text and documentation | specs text, tasks 10.1 |
| A22 — gitea-mq resolves stacks only through the Stacks API | `world-assumptions` | world | violation-condition witness | its own scenario |
| A23 — GitHub marks a fast-forwarded stack member merged | `world-assumptions` | world | violation-condition witness | its own scenario |
| A24 — gitea-mq enqueues auto-merge-enabled pull requests and enables `allow_auto_merge` | `world-assumptions` | world | violation-condition witness | its own scenario |
| A25 — gitea-mq takes required checks from the forge's protection first | `world-assumptions` | world | violation-condition witness | its own scenario |
| A26 — the batch engine advances the target to the exact tested commit | `world-assumptions` | world | violation-condition witness | its own scenario |
| A27 — the queue is review-blind and the enqueue signal is the merge authorization | `world-assumptions` | world | violation-condition witness | its own scenario |
| A28 — native stack members are based on one another | `world-assumptions` | world | violation-condition witness | its own scenario |
| Grounded vocabulary for behavioral requirements | `world-assumptions` | world | designation table and its lint | the table itself |

No row carries an `est-property`, `est-contract`, or `est-symbolic` modality, so this change carries no executable-specification-testing obligation.

## Open Questions

Whether the operator wants the App owned by `sciexp` and public, as `sciexp-nixbot` is, or owned by `cameronraysmith`; either works for a user-owned repository and the G1 gate is where it is decided.

Whether to pre-create a disabled `gitea-mq` ruleset or let setup create it active is an optional timing preference, not a prerequisite.
If pre-created, setup does not create or activate it; the operator separately chooses activation timing.
The old explicit-User-bypass question and V6 namespace question are retired: G2 originally added only `nixbot/nix-eval`, D2/D7 record the later `nixbot/effects` extension, and the ADR removes the orchestrator provenance protocol.

The `world-assumptions` designation table is modified by this change and by `stand-up-nixbot-on-magnetite`, which is In Review and not yet archived; archive applies MODIFIED by full-text replacement, so this change's table carries the union of the corpus rows, the sibling's rows, and its own, and whichever change archives second must carry the other's rows or lose them.

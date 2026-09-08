## Context

Magnetite is the Hetzner CX53 host that carries this fleet's server-side services: gitea, nixbot, buildbot-nix, niks3, kanidm, matrix, cognee, the SSO gateway, and omnigraph.
Its composition is the repository's deferred-module pattern: `flake.nix` hands `modules/` to `import-tree`, each aspect file assigns a deferred module into `flake.modules.nixos.<aspect>`, `modules/machines/nixos/magnetite/default.nix` imports upstream modules and names the aspects the host takes, and `modules/clan/inventory/machines.nix` binds the result into `clan.machines.magnetite`, which `clan machines update magnetite` deploys.
nixbot sits in that pattern as `inputs.nixbot.nixosModules.nixbot` imported at the host plus the aspect `flake.modules.nixos.nixbot` in `modules/nixos/nixbot.nix`, and serves `cameronraysmith/vanixiets` and `sciexp/ironstar` under the App `sciexp-nixbot` (id `4743700`).

The ADR `docs/notes/development/version-control/adr-substitution-first-rollup-landing.md` decides that changes land as bors-style rollups through gitea-mq: one labeled stack at a time, checks read from nixbot's two contexts on the tip SHA, `main` fast-forwarded by non-force `UpdateRef`.
Its review memo assigns this change R12 (the service and its four settings), R15 (a separate GitHub App), R16 (rulesets), the second automated Compliance item (pinning the settings), and the world-assumption entries about gitea-mq and GitHub.
The memo also settles V9 from source: `batchMax`, `requiredChecks`, and `skipQueueIfUpToDate` are first-class options of gitea-mq's NixOS module, the merge label is not exposed but defaults to `merge-queue` in `config.go::Load`, and the module has no environment escape hatch.

gitea-mq's module, `nix/module.nix` at `d44c455`, provides `services.gitea-mq.{github.{appId,privateKeyFile,webhookSecretFile,repos,pollInterval},databaseUrl,listenAddr,externalUrl,skipQueueIfUpToDate,requiredChecks,batchMax,bisectMaxSteps,hideRefFromClients,...}`, runs the unit with `DynamicUser = true`, reads both GitHub secrets through `LoadCredential`, listens on TCP only, and provisions no database.
Its `setup.go::EnsureRepoSetup` runs at startup against every managed repository: it sets `allow_auto_merge`, adds the App as bypass actor to every branch ruleset, and creates a ruleset named `gitea-mq` if none exists.
Its `App.SyncHookConfig` patches the App's webhook URL and secret to match the running configuration.

Two constraints frame the decisions below.
First, nixbot and buildbot keep running untouched; the queue is added beside them.
Second, the deliverable is a deployment provable by `clan machines update magnetite`, with the settings the ADR fixes provable by evaluation before deployment.

Stakeholders are the fleet's single operator, who registers the App, populates one credential slot, and approves the ruleset diff, and the orchestrator identity `cameronraysmith`, which is the only identity that labels pull requests and the only human bypass actor.

## Goals / Non-Goals

**Goals:**

A gitea-mq instance on magnetite, served at `mq.scientistexperience.net` over TLS, deployed by `clan machines update magnetite`.
The four R12 settings in force and pinned by an assertion that fails host evaluation on drift.
A dedicated GitHub App with exactly the R15 permission and event set, its credentials supplied through clan vars with no value in the repository.
Rulesets on `cameronraysmith/vanixiets` per R16, applied by the operator from an approved diff, with the `allow_auto_merge` question settled.
Runtime confirmation of V2 and V3 and the observation for V6 recorded in this change's verification.

**Non-Goals:**

The landing protocol, the `030-stacked-landing-protocol` instructions, the `git-stacked-pr-integration` skill, `landing.toml`, and `nixbot.toml`.
A second repository in the allowlist.
The `refs/landings/*` provenance mechanism beyond recording what rulesets can and cannot do for it.
Any change to nixbot's App, aspect, generators, vhost, or database, or to buildbot's.
Any upstream filing to gitea-mq.

## Decisions

### D1: Compose gitea-mq the way this repository composes nixbot

- **Choice**: add the `gitea-mq` flake input following `nixpkgs` and `treefmt-nix`, import `inputs.gitea-mq.nixosModules.default` at the host in `modules/machines/nixos/magnetite/default.nix` beside `inputs.nixbot.nixosModules.nixbot`, and put the site configuration in a new aspect `flake.modules.nixos.gitea-mq` at `modules/nixos/gitea-mq.nix`, named in the host's aspect list after `nixbot`.
- **Rationale**: this is the nixbot precedent line for line; the module's flake declares exactly `nixpkgs` and `treefmt-nix` as inputs, so both follow this repository's; and the deployed unit stays a function of the host's generation.
- **Alternatives considered**: clan-infra's wrapper form `flake.nixosModules.gitea-mq = [ upstream ./gitea-mq.nix ]`, rejected as a second composition convention beside an existing one.
- **Boundary**: vendored-versus-first-party. `nix/module.nix` is consumed through the input and never edited; the aspect is first-party and the only place site configuration lives.

### D2: The four settings are module options, the label is a default, and an assertion pins all four

- **Choice**: `batchMax = 0`, `skipQueueIfUpToDate = true`, `requiredChecks = [ "nixbot/nix-eval" "nixbot/nix-build" ]`; no value for the merge label; `assertions` in the aspect that read `config.services.gitea-mq.batchMax`, `.skipQueueIfUpToDate`, and `.requiredChecks` from the merged configuration and compare them to those values, plus one asserting `!(config.systemd.services.gitea-mq.environment ? GITEA_MQ_MERGE_LABEL)`.
- **Rationale**: the module maps the three options straight to `GITEA_MQ_BATCH_MAX`, `GITEA_MQ_SKIP_QUEUE_IF_UP_TO_DATE`, and `GITEA_MQ_REQUIRED_CHECKS`; `GITEA_MQ_MERGE_LABEL` is not an option, the module's `environment` set is closed, and `config.go::Load` defaults the label to `merge-queue`, so the only drift possible is an override from another module, which is what the fourth assertion detects. The assertions read the merged configuration, so an `lib.mkForce` elsewhere or a one-sided edit fails `checks.x86_64-linux.nixos-magnetite` at evaluation. The ADR's Compliance item allows a flake check or a module assertion; the assertion needs no new check attribute.
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

### D6: A dedicated GitHub App with the R15 set, registered at a human gate

- **Choice**: a second App with repository permissions Contents read and write, Administration read and write, Checks read and write, Pull requests read and write, Commit statuses read, Metadata read, and events `pull_request`, `check_run`, `status`, `installation`, `installation_repositories`; proposed name `sciexp-gitea-mq`, owner `sciexp`, public, installed on `cameronraysmith/vanixiets` alone; its numeric id written into the aspect as `github.appId`.
- **Rationale**: this is R15 and the README's "GitHub setup" section verbatim, the only place gitea-mq states its permission set. Contents write and Administration write are permissions the build service must never hold, and adding them to `sciexp-nixbot` would edit a registration a running service depends on. The name and owner mirror the sibling and are the operator's to change at the gate.
- **Alternatives considered**: reusing `sciexp-nixbot`, rejected above. Registering without Administration so that `EnsureRepoSetup` is skipped, rejected because R15 fixes the set and the ADR relies on setup to keep the App a bypass actor on every branch ruleset.
- **Trust boundary**: the installation selection is externally maintained forge state, not a restriction enforced by this NixOS configuration. D11 requires complete external verification of the one-repository installation scope before deployment authorization.

### D7: Rulesets require only `gitea-mq`, and the existing nixbot requirement is removed

- **Choice**: the default-branch ruleset on `cameronraysmith/vanixiets` requires linear history and the `gitea-mq` status pinned to the new App's integration id, names the gitea-mq App (`Integration`) and the orchestrator identity (`User`, beside the existing repository-admin role) as bypass actors, retains the `deletion` and `non_fast_forward` rules, drops the `nixbot/nix-build` required check, and involves no Actions workflow. The diff is presented before it is applied, and it is applied before the service first starts.
- **Rationale**: `monitor.go::ResolveRequiredChecks` uses the forge's list when it is non-empty and falls back to `GITEA_MQ_REQUIRED_CHECKS` only when it is empty, and `forge.go::GetRequiredChecks` builds the forge's list from rulesets and classic protection minus gitea-mq's own contexts. A ruleset still requiring `nixbot/nix-build` makes the forge's list `[nixbot/nix-build]`, and `nixbot/nix-eval` is never consulted. With only `gitea-mq` required, the forge's list is empty and the configured pair is operative. Applying the diff before first start means `EnsureRepoSetup` finds a ruleset named `gitea-mq` and returns rather than creating a second one beside `nixbot`. `User` is an accepted bypass actor type per GitHub's 2026-05-07 rulesets changelog.
- **Alternatives considered**: requiring both nixbot contexts in the ruleset so the forge's list equals the configured pair, rejected because it makes the pin live in two places and puts a PR-level check requirement on every pull request, which R16 excludes. Letting startup create the `gitea-mq` ruleset and then deleting `nixbot`, rejected because it leaves an interval with two rulesets and no approval.
- **V6 note**: rulesets target branches, tags, pushes, or the repository, not arbitrary ref namespaces, so no ruleset can protect `refs/landings/*` from deletion; whether GitHub accepts a push to that namespace from the orchestrator is a runtime observation recorded in this change.

### D8: `allow_auto_merge` stays on; the orchestrator is its sole enabler

- **Choice**: the repository setting is left as `EnsureRepoSetup` sets it, `true`, and the design records the orchestrator identity as the sole identity that enables auto-merge on a pull request.
- **Rationale**: R16 says off or sole enabler. Off is not attainable while the App holds Administration write: `setup.go::EnsureRepoSetup` sets `AllowAutoMerge: true` at every startup. The repository is user-owned with one collaborator, so the identities that can enable auto-merge are the orchestrator and Apps holding Pull requests write; the sole-enabler arm holds by the collaborator set, which the verification task records. `allow_auto_merge` is already `true` on the repository today, so nothing observable changes.
- **Alternatives considered**: a post-start job that turns the setting off, rejected because it races the next restart and makes the state depend on timing. Removing Administration from the App, rejected under D6.
- **Trust boundary**: the collaborator set is world state; the machine cannot assert it.

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

[Risk] A later change edits one of the four settings, or another module forces one, and the queue silently lands merge commits or gates on one context → Mitigation: D2's assertions read the merged configuration and fail host evaluation, which `checks.x86_64-linux.nixos-magnetite` and every deployment run.

[Risk] The ruleset keeps a nixbot requirement and gitea-mq drops `nixbot/nix-eval` without any error → Mitigation: D7 removes it, the G2 diff shows the removal explicitly, and the runtime task reads the queue's resolved required-check list from its log.

[Risk] Peer authentication fails because the role name and the dynamic user name diverge → Mitigation: D3 records the coupling; the deployment task checks the unit's log for a successful migration rather than inferring from the role's existence.

[Risk] Certificate issuance fails at activation because the DNS record is absent or proxied → Mitigation: D10 applies and verifies the record before the host is deployed.

[Risk] The App's Contents write and Administration write are installed more broadly than intended → Mitigation: D11 requires complete external evidence of installation on `cameronraysmith/vanixiets` alone before deployment authorization. Missing or incomplete evidence blocks authorization, and broader installation is a boundary violation, not a condition filtered by `github.repos`. The explicit list remains one repository but supplies no machine-side confinement.

[Risk] A pull request with auto-merge enabled enters the queue without a label → Mitigation: D8 records the collaborator set that bounds who can enable it; the world assumption carries the violation condition.

[Risk] Startup's `EnsureRepoSetup` creates a second ruleset because the approved diff was not applied first → Mitigation: the migration order applies the diff before the first `clan machines update`, and the runtime task lists rulesets after startup.

[Risk] GitHub does not mark fast-forwarded stack members merged (V1) → Mitigation: outside this change's discharge; recorded as a world assumption whose violation voids the landing protocol's reliance on it, for the protocol change to test.

[Trade-off] The assertion guards evaluation only, not the running process → accepted; runtime tasks read the unit's environment on the host, and a process started outside the unit is not something a NixOS assertion can see.

[Trade-off] `allow_auto_merge` on is a second enqueue path → accepted, because off is unattainable under R15 and the collaborator set bounds it.

[Trade-off] A second App with write and administration permissions is a second high-privilege registration to hold → accepted, because the queue cannot update refs or maintain rulesets without them, and the build service must not hold them.

## Migration Plan

Deployment order, each step reviewable.
G1: present the App registration values and the credential commands, and wait for the operator to register the App, generate its private key, install it on `cameronraysmith/vanixiets`, and set the private key with `clan vars set`.
Add the flake input and lock it.
Write the aspect with both generators, the service configuration, the PostgreSQL provisioning, the vhost, and the assertions; name it in the host's aspect list and import the upstream module at the host.
Generate the webhook secret.
Instantiate the host's configuration as a check.
Apply the DNS record and confirm resolution.
G2: present the ruleset diff for `cameronraysmith/vanixiets` and wait for approval; apply it.
Deploy with `clan machines update magnetite`.
Confirm the service's own setup left the rulesets as approved, that the App's webhook URL was patched by the service, and the V2, V3, and V6 observations.

Rollback is the ordinary one: remove `gitea-mq` from the host's aspect list and redeploy, which withdraws the unit, the vhost, and the assertions.
The database and role, the cache directory, the credential entries, the App registration, and the ruleset persist after such a rollback; the ruleset in particular still requires `gitea-mq`, so a rollback of the service without a rollback of the ruleset leaves the default branch landable only by a bypass actor, and the G2 diff records the reverse edit for that case.

Acceptance is the integration verification in tasks.md: the hostname serves over TLS, the unit is running with the four settings visible in its environment, the database exists owned by its role and the schema is migrated, the App's webhook URL reads the service's endpoint, the ruleset matches the approved diff, and a labeled up-to-date pull request whose tip already carries both nixbot contexts is landed by fast-forward.

## Gate 1 modality verdicts

This table is the pre-apply spec-and-feature alignment record.
It carries one row per requirement in this change's three delta specs, with the capability's stratum tag from the proposal and the modality that witnesses the requirement.

No row routes to a Gherkin scenario, so this change lays out no `.feature` file.
The repository has no BDD runner, and every observable this change asserts is either a property of the evaluated NixOS configuration, which `nix eval` witnesses, or an observation against a deployed host or the forge, which the integration verification witnesses as a smoke test.

| Requirement | Capability | Stratum | Modality | Witness |
|---|---|---|---|---|
| A merge queue is reachable at its own hostname | `merge-queue-service` | behavioral | smoke (deployment) | tasks 11.1 |
| One up-to-date stack lands by fast-forward | `merge-queue-service` | behavioral | build gate (`nix eval`) and smoke (deployment) | tasks 4.2, 11.7 |
| The queue gates on the build service's verdicts and nothing else | `merge-queue-service` | behavioral | build gate (`nix eval`) and smoke (forge) | tasks 4.2, 8.3, 11.5 |
| The queue acts under its own identity | `merge-queue-service` | behavioral | smoke (forge) | tasks 1.2, 1.4 |
| Only the orchestrator puts a change into the queue | `merge-queue-service` | behavioral | recorded collaborator set | tasks 8.4 |
| Queue credentials are operator-supplied and never legible in the repository | `merge-queue-service` | behavioral | content search and build gate (`nix eval`) | tasks 3.3, 3.1 |
| One activation establishes the queue | `merge-queue-service` | behavioral | smoke (deployment) | tasks 9.1, 11.1 |
| Landing settings cannot drift unnoticed | `merge-queue-service` | behavioral | build gate (`nix eval`, negative control) | tasks 4.3 |
| A distinct hostname is served over TLS to a loopback listener | `merge-queue-interface` | interface | build gate (`nix eval`) and smoke (deployment) | tasks 4.1, 11.1 |
| The four landing settings are evaluated values guarded by an assertion | `merge-queue-interface` | interface | build gate (`nix eval`, negative control) | tasks 4.2, 4.3 |
| A database and role exist for the unit's dynamic user | `merge-queue-interface` | interface | build gate (`nix eval`) and smoke (deployment) | tasks 4.1, 11.3 |
| Credentials exist only as activation-resolved systemd credentials | `merge-queue-interface` | interface | build gate (`nix eval`) and smoke (deployment) | tasks 3.1, 9.1 |
| The forge application holds exactly the queue's permission and event set | `merge-queue-interface` | interface | smoke (forge) | tasks 1.2 |
| The default branch is governed by the queue's ruleset | `merge-queue-interface` | interface | smoke (forge) | tasks 8.3, 11.4 |
| The service registers its own webhook endpoint | `merge-queue-interface` | interface | smoke (forge) | tasks 11.2 |
| The service is a consequence of the host's declared configuration | `merge-queue-interface` | interface | build gate (`nix eval`) | tasks 7.1 |
| This capability states its own trust boundary | `merge-queue-interface` | interface | capability text and documentation | specs text, tasks 10.1 |
| A22 — gitea-mq resolves stacks only through the Stacks API | `world-assumptions` | world | violation-condition witness | its own scenario |
| A23 — GitHub marks a fast-forwarded stack member merged | `world-assumptions` | world | violation-condition witness | its own scenario |
| A24 — gitea-mq enqueues auto-merge-enabled pull requests and enables `allow_auto_merge` | `world-assumptions` | world | violation-condition witness | its own scenario |
| A25 — gitea-mq takes required checks from the forge's protection first | `world-assumptions` | world | violation-condition witness | its own scenario |
| Grounded vocabulary for behavioral requirements | `world-assumptions` | world | designation table and its lint | the table itself |

No row carries an `est-property`, `est-contract`, or `est-symbolic` modality, so this change carries no executable-specification-testing obligation.

## Open Questions

Whether the operator wants the App owned by `sciexp` and public, as `sciexp-nixbot` is, or owned by `cameronraysmith`; either works for a user-owned repository and the G1 gate is where it is decided.

Whether the `User` bypass actor for `cameronraysmith` is wanted beside the repository-admin role that already covers the owner, or whether the admin role alone is the orchestrator identity's bypass; the G2 diff proposes both and the operator chooses.

Whether GitHub accepts a push to `refs/landings/*` from the orchestrator identity at all (the accept half of V6); no ruleset can protect that namespace, and the observation is recorded either way.

The `world-assumptions` designation table is modified by this change and by `stand-up-nixbot-on-magnetite`, which is In Review and not yet archived; archive applies MODIFIED by full-text replacement, so this change's table carries the union of the corpus rows, the sibling's rows, and its own, and whichever change archives second must carry the other's rows or lose them.

## Context

Magnetite is a Hetzner CX53 cloud host (16 vCPU, 32 GiB, ZFS on one disk with a 250 G quota on `/nix`) that already carries most of this fleet's server-side services: buildbot-nix, gitea, gitea-actions-runner, kanidm, matrix, niks3, cognee, the SSO gateway, and omnigraph.
Its composition is the repository's ordinary deferred-module pattern: `flake.nix:5` hands `modules/` to `import-tree`, each aspect file assigns a deferred module into `flake.modules.nixos.<aspect>`, `modules/machines/nixos/magnetite/default.nix:38-51` names the aspects this host takes, and `modules/clan/machines.nix:29-31` binds the resulting machine namespace into `clan.machines.magnetite`, which is what `clan machines update magnetite` deploys.
The incumbent build service sits in that pattern twice over: the `buildbot` aspect at `modules/nixos/buildbot.nix:20` carries the site configuration, and the upstream master and worker modules are imported directly at the host (`modules/machines/nixos/magnetite/default.nix:35-36`).

nixbot is the successor to buildbot-nix by the same maintainer, collapsing the master and worker pair into one service that evaluates with a bundled nix-eval-jobs, builds through the host nix daemon, and scales out through ordinary nix remote builders.
Its option surface is `services.nixbot.*` in `nixosModules/nixbot.nix`, with `nixosModules.buildbot-nix`, `buildbot-master`, and `buildbot-worker` retained as deprecated aliases that warn.
Roughly twenty options map one-for-one from buildbot-nix, and the migration surface is narrower than it looks: workers and `workersFile` are gone, `dbUrl` becomes `database.*` with no history carryover, `authBackend` and the oauth2-proxy `accessMode` are deleted, commit statuses become check runs, per-repository webhooks become one application-level webhook needing two further events and a further permission, and `admins` entries become provider-qualified.

Two constraints frame every decision below.
First, buildbot stays authoritative for every repository and must keep working untouched; this is what separates this change from both reference deployments, each of which replaced buildbot and could therefore inherit its identity, its check names, and its branch-protection rules.
Second, the deliverable is a deployment provable by `clan machines update magnetite`, which rules out any shape where the running service is not a function of the machine's NixOS generation.

Stakeholders are the fleet's single operator, who registers the forge application and populates two credential slots by hand, and the repositories whose CI will later migrate — none of which this change touches.

## Goals / Non-Goals

**Goals:**

A nixbot instance on magnetite, served at `nixbot.scientistexperience.net` over TLS, deployed by `clan machines update magnetite`.
The incumbent buildbot server at `buildbot.scientistexperience.net` continuing to serve, with its module, aspect entry, credentials, vhost, database, and repository-root configuration file unedited.
A service that builds no repository until a later change opts one in, with that boundary stated honestly rather than claimed as a guarantee.
Verdicts published under a namespace distinct from the incumbent's, so no forge-side required check silently changes meaning.
Credentials supplied through the fleet's existing clan vars mechanism, with no credential value in the repository.

**Non-Goals:**

Migrating vanixiets' own CI onto nixbot.
Finishing python-nix-template's migration, which never completed onto buildbot-nix and now retargets to nixbot.
Migrating ironstar.
Retiring buildbot, or altering anything about it, including its `buildbot-nix.toml`.
Adopting Mic92's flakelet runtime deployment shape.
Multi-architecture builds: aarch64 work would come from the host's remote-builder configuration, which this change does not alter.

## Decisions

### D1: Compose nixbot the way this repository already composes buildbot

- **Choice**: add the `nixbot` flake input, import `inputs.nixbot.nixosModules.nixbot` at the host in `modules/machines/nixos/magnetite/default.nix`, and put the site configuration in a new aspect `flake.modules.nixos.nixbot` at `modules/nixos/nixbot.nix`, named in the host's aspect list.
- **Rationale**: this is the existing buildbot precedent in this repository line for line (`modules/machines/nixos/magnetite/default.nix:35-36, 43`; `modules/nixos/buildbot.nix:20`), it matches nixbot's documented NixOS surface, and it keeps the deployed service a function of the machine's generation, which is what makes `clan machines update magnetite` the acceptance test.
- **Alternatives considered**: Mic92's flakelet shape at dotfiles HEAD, where nixbot's units are evaluated from the nixbot flake on the machine at runtime — rejected because it needs three further single-maintainer inputs and a push-deploy path over step-ca SSH certificates, and because it deliberately decouples what runs from the NixOS generation, which would make the named acceptance criterion untrue by construction. clan-infra's wrapper form, `flake.nixosModules.nixbot = [ upstream ./nixbot.nix ]` — rejected as a second composition convention beside an existing one; the same result is reached with this repository's own idiom.
- **Boundary**: this decision sits on the vendored-versus-first-party boundary. The upstream module is vendored surface consumed through a flake input and never edited; the aspect file is first-party and is the only place site configuration lives.

### D2: A dedicated forge application, not the incumbent's

- **Choice**: register a second GitHub App for nixbot, with its own application id, private key, webhook secret, and interface-login client.
- **Rationale**: nixbot requires check-run write access, pull-request read access, and the `check_run` and `check_suite` events, none of which buildbot-nix asks for. Adding them to the incumbent's application edits a registration the running service depends on. One shared application would also give both services one identity, one application-level webhook, and one coupled permission history.
- **Alternatives considered**: reuse, which is exactly what the closest reference deployment did — the same application id, the same interface client id, and the same three credential names survived its migration untouched. That evidence is sound for replacement and inverts under coexistence, because there the incumbent stopped existing on the same day.
- **Cost accepted**: one further registration and one further credential set to rotate.

### D3: Three independent boundaries keep the new service from building anything

- **Choice**: bound repository visibility by the forge application's installation selection; set the topic-based auto-import to null; and set an explicit repository allowlist naming exactly the intended set.
- **Rationale**: the topic filter defaults to the same topic buildbot's repositories already carry and performs a one-shot import against an empty database, so the default would sweep in precisely the repositories the incumbent already builds and double-build them. The three boundaries are independent, so a mistake in one does not by itself produce a build.
- **Alternatives considered**: relying on the allowlist alone — rejected because the auto-import runs against an empty database, which is exactly the state on the day of first deployment. Relying on the installation selection alone — rejected because it lives in a web UI outside anything this repository can assert or review.
- **Boundary**: the first of the three sits outside the machine entirely, which is why the interface capability states it as a boundary rather than a property, and why nothing here is claimed end to end.

### D4: Keep the default verdict namespace

- **Choice**: leave the status-context prefix at its default, `nixbot`.
- **Rationale**: the forge's required checks currently name the incumbent's contexts. A prefix collision would either capture those names or make two services fight over one verdict. Keeping the default makes the new service's verdicts advisory by construction rather than by promise.
- **Alternatives considered**: adopting the incumbent's prefix, which both reference deployments did — correct in each case because nixbot had inherited branch-protection rules from a service that no longer ran, and wrong here for the same reason.

### D5: Module-managed vhost with ACME asked for explicitly, and no TCP port

- **Choice**: leave the module's nginx integration enabled and set its ACME flag true, so the vhost for the new hostname is created, `forceSSL` with its own certificate, proxying to the service's unix socket.
- **Rationale**: the module's nginx integration defaults on but its ACME flag defaults off, and every other vhost on this host is `forceSSL` plus `enableACME` against one shared ACME account, so the flag reproduces the house pattern rather than inventing one. Leaving nginx enabled also keeps the service off TCP entirely; the module binds a TCP port only when its nginx integration is disabled, and that port's default happens to equal the nixpkgs buildbot default, so disabling nginx would manufacture the single port collision available on this host.
- **Alternatives considered**: a hand-written vhost with the module's nginx integration disabled — rejected as more configuration for a worse result, since it would reintroduce a TCP listener and duplicate what the module already emits.

### D6: The new hostname is declared where every other one is

- **Choice**: add a `nixbot` CNAME to the terranix Cloudflare module, unproxied, following the existing `buildbot` record, applied with the repository's terraform recipes before the host is deployed.
- **Rationale**: DNS for this zone is declarative in-repo, and the existing records are unproxied precisely so ACME's HTTP challenge reaches the host. Certificate issuance happens during activation, so the record must exist first; this is the one ordering constraint in the deployment.
- **Alternatives considered**: a record added by hand in the provider's UI — rejected as undeclared state in a repository whose whole premise is the opposite.

### D7: The new service's database joins the host's single PostgreSQL instance

- **Choice**: use the module's local-database path, which adds a database and role named for the service and connects over the local socket.
- **Rationale**: the host runs exactly one PostgreSQL instance, additively configured by five services already, loopback and socket only. The module's local path merges into it rather than standing up a second instance. There is no history to carry over, and none is wanted: the incumbent keeps its own database untouched.
- **Alternatives considered**: a separate instance on another port — rejected as unjustified for a service that needs one database on a host that already runs one instance well.

### D8: Credentials as clan vars generators named for their consumer

- **Choice**: three generators — the application private key and the interface-login secret as operator-populated slots, the webhook secret generated — each consumed as a file path and restarting the service on rotation.
- **Rationale**: clan vars is this fleet's primary secrets system, the incumbent's six generators are the in-repo pattern, and the service takes every secret as a file path which it passes to its unit as a systemd credential, so the shapes already match. The unit snapshots credentials at start, so rotation without a restart would leave a stale value; naming the service in each generator's restart list is therefore not optional.
- **Alternatives considered**: legacy sops-nix, which this fleet retains only for supplementary user secrets — rejected as the non-primary mechanism for a machine-side service credential.
- **Boundary**: this decision sits on the source-versus-delivered boundary. The generator declaration is source; the file the service reads exists only after activation, so verification is by inspecting the deployed path, never by reading the repository.

### D9: Size the new service against the capacity the incumbent already uses

- **Choice**: set the eval worker count and per-worker memory explicitly, and restrict build systems to the host's own platform.
- **Rationale**: names are the easy part — units, users, groups, databases, state directories, and GC-root families are disjoint between the two stacks by construction, confirmed row by row. What is shared is finite: 32 GiB against the incumbent's four eval workers at 2 GiB each, one nix store under a 250 G quota with a free-space reaper and a seven-day collection window, one nginx, one PostgreSQL, one ACME account, and one sandbox tree that a prior disk incident on this host already made vivid. Defaults derived from core count would size the new service as though it were alone.
- **Alternatives considered**: accepting defaults and observing — rejected because the observation would be an incident on the host that also serves the fleet's forge and chat.

### D10: The repository-root per-repository configuration file stays exactly as it is

- **Choice**: no change to `buildbot-nix.toml`, and no `nixbot.toml` added.
- **Rationale**: the file is upstream buildbot-nix's own convention, and nixbot still parses that exact filename with the same schema plus one additional key. The expectation that it was the artifact that would not carry over is refuted; it is one of the things that carries over most cleanly. A `nixbot.toml` becomes meaningful only once a repository is actually built by nixbot, which is a later change.

### D11: The `world-assumptions` delta carries the whole designation table, including rows nixbot has no use for

- **Choice**: keep this change's `MODIFIED` block for `Grounded vocabulary for behavioral requirements` a superset of the corpus table as it stands at archive time — currently all 54 rows, including the eight about laptop suspend, inactivity, wake sources, panels, login screens, desktop sessions, settings panels, and power sources that `pyrite-never-sleep` contributed and that have no bearing on a build service.
- **Rationale**: a `MODIFIED` block is full replacement content, not a patch, and this requirement is shared with every other change that grounds vocabulary. A delta carrying only this change's own terms replaces the corpus table wholesale on archive and deletes every other change's rows — silently, with no error and no conflict, because a shorter table is still well-formed. That is the regression repaired on 2026-09-09; the method and the before-and-after row sets are in `logs/nixbot-world-assumptions-superset-repair.md`, and the eight rows originate in `openspec/changes/archive/2026-09-09-pyrite-never-sleep/`.
- **Maintenance obligation**: if any further change modifies this requirement and archives before this one, refresh this delta from `openspec/specs/world-assumptions/spec.md` before archiving nixbot. Trimming rows that look irrelevant to nixbot is the defect, not the cleanup.

## Risks / Trade-offs

[Risk] Capacity contention on a 32 GiB host: two eval-and-build services drawing from one memory pool, one nix store under quota, and one sandbox tree, with a prior disk incident as precedent → Mitigation: D9 sizes the new service explicitly rather than by core count; the service builds nothing on the day it lands (D3), so contention begins only when a later change opts a repository in, and that change owns re-observing the budget.

[Risk] Certificate issuance fails at activation because the DNS record is absent or proxied → Mitigation: D6 makes the record declarative and unproxied, and the task order applies DNS and verifies resolution before the host is deployed.

[Risk] The topic-based auto-import runs against an empty database and adopts the incumbent's repositories → Mitigation: D3's three independent boundaries, of which the topic setting is the one that directly disables this specific behavior.

[Risk] A verdict-name collision changes what a forge-side required check means → Mitigation: D4 keeps the namespaces distinct; the incumbent's contexts are never emitted by the new service.

[Risk] The operator populates a credential slot and the service holds the stale value → Mitigation: D8 names the service in each generator's restart list, because the unit snapshots credentials at start.

[Risk] The upstream module's documentation claims an option-rename translation layer from buildbot-nix that this revision does not implement → Mitigation: the new service is configured under its own option namespace only; the incumbent keeps its own module and namespace, so the two never meet and the stale claim cannot bite.

[Trade-off] Two services doing the same job on one host is duplicated capability and duplicated draw → accepted, because the alternative is the cutover this change deliberately is not.

[Trade-off] A service that builds nothing is unexercised beyond its own health on the day it lands → accepted, because opting the first repository in is a reviewable decision that belongs to a later change.

[Trade-off] A second forge application is a second registration and credential set to hold → accepted, because it is what leaves the incumbent's registration untouched.

## Migration Plan

Deployment order, each step reviewable and none of them touching the incumbent.
Register the forge application and record its identifiers, since two credential slots cannot be populated before it exists.
Add the flake input.
Declare the three credential generators and populate them, so activation has something to resolve.
Write the aspect and name it in the host's aspect list, alongside importing the upstream module at the host.
Apply the DNS record and confirm resolution, because certificate issuance depends on it.
Build the host's configuration as a check before deploying it.
Deploy with `clan machines update magnetite`.

Rollback is the ordinary one for this fleet and is what makes the sequence safe: remove the aspect from the host's list and redeploy, which withdraws the unit, the vhost, and the socket while leaving the incumbent untouched throughout.
The database and role, the state directory, and the credential entries persist after such a rollback and are harmless; removing them is a deliberate cleanup, not part of a rollback.

Acceptance is the integration verification in tasks.md: the new hostname serves over TLS, the incumbent's hostname still serves, the service's unit is running with an empty project list, a webhook delivery is accepted and authenticated, and both databases exist on the one instance.

## Gate 1 modality verdicts

This table is the pre-apply spec-and-feature alignment record required by `openspec-bdd-bridge`.
It carries one row per requirement in this change's three delta specs, with the capability's stratum tag from the proposal and the modality that actually witnesses the requirement.

No row routes to a Gherkin scenario, so this change lays out no `.feature` file.
Two independent facts produce that outcome.
The repository has no BDD runner at all — no pytest-bdd, cucumber, or behave dependency, and no `.feature` file anywhere in the tree — so a laid-out scenario would be an unbound acceptance surface that nothing executes, which is the drift the bridge skill exists to prevent.
And every observable this change asserts is either a property of the evaluated NixOS configuration, which `nix eval` and `nix build` witness directly, or an observation against a deployed host, which the integration verification in tasks.md group 10 witnesses as a deployment smoke test; a Gherkin step wrapping either one would add a binding layer without adding a witness.

Stratum also constrains the routing before proposition class does.
A `world`-stratum requirement never routes to a scenario: its witness is the violation condition already stated in its own spec.
An `interface`-stratum requirement is witnessed at the machine boundary rather than through domain-language mediation, which here means an evaluation gate or a host observation.

| Requirement | Capability | Stratum | Modality | Witness |
|---|---|---|---|---|
| A second build service is reachable at its own hostname | `nixbot-build-service` | behavioral | smoke (deployment) | tasks 10.1 |
| The incumbent build service continues to serve | `nixbot-build-service` | behavioral | smoke (deployment) | tasks 10.2, 5.2 |
| Repositories are built only once opted in | `nixbot-build-service` | behavioral | build gate (`nix eval`) and smoke (deployment) | tasks 4.1, 10.3 |
| Deliveries a build service acts on are authenticated | `nixbot-build-service` | behavioral | smoke (deployment) | tasks 10.4 |
| A second build service's verdicts do not gate merges | `nixbot-build-service` | behavioral | build gate (`nix eval`) and smoke (deployment) | tasks 4.2, 10.6 |
| Forge credentials are operator-supplied and never legible in the repository | `nixbot-build-service` | behavioral | secret scan and build gate (`nix eval`) | tasks 3.3, 4.1 |
| One activation establishes the second build service | `nixbot-build-service` | behavioral | smoke (deployment) | tasks 8.1, 10.1 |
| A second build service is sized against the capacity the incumbent uses | `nixbot-build-service` | behavioral | recorded design argument and capacity baseline | design D9, tasks 10.7 |
| A distinct hostname is served with its own certificate | `build-service-interface` | interface | build gate (`nix eval`) and smoke (deployment) | tasks 5.3, 10.1 |
| The two build services hold disjoint host resources | `build-service-interface` | interface | build gate (`nix eval`) and smoke (deployment) | tasks 5.3, 10.5 |
| Repository visibility is bounded outside the machine and narrowed within it | `build-service-interface` | interface | build gate (`nix eval`); outermost boundary not machine-assertable | tasks 4.1, 1.2 |
| Deliveries are accepted only at an authenticated endpoint | `build-service-interface` | interface | smoke (deployment) | tasks 10.4 |
| Verdict namespaces are distinct | `build-service-interface` | interface | build gate (`nix eval`) | tasks 4.2 |
| Credentials exist only as activation-resolved paths | `build-service-interface` | interface | build gate (`nix eval`) and secret scan | tasks 3.1, 3.3 |
| The service is a consequence of the host's declared configuration | `build-service-interface` | interface | build gate (`nix build`) | tasks 7.1 |
| This capability states its own trust boundary | `build-service-interface` | interface | capability text and documentation | specs text, tasks 9.1 |
| A9 — forge installation selection and delivery authentication | `world-assumptions` | world | violation-condition witness | its own scenario |
| A10 — hostname resolution and certificate issuance | `world-assumptions` | world | violation-condition witness | its own scenario |
| A11 — finiteness of one host's build capacity | `world-assumptions` | world | violation-condition witness | its own scenario |
| A12 — the forge decides which verdict gates a merge | `world-assumptions` | world | violation-condition witness | its own scenario |
| Grounded vocabulary for behavioral requirements | `world-assumptions` | world | designation table and its lint | the table itself |

No row carries an `est-property`, `est-contract`, or `est-symbolic` modality, so this change also carries no executable-specification-testing obligation and lays out no EST artifact.

## Open Questions

Whether the forge application can be installed with no repositories selected at all, or whether the provider requires at least one selection, which would make the allowlist and the disabled auto-import the operative boundaries on day one.
This is a property of the provider's UI, recorded as an assumption to check during implementation rather than asserted here; either answer is compatible with the requirements, and the task order verifies the actual project list after deployment rather than inferring it.

Whether the interface-login client is wanted at all on day one, since a service that builds nothing has little to show a logged-in viewer.
The credential pair is asserted together by the upstream module, so it is either both or neither; this change plans both, and dropping to neither is a smaller edit than adding one later.

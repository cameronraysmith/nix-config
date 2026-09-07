<!--
Raw capture of the brainstorming step for this change.

Procedural note, recorded rather than elided: the interactive `superpowers:brainstorming`
dialogue was NOT run. This change was authored by an autonomous session whose launch brief
pre-settled the scope from the ADR and its review memo and instructed it not to wait for a
human, so the schema-sanctioned manual-write path was taken. What follows is the decision
log the interactive skill would have produced: the questions that had to be answered, the
options for each, the answer taken, and the evidence it rests on. Questions whose answer
arrived pre-settled from the ADR or the launch brief are marked `[given]`; the rest were
decided from source evidence and are marked `[decided]`, with the evidence cited inline.
-->

# Background

The ADR `docs/notes/development/version-control/adr-substitution-first-rollup-landing.md` decides that changes land as bors-style rollups: an orchestrator knits ready changes into one linear mergify stack, nixbot builds the stack tip once on `staging`, the stack is published with `mergify stack push --github-native`, its top PR is labeled `merge-queue`, and gitea-mq fast-forwards `main` to the tip through GitHub's non-force ref update.
The queue role in that design is gitea-mq, and no instance of it exists in the fleet.
This change stands one up on magnetite, at `mq.scientistexperience.net`, with the settings the ADR fixes, the GitHub App it needs, the repository rulesets it lands through, and an automated check that pins its settings.

The review memo `adr-substitution-first-rollup-landing-review.md` classifies the ADR's Appendix A and assigns this change R12, R15, R16, and the second automated Compliance item, plus three world-assumption entries about gitea-mq and GitHub.
It also settles V9 from source: `batchMax`, `requiredChecks`, and `skipQueueIfUpToDate` are first-class options of gitea-mq's NixOS module, the merge label is not exposed but defaults to `merge-queue` in `config.go::Load`, and no environment escape hatch exists in the module.

The sibling change `stand-up-nixbot-on-magnetite` is the shape to match.
It composed nixbot onto magnetite through the repository's deferred-module pattern: a flake input, the upstream module imported at the host in `modules/machines/nixos/magnetite/default.nix`, a first-party aspect `flake.modules.nixos.nixbot` in `modules/nixos/nixbot.nix` named in the host's aspect list, clan vars generators for the App private key and webhook secret, and a `nixbot` CNAME in `modules/terranix/cloudflare.nix`.
nixbot now serves `cameronraysmith/vanixiets` and `sciexp/ironstar` from magnetite, and the repository's default branch is governed by ruleset `16212553`, named `nixbot`, whose sole required status check is `nixbot/nix-build` pinned to integration `4743700`, with repository admins as its only bypass actor.

The gitea-mq source read for this change is the clone at `~/ghq/github.com/Mic92/gitea-mq` at `d44c455` (2026-09-03), the revision the ADR pins, and the verification report `logs/adr-verify/gitea-mq.md`.
Two reference deployments of the module exist and were read: Mic92's own `dotfiles/machines/eve/modules/gitea-mq.nix` (GitHub backend, clan vars) and clan-infra's `modules/web01/gitea-mq.nix` (Gitea backend).

# Decision chain

## Q1 [given]: what is in scope, and what is not?

In scope: the gitea-mq service on magnetite with the four settings from R12; a separate GitHub App with the permission and event set from R15; repository rulesets per R16 together with a decision about `allow_auto_merge`; a NixOS assertion pinning the settings, per the second automated Compliance item; and the verification items V2, V3, V6, and V9.
`cameronraysmith/vanixiets` is the first and only repository in the allowlist.

Out of scope: the landing protocol, agent instructions, `landing.toml`, `nixbot.toml`, and everything in Appendix B.
No upstream filing to gitea-mq will be made anywhere in this work, per the maintainer, so the merge-label option gap and the absent database provisioning are handled in this repository rather than requested upstream.

## Q2 [decided]: how is gitea-mq composed onto magnetite?

Taken: the repository's own pattern, mirrored from nixbot.
A `gitea-mq` flake input following `nixpkgs` and `treefmt-nix` (the module's flake declares exactly those two inputs, `gitea-mq/flake.nix`), `inputs.gitea-mq.nixosModules.default` imported at the host beside `inputs.nixbot.nixosModules.nixbot`, and a first-party aspect `flake.modules.nixos.gitea-mq` in `modules/nixos/gitea-mq.nix` named in magnetite's aspect list.

clan-infra's wrapper form, `flake.nixosModules.<name> = [ upstream ./site.nix ]`, was rejected for the reason the nixbot change already recorded: it is a second composition convention beside an existing one.
The vendored-versus-first-party boundary sits at the flake input: `nix/module.nix` is consumed and never edited; the aspect is the only first-party surface.

## Q3 [decided]: which options carry R12, and how is the merge label handled?

Taken: `batchMax = 0`, `skipQueueIfUpToDate = true`, `requiredChecks = [ "nixbot/nix-eval" "nixbot/nix-build" ]` as module options; the merge label left at the default.

The module maps those three options directly to `GITEA_MQ_BATCH_MAX`, `GITEA_MQ_SKIP_QUEUE_IF_UP_TO_DATE`, and `GITEA_MQ_REQUIRED_CHECKS` in `systemd.services.gitea-mq.environment` (`nix/module.nix`).
`GITEA_MQ_MERGE_LABEL` is not an option, and the module's `environment` attribute set is closed, with no `extraEnv`.
`config.go::Load` defaults the label to `merge-queue`, which is R12's value, so the label holds without configuration.
The only way the label could drift is an override of `systemd.services.gitea-mq.environment.GITEA_MQ_MERGE_LABEL` from another module, so the pinning assertion (Q9) asserts that no such attribute exists rather than asserting a value.

Setting the environment variable directly on the unit was considered and rejected: it would duplicate a default that already holds, and it would create the very override the assertion exists to catch.

## Q4 [decided]: database provisioning and the DynamicUser question

Taken: `services.postgresql.ensureDatabases = [ "gitea-mq" ]` and `ensureUsers = [ { name = "gitea-mq"; ensureDBOwnership = true; } ]` in the aspect, with the module's `DynamicUser = true` left as it is and `databaseUrl` at its default `postgres:///gitea-mq?host=/run/postgresql`.

The module provisions no database; the operator supplies `databaseUrl` (`nix/module.nix`, `databaseUrl` option; `logs/adr-verify/gitea-mq.md` C11).
The unit runs with `DynamicUser = true` and no `User=`, so systemd derives the transient user's name from the unit name, `gitea-mq`.
PostgreSQL's peer authentication over the unix socket maps the connecting OS user name to a role of the same name, so a role named `gitea-mq` authenticates the dynamic user without a password and without a static user.
This is exactly the arrangement Mic92's own GitHub-backend deployment uses, with the comment "DynamicUser resolves to the unit name, so the peer-auth role must match" (`dotfiles/machines/eve/modules/gitea-mq.nix`), and clan-infra's deployment uses the same two lines.

`DynamicUser = false` with a static user was considered and rejected.
It would require overriding the vendored unit's `serviceConfig` and declaring a `users.users.gitea-mq`, which buys nothing peer auth does not already provide, and it would diverge from both reference deployments.
The consequence for credentials is recorded under Q6.

## Q5 [decided]: listener and reverse proxy

Taken: `listenAddr = "127.0.0.1:8092"`, and a hand-written nginx vhost `mq.scientistexperience.net` with `forceSSL`, `enableACME`, and `locations."/".proxyPass` to that address.

The module listens on TCP only, with no socket activation and no unix-socket option (`nix/module.nix`, `listenAddr`).
Its default `:8080` binds every interface on a multi-homed host and collides with the LiveKit JWT service, which `modules/nixos/matrix.nix` binds at port 8080.
Port 8092 is clan-infra's choice for the same service and is unused on magnetite (`rg -n 8092 modules/` finds nothing).
The vhost mirrors the pattern every other vhost on this host uses; the module has no nginx integration of its own, unlike nixbot's, so this is the only option rather than a preference.

## Q6 [decided]: credentials

Taken: two clan vars generators, `gitea-mq-github-app-secret-key` (file `key.pem`, populated by `clan vars set`) and `gitea-mq-github-webhook-secret` (file `secret`, generated with `openssl rand -hex 32`), each naming `gitea-mq.service` in `restartUnits`, and each leaving its file at the default owner `root` and mode `0400`.

The module reads both files through systemd `LoadCredential` (`nix/module.nix`, `serviceConfig.LoadCredential`), which systemd performs as root before the dynamic user exists, so a root-owned file is the correct shape and setting `owner = "gitea-mq"` would fail at activation because no such static user exists.
This differs from `modules/nixos/nixbot.nix`, whose generators set `owner = "nixbot"` for a static user, and the difference is deliberate.

The webhook secret does not need to be pasted into the GitHub UI: `App.SyncHookConfig` patches the App's webhook URL and secret to `<externalUrl>/webhook/github` and the configured secret at every startup (`internal/github/app.go`; README "GitHub setup").
This is the reverse of the nixbot change, where the application's own manifest-generated secret had to be replaced by hand with the generator's value.
The private key has no such shortcut; GitHub generates it and the operator sets it.

## Q7 [decided]: the second GitHub App

Taken: a dedicated App, separate from `sciexp-nixbot`, with repository permissions Contents read and write, Administration read and write, Checks read and write, Pull requests read and write, Commit statuses read, Metadata read, and events `pull_request`, `check_run`, `status`, `installation`, `installation_repositories`.

This is R15 verbatim and matches the README's "GitHub setup" section, which is the only place gitea-mq states its permission set; no machine-readable manifest exists in the repository (`logs/adr-verify/gitea-mq.md` C10).
Reusing `sciexp-nixbot` is rejected for the reason the nixbot change gave for not reusing buildbot's: it would edit the registration a running service depends on, and Contents write and Administration write are two permissions the build service must never hold.
The App's numeric id is a public identifier written into the aspect as `github.appId`, following `modules/nixos/nixbot.nix`.

Registration is a human gate.
gitea-mq offers a helper page, `https://mic92.github.io/gitea-mq/`, which pre-fills the form; the operator may use it or register manually.
The proposed name and owner mirror the sibling: `sciexp-gitea-mq`, owned by the `sciexp` organization, public, installed on `cameronraysmith/vanixiets` alone.
The operator decides at the gate.

## Q8 [decided]: rulesets, the required-check list, and the orchestrator as bypass actor

Taken: the default branch is governed by a ruleset that requires linear history, requires the `gitea-mq` status, names the gitea-mq App and the orchestrator identity `cameronraysmith` as bypass actors, requires no nixbot check at the PR level, and involves no Actions workflow.
The existing `nixbot` ruleset's `nixbot/nix-build` requirement is removed, and the change is presented as a diff for approval before anything is applied.

The required-check list is the reason the nixbot requirement must go, and it is a source fact rather than a preference.
`monitor.go::ResolveRequiredChecks` uses the forge's list when it is non-empty and falls back to `GITEA_MQ_REQUIRED_CHECKS` only when it is empty; `forge.go::GetRequiredChecks` builds the forge's list from rulesets and classic protection and drops only gitea-mq's own contexts.
With `nixbot/nix-build` still required by the ruleset, gitea-mq would take `[nixbot/nix-build]` from the forge and never consult the configured pair, silently dropping `nixbot/nix-eval`.
With only `gitea-mq` required, the forge's list is empty after the own-context filter and the configured pair is operative.

gitea-mq's own `setup.go::EnsureRepoSetup` creates a ruleset named `gitea-mq` when none exists, with the App and repository admins as bypass actors and one rule requiring the `gitea-mq` status on the default branch; on every other branch ruleset it adds the App as bypass actor.
Rather than let startup create a second ruleset beside `nixbot`, the design has the operator apply the approved diff first, so that startup finds a ruleset named `gitea-mq` and returns.

`cameronraysmith` as a bypass actor: rulesets accept `User` as an actor type since GitHub's 2026-05-07 changelog, and repository admins are already a bypass actor on the existing ruleset.
The diff proposes the App as an `Integration` actor and keeps the repository-admin role; whether to add the user actor explicitly beside the admin role is presented at the gate.

V6, which asks whether rulesets accept `refs/landings/*` from the orchestrator and protect them from deletion, is answered in part from documentation: rulesets target branches, tags, pushes, or the repository, not arbitrary ref namespaces, so no ruleset can protect `refs/landings/*`; the accept half is tested at runtime.

## Q9 [decided]: how the settings are pinned

Taken: `assertions` in the aspect that read `config.services.gitea-mq.batchMax`, `.skipQueueIfUpToDate`, and `.requiredChecks` back from the evaluated configuration and compare them to R12's values, plus an assertion that `config.systemd.services.gitea-mq.environment` carries no `GITEA_MQ_MERGE_LABEL` attribute.
The assertions fire in the existing `checks.x86_64-linux.nixos-magnetite`, so no new check attribute is needed.

An assertion in the same aspect that sets the values is not circular, because it reads the merged configuration: an `lib.mkForce` from any other module, or a future edit that changes one value without the other, fails evaluation of the host.
A separate structure check under `modules/checks/structure/` was considered and rejected as a second place to keep the same four values.

## Q10 [decided]: `allow_auto_merge`

Taken: the repository setting stays on, and the orchestrator is its sole enabler.

The ADR's R16 clause says the setting must be off or the orchestrator the sole enabler.
Off is not attainable: `setup.go::EnsureRepoSetup` sets `AllowAutoMerge: true` on every startup, and the App holds Administration write by R15, so any manual switch-off is undone at the next restart.
Removing Administration from the App would skip setup with a warning and leave the ruleset to the operator, but R15 fixes the permission set and the ADR relies on setup for the bypass-actor maintenance.
The repository is user-owned with one collaborator, so the set of identities that can enable auto-merge on a pull request is the orchestrator identity and the Apps holding Pull requests write; the sole-enabler arm holds by the collaborator set, and the verification task records that set.
`allow_auto_merge` is already `true` on `cameronraysmith/vanixiets` today, so the choice changes nothing observable.

## Q11 [decided]: `hideRefFromClients`

Taken: `hideRefFromClients = false`.

The option defaults to `config.services.gitea.enable`, which is true on magnetite because the `gitea` aspect is composed there, and when true the module injects an `ExecStartPre` into `systemd.services.gitea` that edits the Gitea user's global git config (`nix/module.nix`, `mkHideRefsPre`).
This instance manages GitHub repositories only and never creates a `gitea-mq/*` branch on the local Gitea, so the injection would touch a running service's unit for no effect.
Mic92's GitHub-only deployment sets the same value for the same reason.

## Q12 [decided]: hostname

Taken: an unproxied `mq` CNAME to `magnetite.scientistexperience.net` in `modules/terranix/cloudflare.nix`, declared the way `nixbot` is, applied with `just terraform-plan` and `just terraform-apply` before the host is deployed so ACME issuance finds the record.

## Q13 [decided]: which world facts this change depends on

Four indicative facts about gitea-mq and GitHub that no requirement in this change can enforce, each carried as a world-assumption entry with a violation scenario: gitea-mq resolves stacks only through GitHub's Stacks API and reads no `Depends-On:` header (`forge.go::ResolveStack`; no match for `Depends-On` anywhere in the source); GitHub marks a stack member merged when a non-force ref update makes its head reachable from the base (the ADR's V1, unverified, and decisive per the review memo's F-B); gitea-mq enqueues any pull request with auto-merge enabled in addition to labeled ones, and its setup turns `allow_auto_merge` on (`poller.go::enqueueAutoMergePRs`, `setup.go::EnsureRepoSetup`); and gitea-mq takes required checks from the forge's protection first and from its own configured list only when the forge names none (`monitor.go::ResolveRequiredChecks`).
The fourth was not in the memo's list; it is added because Q8 rests on it.

## Q14 [given]: two human gates

G1, App registration: the task presents the registration URL and the manifest values, then the exact `clan vars set` command for the private key and the generation command for the webhook secret, and stops for the operator.
G2, rulesets: the task presents the per-repository ruleset diff for `cameronraysmith/vanixiets` as a before-and-after and stops for approval before applying it.
Both are checkboxes in tasks.md that an agent may not tick.

# Design trade-offs

Peer authentication ties the database role name to the unit name.
Renaming the unit, or setting `User=` on it, silently breaks authentication; the design records this coupling rather than hiding it, and the assertion does not cover it because the module owns the unit name.

The pinning assertion catches drift in the evaluated configuration and nothing at runtime.
A process started outside the unit, or an edit to the unit's environment on the host, is invisible to it; the runtime confirmation tasks exist for that.

The App's Contents write and Administration write are the two most powerful permissions any fleet application holds.
They are bounded by the installation selection, which the machine cannot assert, and the interface capability states that boundary rather than claiming otherwise.

`allow_auto_merge` on means any pull request with auto-merge enabled enters the queue without a label.
The sole-enabler arm is a role rule enforced by the collaborator set, which is world state; the change records it and does not claim a machine guarantee.

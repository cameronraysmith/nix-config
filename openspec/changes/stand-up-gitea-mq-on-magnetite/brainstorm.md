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

The original ADR proposed an orchestrator-built linear rollup on `staging` followed by a labelled-stack landing.
The 2026-09-09 revision of `docs/notes/development/version-control/adr-substitution-first-rollup-landing.md` §Decision retires that rollup: gitea-mq constructs and tests batches, then fast-forwards `main` to the exact tested SHA (`internal/batch/batch.go::Engine.HandlePass`).
This historical decision log records the reversals below; the fleet-composition decisions remain unchanged.
This change stands up the queue on magnetite at `mq.scientistexperience.net`, with its GitHub App, database, reverse proxy, rulesets, and configuration assertions.

The original review memo assigned this change old R12, R15, and R16; the revised ADR Appendix A maps those to R11, R13, and R14 respectively.
It also settles V9 from source: `batchMax`, `requiredChecks`, and `skipQueueIfUpToDate` are first-class options of gitea-mq's NixOS module, the merge label is not exposed but defaults to `merge-queue` in `config.go::Load`, and no environment escape hatch exists in the module.

The sibling change `stand-up-nixbot-on-magnetite` is the shape to match.
It composed nixbot onto magnetite through the repository's deferred-module pattern: a flake input, the upstream module imported at the host in `modules/machines/nixos/magnetite/default.nix`, a first-party aspect `flake.modules.nixos.nixbot` in `modules/nixos/nixbot.nix` named in the host's aspect list, clan vars generators for the App private key and webhook secret, and a `nixbot` CNAME in `modules/terranix/cloudflare.nix`.
nixbot now serves `cameronraysmith/vanixiets` and `sciexp/ironstar` from magnetite, and the repository's default branch is governed by ruleset `16212553`, named `nixbot`, whose sole required status check is `nixbot/nix-build` pinned to integration `4743700`, with repository admins as its only bypass actor.

The gitea-mq source read for this change is the clone at `~/ghq/github.com/Mic92/gitea-mq` at `d44c455`, the revision the ADR pins, and the verification report `logs/adr-verify/gitea-mq.md`; the commit date is unverified.
Two reference deployments were read for the original composition decisions: Mic92's `dotfiles/machines/eve/modules/gitea-mq.nix` (GitHub backend, clan vars) and clan-infra's `modules/web01/gitea-mq.nix` (Gitea backend).

# Decision chain

## Q1 [given]: what is in scope, and what is not?

In scope: the gitea-mq service and deployment resources from R11; a separate GitHub App with the permission and event set from R13; the two-ruleset configuration and `allow_auto_merge` from R14; configuration assertions; and V2, V3, and V9 runtime verification.
`cameronraysmith/vanixiets` is the sole explicit repository and required installation scope; `github.repos` is additive rather than an exclusion filter (design D11).

Out of scope: the authorization procedure and agent instructions (new R15/R16), source filtering and cache warming (R1/R2), `nixbot.toml`, and Appendix B implementation.
The rollup-specific `landing.toml` and V6 landing-ref probe were retired with the rollup protocol.
No upstream filing to gitea-mq will be made anywhere in this work, per the maintainer, so the merge-label option gap and the absent database provisioning are handled in this repository rather than requested upstream.

## Q2 [decided]: how is gitea-mq composed onto magnetite?

Taken: the repository's own pattern, mirrored from nixbot.
A `gitea-mq` flake input following `nixpkgs` and `treefmt-nix` (the module's flake declares exactly those two inputs, `gitea-mq/flake.nix`), `inputs.gitea-mq.nixosModules.default` imported at the host beside `inputs.nixbot.nixosModules.nixbot`, and a first-party aspect `flake.modules.nixos.gitea-mq` in `modules/nixos/gitea-mq.nix` named in magnetite's aspect list.

clan-infra's wrapper form, `flake.nixosModules.<name> = [ upstream ./site.nix ]`, was rejected for the reason the nixbot change already recorded: it is a second composition convention beside an existing one.
The vendored-versus-first-party boundary sits at the flake input: `nix/module.nix` is consumed and never edited; the aspect is the only first-party surface.

## Q3 [decided, revised]: which options carry R11, and how is the merge label handled?

Taken in revision 2: `batchMax = 5`, `skipQueueIfUpToDate = true`, `requiredChecks = [ "nixbot/nix-eval" "nixbot/nix-build" ]` as module options; the merge label left at the default.
This reverses `batchMax = 0`: zero is unlimited batching, not a singleton guarantee (`internal/queue/batch.go::Service.FormBatch`), and five matches all three surveyed GitHub deployments.
Queue-created merge commits preserve the tested-tree property because `internal/batch/batch.go::Engine.HandlePass` calls `Forge.FastForward` with the tested batch SHA.

The module maps those three options directly to `GITEA_MQ_BATCH_MAX`, `GITEA_MQ_SKIP_QUEUE_IF_UP_TO_DATE`, and `GITEA_MQ_REQUIRED_CHECKS` in `systemd.services.gitea-mq.environment` (`nix/module.nix`).
`GITEA_MQ_MERGE_LABEL` is not an option, and the module's `environment` attribute set is closed, with no `extraEnv`.
`internal/config/config.go::Load` defaults the label to `merge-queue`, which is R11's value, so the label holds without configuration.
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
Port 8092 was unused when the original listener decision was made and is clan-infra's choice for this service; it is now the declared gitea-mq listener.
The vhost mirrors the pattern every other vhost on this host uses; the module has no nginx integration of its own, unlike nixbot's, so this is the only option rather than a preference.

## Q6 [decided]: credentials

Taken: two clan vars generators, `gitea-mq-github-app-secret-key` (file `key.pem`, populated by `clan vars set`) and `gitea-mq-github-webhook-secret` (file `secret`, generated with `openssl rand -hex 32`), each naming `gitea-mq.service` in `restartUnits`, and each leaving its file at the default owner `root` and mode `0400`.

The module reads both files through systemd `LoadCredential` (`nix/module.nix`, `serviceConfig.LoadCredential`), which systemd performs as root before the dynamic user exists, so a root-owned file is the correct shape and setting `owner = "gitea-mq"` would fail at activation because no such static user exists.
This differs from `modules/nixos/nixbot.nix`, whose generators set `owner = "nixbot"` for a static user, and the difference is deliberate.

The webhook secret does not need to be pasted into the GitHub UI: `App.SyncHookConfig` patches the App's webhook URL and secret to `<externalUrl>/webhook/github` and the configured secret at every startup (`internal/github/app.go`; README "GitHub setup").
This is the reverse of the nixbot change, where the application's own manifest-generated secret had to be replaced by hand with the generator's value.
The private key has no such shortcut; GitHub generates it and the operator sets it.

## Q7 [decided]: the second GitHub App

Taken: a dedicated App, separate from `sciexp-nixbot`, with repository permissions Contents read and write, Administration read and write, Checks read and write, Pull requests read and write, Commit statuses read, Metadata read, and exactly the subscribable events `check_run`, `pull_request`, `status`.

This is revised R13: the README's permission set still applies, but its event list includes `installation` and `installation_repositories`, which GitHub delivers automatically and does not expose as subscriptions.
The earlier five-event API expectation was wrong and blocked a live gate; `GET /apps/sciexp-gitea-mq` reports exactly the three subscribable events (`logs/adr-verify/adr-corrections-report.md` §R13 App events).
Reusing `sciexp-nixbot` is rejected for the reason the nixbot change gave for not reusing buildbot's: it would edit the registration a running service depends on, and Contents write and Administration write are two permissions the build service must never hold.
The App's numeric id is a public identifier written into the aspect as `github.appId`, following `modules/nixos/nixbot.nix`.

Registration is a human gate.
gitea-mq offers a helper page, `https://mic92.github.io/gitea-mq/`, which pre-fills the form; the operator may use it or register manually.
The proposed name and owner mirror the sibling: `sciexp-gitea-mq`, owned by the `sciexp` organization, public, installed on `cameronraysmith/vanixiets` alone.
The operator decides at the gate.

## Q8 [decided, revised]: two rulesets and the required-check invariant

Taken in revision 2: keep our `nixbot` ruleset `16212553` with `deletion`, `non_fast_forward`, and both nixbot contexts; keep the App's separate `gitea-mq` ruleset requiring only its own context.
The only operator edit at G2 is to add `nixbot/nix-eval` beside the existing `nixbot/nix-build`, both pinned to integration `4743700`; retain the name, existing rules, parameters, and bypass actors.
No `required_linear_history` or classic protection is part of the target configuration.
This reverses the proposed rename, check replacement, linear-history addition, and orchestrator-specific bypass because tested batches may contain merge commits and need no orchestrator landing step.

The required-check coupling is an invariant: `internal/github/forge.go::GetRequiredChecks` unions ruleset and classic contexts minus queue-owned contexts, and `internal/monitor/monitor.go::ResolveRequiredChecks` prefers a non-empty forge list.
Both nixbot contexts must therefore remain in our ruleset; `GITEA_MQ_REQUIRED_CHECKS` is a fallback that does not fire in this configuration.
The earlier inference that `nixbot/nix-build` must be removed was wrong: adding `nixbot/nix-eval` supplies the intended pair directly.

`internal/github/setup.go::EnsureRepoSetup` adds the App bypass actor to other branch-target rulesets and creates its own ruleset if no ruleset named `gitea-mq` exists.
An existing ruleset with that name makes setup return early without repairing it.
Pre-creating a disabled `gitea-mq` ruleset is optional and only controls when the queue context starts blocking; installation adds a second ruleset rather than replacing ours.
This matches the live SBEE-Lab/infra and mulatta/dots observations in the ADR §Deployment survey and live rulesets.

The old V6 `refs/landings/*` probe is retired because that namespace belonged to the abandoned orchestrator protocol.

## Q9 [decided]: how the settings are pinned

Taken: `assertions` in the aspect that read `config.services.gitea-mq.batchMax`, `.skipQueueIfUpToDate`, and `.requiredChecks` back from the evaluated configuration and compare them to R11's values, plus an assertion that `config.systemd.services.gitea-mq.environment` carries no `GITEA_MQ_MERGE_LABEL` attribute.
The assertions fire in the existing `checks.x86_64-linux.nixos-magnetite`, so no new check attribute is needed.

An assertion in the same aspect that sets the values is not circular, because it reads the merged configuration: an `lib.mkForce` from any other module, or a future edit that changes one value without the other, fails evaluation of the host.
A separate structure check under `modules/checks/structure/` was considered and rejected as a second place to keep the same four values.

## Q10 [decided, revised]: `allow_auto_merge` and authorization

Taken: `allow_auto_merge` stays on, as `internal/github/setup.go::EnsureRepoSetup` enables it at every startup.
The original orchestrator-only enabler policy is retired with the rollup.
Risk class determines when authorization is permitted under E1: obtain required review before the enqueue signal, by convention rather than a queue-enforced approval rule.
`internal/poller/poller.go::enqueuePR` gates only on checks, and the App bypasses rulesets to update the ref, so the signal itself is merge authorization.
Shape determines the signal: ordinary trunk PRs use native auto-merge; registered stacks use the `merge-queue` label on the topmost intended PR, never auto-merge on any member.
`internal/poller/poller.go::enqueueAutoMergePRs` targets `pr.BaseBranch` without stack resolution; `labeledTargetBranch` resolves `stack.BaseBranch`.
`PollOnce` runs auto-merge enqueue first and `enqueueLabeledPRs` skips existing entries, so an upper member's auto-merge can silently override a correct top label and target its parent branch.
The sibling authorization work owns the R15/R16 procedure; this change records the interface dependency.

## Q11 [decided]: `hideRefFromClients`

Taken: `hideRefFromClients = false`.

The option defaults to `config.services.gitea.enable`, which is true on magnetite because the `gitea` aspect is composed there, and when true the module injects an `ExecStartPre` into `systemd.services.gitea` that edits the Gitea user's global git config (`nix/module.nix`, `mkHideRefsPre`).
This instance manages GitHub repositories only and never creates a `gitea-mq/*` branch on the local Gitea, so the injection would touch a running service's unit for no effect.
Mic92's GitHub-only deployment sets the same value for the same reason.

## Q12 [decided]: hostname

Taken: an unproxied `mq` CNAME to `magnetite.scientistexperience.net` in `modules/terranix/cloudflare.nix`, declared the way `nixbot` is, applied with `just terraform-plan` and `just terraform-apply` before the host is deployed so ACME issuance finds the record.

## Q13 [decided]: which world facts this change depends on

The revised world-assumption entries retain native stack registration, GitHub member bookkeeping, enqueue-path behaviour, and forge-first required checks, and add batch tested-SHA landing and review blindness.
Sources are `internal/github/forge.go::ResolveStack`, `internal/poller/poller.go::{enqueueAutoMergePRs,labeledTargetBranch,PollOnce,enqueuePR}`, `internal/batch/batch.go::Engine.HandlePass`, and `internal/monitor/monitor.go::ResolveRequiredChecks`.
V1 is now discharged: Mic92/dotfiles #5887–#5890 establish the non-stack case empirically, while the stacked retarget-and-mark mechanism rests on operator confirmation, not a source citation (ADR §Compliance, V1).
Re-confirm every member's head SHA, `merged_at`, and mergify-cli merged detection at the first live stacked landing; V1 no longer blocks promotion.

## Q14 [given]: two human gates

G1, App registration: the task presents the registration URL and the manifest values, then the exact `clan vars set` command for the private key and the generation command for the webhook secret, and stops for the operator.
G2, rulesets: the task presents the per-repository ruleset diff for `cameronraysmith/vanixiets` as a before-and-after and stops for approval before applying it.
Both are checkboxes in tasks.md that an agent may not tick.

# Design trade-offs

Peer authentication ties the database role name to the unit name.
Renaming the unit, or setting `User=` on it, silently breaks authentication; the design records this coupling rather than hiding it, and the assertion does not cover it because the module owns the unit name.

The pinning assertion catches drift in the evaluated configuration and nothing at runtime.
A process started outside the unit, or an edit to the unit's environment on the host, is invisible to it; the runtime confirmation tasks exist for that.

The App's Contents write and Administration write permit ref updates and ruleset changes.
They are bounded by the installation selection, which the machine cannot assert, and the interface capability states that boundary rather than claiming otherwise.

`allow_auto_merge` on means a PR with that signal and successful required checks can enter the queue without a label.
The review-blind queue and App bypass make E1 a convention requiring manual audit; collaborator counts do not prove review or shape compliance.
Source filtering and author cache warming remain sibling responsibilities (R1/R2): from an aarch64-darwin laptop, `just check-fast auto off x86_64-linux 2>&1 | tee logs/checks-linux-$(date +%Y%m%d-%H%M%S).log` uses positional parameters and adds `--remote magnetite.zt --no-download` (`justfile::check-fast`).
Outputs remain in magnetite's store, classified `local` and skipped by nixbot (`build_scheduler.py::JobScheduler._classify`); `just check-fast auto on` populates niks3 for peer darwin laptops and is not needed to warm CI.

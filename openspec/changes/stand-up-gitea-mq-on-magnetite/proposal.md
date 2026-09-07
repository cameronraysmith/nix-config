---
linear_story_id: 548b2575-d1e1-4670-8e26-ed8eff8bcb5a
linear_story_identifier: CAM-56
linear_story_title: "Stand up gitea-mq on magnetite as the landing queue"
linear_story_url: https://linear.app/cameronraysmith/issue/CAM-56/stand-up-gitea-mq-on-magnetite-as-the-landing-queue
linear_story_state: Todo
linear_team: CAM
linear_project: nixbot-herculesci-cicd
last_synced_state: Todo
last_synced_at: 2026-09-07T20:57:01Z
review_round: 0
max_review_rounds: 3
attempt_log:
  - { at: "2026-09-07T20:57:01Z", transition: "Backlog->Todo", outcome: "posted", note: "T1 bind; issue created in the existing project, seeded from this proposal, moved to Todo, one comment posted" }
---

## Why

The substitution-first rollup landing ADR assigns the queue role to gitea-mq, and no instance of it exists in the fleet.
Without one, landings stay synchronous fast-forward pushes gated on every member PR's nixbot build, which is the 2N + 1 build accounting the ADR exists to replace.
This change stands gitea-mq up on magnetite with the settings the ADR fixes, registers the second GitHub App it needs, aligns the repository's rulesets with the landing path, and pins the settings with an evaluation-time assertion, so that the landing protocol change that follows has a queue to land through.

## What Changes

**A merge queue service on magnetite, at its own hostname**
- From: magnetite runs two build services and no merge queue; landing is `stack-land`, a synchronous fast-forward push performed by a person or agent.
- To: gitea-mq runs on magnetite at `mq.scientistexperience.net`, composed the way nixbot is — a `gitea-mq` flake input, the upstream module imported at the host, a first-party aspect `flake.modules.nixos.gitea-mq` named in the host's aspect list, an unproxied `mq` CNAME — fronted by the host's nginx over a loopback port, with its own database on the host's PostgreSQL instance.
- Reason: the ADR's landing path needs a queue that fast-forwards `main` to a stack tip by non-force ref update, and gitea-mq is the one component in the Nix ecosystem that does so while reading nixbot's check runs by name.
- Impact: non-breaking for nixbot and buildbot; a public endpoint, a database, and a unit are added to the host that already runs the forge, the build services, and the binary cache.

**Four settings fixed by the ADR, and pinned**
- From: nothing.
- To: `batchMax = 0`, `skipQueueIfUpToDate = true`, `requiredChecks = [ "nixbot/nix-eval" "nixbot/nix-build" ]`, and the merge label left at gitea-mq's default `merge-queue`; a NixOS assertion in the aspect reads the merged configuration back and fails evaluation of the host if any of the three options drifts or if any module sets `GITEA_MQ_MERGE_LABEL` on the unit.
- Reason: the ADR's single-entry fast-forward path exists only when batching is enabled and the up-to-date shortcut is on; the queue must gate on both of nixbot's contexts; and the merge label is not a module option, so the only drift possible is an override, which is what the assertion catches.
- Impact: any later edit to one of these values, in this aspect or by `lib.mkForce` elsewhere, fails `checks.x86_64-linux.nixos-magnetite`.

**A dedicated GitHub App, separate from nixbot's**
- From: `sciexp-nixbot` holds Contents read, Checks write, Metadata read, Pull requests read, Members read.
- To: a second App holds Contents read and write, Administration read and write, Checks read and write, Pull requests read and write, Commit statuses read, Metadata read, and subscribes to `pull_request`, `check_run`, `status`, `installation`, `installation_repositories`; its private key is an operator-populated clan var and its webhook secret a generated one that the service itself pushes to the App at startup.
- Reason: the queue writes refs and edits rulesets, which are permissions the build service must never hold; adding them to nixbot's App would edit a registration a running service depends on.
- Impact: one more registration to hold and one more credential set to rotate; registration is a human gate.

**Repository rulesets aligned with the landing path**
- From: ruleset `nixbot` on `cameronraysmith/vanixiets` requires `nixbot/nix-build` on the default branch with repository admins as its only bypass actor.
- To: the default branch requires linear history and the `gitea-mq` status, names the gitea-mq App and the orchestrator identity as bypass actors, requires no nixbot check at the pull-request level, and involves no Actions workflow; `allow_auto_merge` stays on with the orchestrator as its sole enabler.
- Reason: gitea-mq takes required checks from the forge's protection when it names any and from its own configured list only when it names none, so a lingering `nixbot/nix-build` requirement would silently drop `nixbot/nix-eval`; and gitea-mq's own setup turns `allow_auto_merge` on at every startup, so off is not attainable.
- Impact: the ruleset diff is presented for approval before it is applied; a pull request that once merged on `nixbot/nix-build` alone now lands only through the queue or a bypass actor.

**Credentials through the fleet's primary secrets system**
- From: nothing.
- To: two clan vars generators, one operator-populated and one generated, each reaching the unit as a systemd credential and restarting it on rotation, with no credential value in the repository.
- Reason: the fleet already has one answer for this and the module consumes both secrets as file paths.
- Impact: two encrypted entries under the machine's vars tree.

## Capabilities

### New Capabilities
- `merge-queue-service` (stratum: `behavioral`): what the fleet requires of a merge queue standing beside its build service — that it is reachable at its own hostname, that it lands one up-to-date stack at a time by fast-forward with no merge commit, that it gates on the build service's two verdicts and nothing else, that it acts under an identity separate from the build service's, that only the orchestrator can put a change into it, that its credentials are operator-supplied and never legible in the repository, that one activation establishes it, and that its landing settings cannot drift unnoticed.
- `merge-queue-interface` (stratum: `interface`): the properties at the machine's interface that discharge those requirements — a distinct hostname served over TLS proxied to a loopback port, the four settings as evaluated option values guarded by an assertion, a database and role provisioned for the unit's dynamic user, credentials present only as activation-resolved systemd credentials, the forge application's permission and event set, the ruleset contents, and the webhook endpoint the service registers for itself. Its trust boundary is stated in the capability: the installation selection, the collaborator set that bounds who can enable auto-merge, and GitHub's marking of fast-forwarded stack members as merged are all outside what this machine can assert; the shared nginx, PostgreSQL, and ACME account remain common-mode surfaces; and the assertion guards the evaluated configuration, not the running process.

### Modified Capabilities
- `world-assumptions` (stratum: `world`): four assumptions are added — gitea-mq resolves stacks only through GitHub's Stacks API; GitHub marks a fast-forwarded stack member merged; gitea-mq enqueues auto-merge-enabled pull requests and its setup enables `allow_auto_merge`; gitea-mq takes required checks from the forge's protection before its own list — and the designation table gains the terms the new behavioral requirements use.

## Impact

Implementation touches: a new `flake.modules.nixos.gitea-mq` aspect at `modules/nixos/gitea-mq.nix` carrying the service configuration, the PostgreSQL provisioning, the nginx vhost, the two generators, and the pinning assertions; the `gitea-mq` flake input in `flake.nix` and its lock entry; `modules/machines/nixos/magnetite/default.nix` to import `inputs.gitea-mq.nixosModules.default` and name `gitea-mq` in the aspect list; two entries under `vars/per-machine/magnetite/`; an `mq` CNAME in `modules/terranix/cloudflare.nix`; the ruleset on `cameronraysmith/vanixiets`, edited by the operator after approving a diff; and a documentation note on the queue's place in the build-service topology.

Nothing under `modules/nixos/nixbot.nix`, `modules/nixos/buildbot.nix`, their generators, vhosts, or databases is edited, and the `sciexp-nixbot` application is not touched.

Out of scope, each its own later change: the landing protocol in agent instructions and the `git-stacked-pr-integration` skill, `landing.toml`, `nixbot.toml`, the `refs/landings/*` provenance refs beyond the V6 observation recorded here, and any second repository in the allowlist.
No upstream filing to gitea-mq is made anywhere in this work.

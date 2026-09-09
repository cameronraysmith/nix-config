---
linear_story_id: 548b2575-d1e1-4670-8e26-ed8eff8bcb5a
linear_story_identifier: CAM-56
linear_story_title: "Stand up gitea-mq on magnetite as the landing queue"
linear_story_url: https://linear.app/cameronraysmith/issue/CAM-56/stand-up-gitea-mq-on-magnetite-as-the-landing-queue
linear_story_state: Todo
linear_team: CAM
linear_project: nixbot-herculesci-cicd
last_synced_state: In Progress
last_synced_at: 2026-09-09T02:22:29.595Z
review_round: 0
max_review_rounds: 3
attempt_log:
  - {"at":"2026-09-09T02:22:29.595Z","transition":"In Progress","outcome":{"kind":"TransitionObserved","comment":"Posted"}}
  - {"at":"2026-09-09T01:55:45.174Z","transition":"In Progress","outcome":{"kind":"TransitionObserved","comment":"Posted"}}
  - {"at":"2026-09-09T01:38:25.315Z","transition":"In Progress","outcome":{"kind":"TransitionObserved","comment":"Posted"}}
  - {"at":"2026-09-09T01:28:25.208Z","transition":"In Progress","outcome":{"kind":"TransitionObserved","comment":"Posted"}}
  - {"at":"2026-09-09T00:56:17.552Z","transition":"In Progress","outcome":{"kind":"TransitionObserved","comment":"Posted"}}
  - {"at":"2026-09-09T00:30:35.982Z","transition":"In Progress","outcome":{"kind":"TransitionObserved","comment":"Posted"}}
  - {"at":"2026-09-08T23:54:53.585Z","transition":"In Progress","outcome":{"kind":"TransitionObserved","comment":"Posted"}}
  - {"at":"2026-09-08T22:48:25.262Z","transition":"In Progress","outcome":{"kind":"TransitionObserved","comment":"Posted"}}
  - {"at":"2026-09-08T22:32:49.425Z","transition":"In Progress","outcome":{"kind":"TransitionObserved","comment":"Posted"}}
  - {"at":"2026-09-08T22:23:05.657Z","transition":"In Progress","outcome":{"kind":"TransitionObserved","comment":"Posted"}}
  - {"at":"2026-09-08T21:58:27.181Z","transition":"In Progress","outcome":{"kind":"TransitionObserved","comment":"Posted"}}
  - {"at":"2026-09-08T21:09:34.673Z","transition":"In Progress","outcome":{"kind":"TransitionObserved","comment":"Posted"}}
  - {"at":"2026-09-08T17:30:46.247Z","transition":"In Progress","outcome":{"kind":"TransitionObserved","comment":"Posted"}}
  - { at: "2026-09-07T20:57:01Z", transition: "Backlog->Todo", outcome: "posted", note: "T1 bind; issue created in the existing project, seeded from this proposal, moved to Todo, one comment posted" }
---

## Why

The substitution-first landing ADR assigns the queue role to gitea-mq, and no instance of it exists in the fleet.
Without one, landing stays a synchronous fast-forward push gated on every member PR's nixbot build, with a person or agent waiting through it.
This change stands gitea-mq up on magnetite with the settings the ADR fixes, registers the second GitHub App it needs, adds the one check context our default-branch ruleset is missing, and pins the settings with an evaluation-time assertion, so that the landing protocol change that follows has a queue to land through.
This change owns revised ADR R11 (service, database, proxy), R13 (App), and R14 (two rulesets).
The 2026-09-09 ADR revision retires the orchestrator rollup onto `staging` because the batch engine fast-forwards to the tested batch SHA; risk-based review and shape-specific signals are sibling R15/R16 procedure.

## What Changes

**A merge queue service on magnetite, at its own hostname**
- From: magnetite runs two build services and no merge queue; landing is `stack-land`, a synchronous fast-forward push performed by a person or agent.
- To: gitea-mq runs on magnetite at `mq.scientistexperience.net`, composed the way nixbot is — a `gitea-mq` flake input, the upstream module imported at the host, a first-party aspect `flake.modules.nixos.gitea-mq` named in the host's aspect list, an unproxied `mq` CNAME — fronted by the host's nginx over a loopback port, with its own database on the host's PostgreSQL instance.
- Reason: the queue constructs batches, reads nixbot's required check contexts, and fast-forwards the default branch to the exact tested batch SHA (`internal/batch/batch.go::Engine.HandlePass`), including tested merge commits.
- Impact: non-breaking for nixbot and buildbot; a public endpoint, a database, and a unit are added to the host that already runs the forge, the build services, and the binary cache.

**Four settings fixed by the ADR, and pinned**
- From: nothing.
- To: `batchMax = 5`, `skipQueueIfUpToDate = true`, `requiredChecks = [ "nixbot/nix-eval" "nixbot/nix-build" ]`, and the merge label left at gitea-mq's default `merge-queue`; a NixOS assertion in the aspect reads the merged configuration back and fails evaluation of the host if any of the three options drifts or if any module sets `GITEA_MQ_MERGE_LABEL` on the unit.
- Reason: gitea-mq's batch engine fast-forwards the target to the exact commit CI tested (`internal/batch/batch.go::Engine.HandlePass` calling `internal/github/forge.go::FastForward`), so testing up to five entries together preserves the tested tree the substitution argument depends on; five is the value all three surveyed GitHub deployments use. The up-to-date shortcut lets a single ready entry land its own head without a further build. The configured checks are a fallback the queue consults only when the forge names none, and the merge label is not a module option, so the only drift possible there is an override, which is what the fourth assertion catches.
- Impact: any later edit to one of these values, in this aspect or by `lib.mkForce` elsewhere, fails `checks.x86_64-linux.nixos-magnetite`.

**A dedicated GitHub App, separate from nixbot's**
- From: `sciexp-nixbot` holds Contents read, Checks write, Metadata read, Pull requests read, Members read.
- To: a second App holds Contents read and write, Administration read and write, Checks read and write, Pull requests read and write, Commit statuses read, Metadata read, and subscribes to exactly `check_run`, `pull_request`, and `status`; GitHub delivers `installation` and `installation_repositories` to every App automatically and exposes neither as a subscribable event, so neither belongs in the App's `events` array. Its private key is an operator-populated clan var and its webhook secret a generated one that the service itself pushes to the App at startup.
- Reason: the queue writes refs and edits rulesets, which are permissions the build service must never hold; adding them to nixbot's App would edit a registration a running service depends on.
- Impact: one more registration to hold and one more credential set to rotate; registration is a human gate.

**One check context added to our ruleset, and a second ruleset created by the queue**
- From: ruleset `16212553` on `cameronraysmith/vanixiets` carries `deletion`, `non_fast_forward`, and required check `nixbot/nix-build` pinned to App `4743700`, with repository admins as its only bypass actor.
- To: the same ruleset, with `nixbot/nix-eval` added beside `nixbot/nix-build`; nothing renamed, nothing removed, no linear-history rule, and no classic branch protection. The queue's own startup setup creates a second ruleset named `gitea-mq` carrying only its own status, adds its App as a bypass actor on ours, and leaves `allow_auto_merge` on.
- Reason: `internal/github/forge.go::GetRequiredChecks` unions ruleset and classic contexts minus queue-owned contexts, and `internal/monitor/monitor.go::ResolveRequiredChecks` prefers a non-empty forge list. Both nixbot contexts must stay in ours, making the configured fallback inactive. This matches the live SBEE-Lab/infra and mulatta/dots pattern. `internal/github/setup.go::EnsureRepoSetup` adds App bypass to ours and creates its own second ruleset if absent; an existing `gitea-mq` name makes it return without repairing or activating that ruleset.
- Impact: the ruleset diff is presented for approval before it is applied, and it adds one required context and removes nothing. A pull request that once merged on `nixbot/nix-build` alone now needs both contexts, and the queue's own context once its ruleset exists.

**Credentials through the fleet's primary secrets system**
- From: nothing.
- To: two clan vars generators, one operator-populated and one generated, each reaching the unit as a systemd credential and restarting it on rotation, with no credential value in the repository.
- Reason: the fleet already has one answer for this and the module consumes both secrets as file paths.
- Impact: two encrypted entries under the machine's vars tree.

## Capabilities

### New Capabilities
- `merge-queue-service` (stratum: `behavioral`): queue reachability, tested-SHA batch landing, both nixbot verdicts, a separate App identity, documented merge-authorization signals and review-blind boundary, secret handling, declarative activation, and pinned settings. The earlier orchestrator-only authorization requirement is retired; E1 review-before-signal and ordinary-PR auto-merge versus registered-stack top label are sibling procedure, with auto-merge prohibited on every stack member.
- `merge-queue-interface` (stratum: `interface`): the properties at the machine's interface that discharge those requirements — a distinct hostname served over TLS proxied to a loopback port, the four settings as evaluated option values guarded by an assertion, a database and role provisioned for the unit's dynamic user, credentials present only as activation-resolved systemd credentials, the forge application's permission and event set, the two rulesets governing the default branch, and the webhook endpoint the service registers for itself. Its trust boundary is stated in the capability: the installation selection, the collaborator set that bounds who can enable auto-merge, and GitHub's marking of fast-forwarded stack members as merged are all outside what this machine can assert; the shared nginx, PostgreSQL, and ACME account remain common-mode surfaces; and the assertion guards the evaluated configuration, not the running process.

### Modified Capabilities
- `world-assumptions` (stratum: `world`): seven assumptions are added — gitea-mq resolves stacks only through GitHub's Stacks API; GitHub marks a fast-forwarded stack member merged; gitea-mq enqueues auto-merge-enabled pull requests and its setup enables `allow_auto_merge`; gitea-mq takes required checks from the forge's protection before its own list; the batch engine advances the target to the exact tested commit; the queue is review-blind, so the enqueue signal is the merge authorization; and native stack members are based on one another — and the designation table gains the terms the new behavioral requirements use.

## Impact

Implementation touches: a new `flake.modules.nixos.gitea-mq` aspect at `modules/nixos/gitea-mq.nix` carrying the service configuration, the PostgreSQL provisioning, the nginx vhost, the two generators, and the pinning assertions; the `gitea-mq` flake input in `flake.nix` and its lock entry; `modules/machines/nixos/magnetite/default.nix` to import `inputs.gitea-mq.nixosModules.default` and name `gitea-mq` in the aspect list; two entries under `vars/per-machine/magnetite/`; an `mq` CNAME in `modules/terranix/cloudflare.nix`; ruleset `16212553` on `cameronraysmith/vanixiets`, to which the operator adds `nixbot/nix-eval` after approving the diff; and a documentation note on the queue's place in the build-service topology.

Nothing under `modules/nixos/nixbot.nix`, `modules/nixos/buildbot.nix`, their generators, vhosts, or databases is edited, and the `sciexp-nixbot` application is not touched.

Out of scope: sibling R1/R2 source filtering and cache warming, R15/R16 authorization instructions and skill, `nixbot.toml` changes, and a second repository in the installation scope.
The former `landing.toml`, `refs/landings/*`, and V6 probe belonged to the retired rollup and are no longer planned here.
No upstream filing to gitea-mq is made anywhere in this work.
